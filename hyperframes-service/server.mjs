// HyperFrames render service — Express API (ASYNC)
//
//   POST /render { template, variables, quality }
//        → 202 { jobId }            (returns immediately; render runs in background)
//   GET  /jobs/:jobId
//        → { status, url?, error?, durationSec?, sizeBytes? }
//   GET  /health
//
// Why async: a render takes ~40-120s; the app runs on Vercel (~60s request cap),
// so a synchronous call would time out. The app polls /jobs/:id for the URL.
//
// Output URL: uploaded to Supabase Storage (durable, recommended for prod). If
// Supabase env is not set, falls back to serving the file from this service over
// HTTP (GET /files/:name) so the async flow is still testable locally.
import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8080;
const RENDER_TOKEN = process.env.RENDER_TOKEN || "";
const HF_VERSION = "0.6.63"; // pinned to match demo + templates
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "videos";
const RENDER_TIMEOUT_MS = 600_000; // VPS 2-vCPU không GPU render software ~0.5–0.65s/frame → 1080×1920×20s cần ~6–7 phút. Nới 10 phút cho kịp.
const JOB_TTL_MS = 60 * 60 * 1000; // keep finished jobs for 1h, then prune
// Base URL the file fallback advertises (only used when Supabase is not configured).
const SELF_PUBLIC_URL = (process.env.SELF_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");

const ALLOWED_TEMPLATES = new Set(["animation", "broll"]);
const ALLOWED_QUALITY = new Set(["draft", "standard", "high"]);
const COMP_DIR = path.join(__dirname, "compositions");
const FILES_DIR = path.join(__dirname, "renders", "out"); // local fallback output

const supabase =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }) : null;

// ── In-memory job store (lost on restart — acceptable for this phase) ──
// jobId -> { status: "queued"|"rendering"|"done"|"failed", url?, error?, durationSec?, sizeBytes?, createdAt }
const jobs = new Map();
function setJob(id, patch) {
  const prev = jobs.get(id) || { createdAt: Date.now() };
  jobs.set(id, { ...prev, ...patch });
}
function pruneJobs() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - (j.createdAt || 0) > JOB_TTL_MS) jobs.delete(id);
}

// ── Single-render mutex (2 vCPU VPS — never run two renders at once) ──
let renderChain = Promise.resolve();
function withRenderLock(fn) {
  const run = renderChain.then(fn, fn);
  renderChain = run.then(() => {}, () => {}); // keep chain alive, swallow to avoid unhandled rejection
  return run;
}

// ── ffprobe duration (seconds) ──
async function probeDuration(file) {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const d = parseFloat(String(stdout).trim());
    return Number.isFinite(d) ? Math.round(d * 100) / 100 : null;
  } catch {
    return null;
  }
}

// Escape a string for safe insertion into a double-quoted HTML attribute.
function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Parse a variable that may already be an array or a JSON-encoded string. Returns
// [] on anything malformed (never throws).
function safeJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || !v.trim()) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// The renderer scans STATIC compile-time HTML for both clip duration and audio
// sources — a script setAttribute/.src is too late (silent audio, wrong length).
// So for any composition that takes a voice-over (animation + broll) we bake into
// the static HTML:
//   • root clip data-duration       → render length
//   • <audio id="vo"> data-duration → audio track length
//   • <audio id="vo"> src           → the voice-over actually muxes
// (animation additionally scales its scene windows by duration at runtime — that
//  is visual-clip visibility which the framework reads from the live DOM.)
function patchComposition(html, durationSec, voiceUrl) {
  let out = html
    .replace(/(id="root"[\s\S]*?data-duration=")[^"]*(")/, `$1${durationSec}$2`)
    .replace(/(id="vo"[^>]*?data-duration=")[^"]*(")/, `$1${durationSec}$2`);
  if (voiceUrl && String(voiceUrl).trim()) {
    out = out.replace(/(id="vo"[^>]*?\ssrc=")[^"]*(")/, `$1${escAttr(voiceUrl)}$2`);
  }
  return out;
}

// broll: inject N footage stills as STATIC <img> elements into #bglayer (the
// renderer's media pass scans compile-time HTML, so a script-set .src is too
// late). Images load instantly (vs remote Pexels VIDEO which buffers/seeks every
// frame → timeout/OOM on a 2-vCPU VPS), and Ken Burns gives them motion. Each
// image is sequential — cumulative start, its own data-duration. Last image
// extends to cover any rounding gap so footage never cuts to gradient early.
function injectBrollImages(html, bgUrls, shotDurations, totalDur) {
  if (!Array.isArray(bgUrls) || bgUrls.length === 0) return html; // no footage → template gradient fallback
  // Resolve per-image durations: use shotDurations if valid, else split evenly.
  let durs = Array.isArray(shotDurations) && shotDurations.length === bgUrls.length
    ? shotDurations.map((d) => Number(d)).map((d) => (Number.isFinite(d) && d > 0 ? d : 0))
    : [];
  if (durs.length !== bgUrls.length || durs.some((d) => d <= 0)) {
    const even = totalDur / bgUrls.length;
    durs = bgUrls.map(() => even);
  }
  let start = 0;
  const tags = bgUrls.map((url, i) => {
    const isLast = i === bgUrls.length - 1;
    // last image holds to the end (cover rounding); others use their own dur.
    const dur = isLast ? Math.max(0.1, totalDur - start) : durs[i];
    const s = Math.round(start * 1000) / 1000;
    const d = Math.round(dur * 1000) / 1000;
    start += durs[i];
    // track-index i so overlapping crossfade tails layer correctly.
    return `<img id="bgv${i}" class="bg clip" data-bg-index="${i}" data-start="${s}" data-duration="${d}" data-track-index="${i}" src="${escAttr(url)}">`;
  });
  // Insert the image tags inside #bglayer (replace its empty body).
  return html.replace(/(<div id="bglayer">)(\s*<\/div>)/, `$1${tags.join("")}</div>`);
}

// ── core render: returns { tmpDir, outFile } ; caller cleans up tmpDir ──
async function renderTemplate({ template, variables, quality }) {
  // TỐI ƯU TỐC ĐỘ ($0): B-roll nặng (5 ảnh + Ken Burns) render software trên VPS
  // 2-vCPU rất chậm → ép "draft" cho NHANH hơn nhiều (đủ đẹp cho ảnh nền + caption).
  // C1/C3 nhẹ hơn → giữ "standard". Bỏ override này nếu nâng VPS để lấy chất lượng cao.
  const q = template === "broll" ? "draft" : quality;
  const id = crypto.randomBytes(8).toString("hex");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-"));
  const varsFile = path.join(tmpDir, "vars.json");
  const outFile = path.join(tmpDir, `${template}-${id}.mp4`);

  await fs.writeFile(varsFile, JSON.stringify(variables ?? {}), "utf8");

  // This CLI (0.6.63) rejects a bare file path — render the project dir (".") and
  // select the composition with --composition. `template` is whitelisted by
  // ALLOWED_TEMPLATES, so it can never escape compositions/.
  let compRel = `compositions/${template}.html`;
  let tempEntryAbs = null;

  // animation + broll: bake duration + voice src into a temp copy kept INSIDE
  // compositions/ (so the template's ../assets and ../vendor relative URLs still
  // resolve). ALLOWED_TEMPLATES = {animation, broll}, so this covers both.
  if (template === "animation" || template === "broll") {
    const dur = Number(variables?.duration);
    const hasVoice = variables?.voice_url && String(variables.voice_url).trim();
    // broll also carries footage clips (bg_urls) → inject static <video> tags.
    const bgUrls = template === "broll" ? safeJsonArray(variables?.bg_urls) : [];
    const needsBake = (Number.isFinite(dur) && dur > 0) || hasVoice || bgUrls.length > 0;
    if (needsBake) {
      const src = await fs.readFile(path.join(COMP_DIR, `${template}.html`), "utf8");
      const fallback = template === "broll" ? 12 : 18.5; // each template's base length
      const durSec = Number.isFinite(dur) && dur > 0 ? Math.min(dur, 600) : fallback; // hard cap 10 min
      let patched = patchComposition(src, durSec, hasVoice ? variables.voice_url : "");
      if (template === "broll" && bgUrls.length > 0) {
        const shotDurations = safeJsonArray(variables?.shot_durations);
        patched = injectBrollImages(patched, bgUrls, shotDurations, durSec);
      }
      tempEntryAbs = path.join(COMP_DIR, `.render-${id}.html`);
      await fs.writeFile(tempEntryAbs, patched, "utf8");
      compRel = `compositions/.render-${id}.html`;
    }
  }

  // spawn via array args (NO shell) — variables go through a file, never the command line.
  const args = [
    "--yes",
    `hyperframes@${HF_VERSION}`,
    "render",
    ".",
    "--composition", compRel,
    "--variables-file", varsFile,
    "--quality", q,
    "--output", outFile,
    // VPS KHÔNG có GPU thật → auto-probe chọn "hardware" (SwiftShader) rồi CRASH khi
    // render cảnh nặng (broll: 5 ảnh + Ken Burns + grain + transitions). Ép SOFTWARE
    // (SwiftShader thuần) cho ỔN ĐỊNH (chậm hơn chút nhưng không crash GPU).
    "--no-browser-gpu",
  ];
  try {
    await execFileP("npx", args, {
      cwd: __dirname,
      timeout: RENDER_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env },
    });
  } catch (e) {
    // Surface the real render failure in `docker compose logs` (CLI stderr is the
    // useful part — "Command failed" alone is opaque). Then rethrow so the job
    // is marked failed with the message.
    console.error("[render-fail]", e?.stderr || e?.message || e);
    throw e;
  } finally {
    if (tempEntryAbs) await fs.rm(tempEntryAbs, { force: true }).catch(() => {});
  }

  return { tmpDir, outFile };
}

// Store a finished MP4 and return a public URL: Supabase if configured, else a
// locally-served file (GET /files/:name) so async still works for local testing.
async function storeOutput(outFile, template) {
  const stat = await fs.stat(outFile);
  const durationSec = await probeDuration(outFile);
  if (supabase) {
    const buf = await fs.readFile(outFile);
    const key = `hyperframes/${template}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.mp4`;
    const { error: upErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(key, buf, { contentType: "video/mp4", upsert: false });
    if (upErr) throw new Error(`Supabase upload: ${upErr.message}`);
    const { data: pub } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
    return { url: pub.publicUrl, durationSec, sizeBytes: stat.size };
  }
  // Local fallback: copy into renders/out and serve over HTTP.
  await fs.mkdir(FILES_DIR, { recursive: true });
  const name = `${template}-${crypto.randomUUID()}.mp4`;
  await fs.copyFile(outFile, path.join(FILES_DIR, name));
  return { url: `${SELF_PUBLIC_URL}/files/${name}`, durationSec, sizeBytes: stat.size };
}

// ── Bearer auth (constant-time) ──
function checkAuth(req) {
  if (!RENDER_TOKEN) return { ok: false, code: 500, error: "RENDER_TOKEN chưa cấu hình trên server" };
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(RENDER_TOKEN);
  const okToken = a.length === b.length && crypto.timingSafeEqual(a, b);
  return okToken ? { ok: true } : { ok: false, code: 401, error: "Unauthorized" };
}

const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, templates: [...ALLOWED_TEMPLATES], storage: supabase ? "supabase" : "file", mode: "async" });
});

app.post("/render", (req, res) => {
  const auth = checkAuth(req);
  if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error });

  // ── validate input ──
  const { template, variables, quality = "standard" } = req.body || {};
  if (!ALLOWED_TEMPLATES.has(template))
    return res.status(400).json({ ok: false, error: `template không hợp lệ (chỉ: ${[...ALLOWED_TEMPLATES].join(", ")})` });
  if (!ALLOWED_QUALITY.has(quality))
    return res.status(400).json({ ok: false, error: `quality không hợp lệ (chỉ: ${[...ALLOWED_QUALITY].join(", ")})` });
  if (variables != null && (typeof variables !== "object" || Array.isArray(variables)))
    return res.status(400).json({ ok: false, error: "variables phải là object" });

  pruneJobs();
  const jobId = crypto.randomUUID();
  setJob(jobId, { status: "queued", createdAt: Date.now() });

  // Run in the background — DO NOT await. Mutex serializes renders (2 vCPU box).
  withRenderLock(async () => {
    setJob(jobId, { status: "rendering" });
    const { tmpDir, outFile } = await renderTemplate({ template, variables, quality });
    try {
      const { url, durationSec, sizeBytes } = await storeOutput(outFile, template);
      setJob(jobId, { status: "done", url, durationSec, sizeBytes });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }).catch((e) => {
    setJob(jobId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
  });

  return res.status(202).json({ jobId });
});

app.get("/jobs/:jobId", (req, res) => {
  const auth = checkAuth(req);
  if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error });
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: "Job không tồn tại (hoặc đã hết hạn)" });
  const { status, url, error, durationSec, sizeBytes } = job;
  return res.json({ status, url, error, durationSec, sizeBytes });
});

// Local fallback file server (only meaningful when Supabase is not configured).
app.get("/files/:name", (req, res) => {
  const name = req.params.name;
  if (!/^[a-zA-Z0-9._-]+\.mp4$/.test(name)) return res.status(400).end(); // no path traversal
  const file = path.join(FILES_DIR, name);
  res.setHeader("Content-Type", "video/mp4");
  const stream = createReadStream(file);
  stream.on("error", () => { if (!res.headersSent) res.status(404).end(); });
  stream.pipe(res);
});

app.listen(PORT, () => {
  console.log(`[hf-render] listening on :${PORT} · storage=${supabase ? "supabase" : "file"} · async · hyperframes@${HF_VERSION}`);
});
