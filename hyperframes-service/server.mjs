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
import { assessFrame } from "./lib/vision.mjs";
import { renderWithPlaywright } from "./lib/render-engine.mjs";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8080;
const RENDER_TOKEN = process.env.RENDER_TOKEN || "";
const HF_VERSION = "0.6.63"; // pinned to match demo + templates
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "videos";
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS) || 900_000; // 2B+2C: 3 vòng QC + ảnh gpt-image high có thể lâu → nới 15 phút (override qua env).
const JOB_TTL_MS = 60 * 60 * 1000; // keep finished jobs for 1h, then prune
// Base URL the file fallback advertises (only used when Supabase is not configured).
const SELF_PUBLIC_URL = (process.env.SELF_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");

const ALLOWED_TEMPLATES = new Set(["animation", "broll"]);
const ALLOWED_QUALITY = new Set(["draft", "standard", "high"]);
// Phase 3: lõi render. "cli" = npx hyperframes (mặc định, như cũ — zero-risk);
// "playwright" = frame-stepping Playwright+ffmpeg tự chủ (lib/render-engine.mjs).
const RENDER_ENGINE = (process.env.RENDER_ENGINE || "cli").toLowerCase();
const RENDER_FPS = Math.max(12, Math.min(30, Number(process.env.RENDER_FPS) || 24));
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

// ── Render semaphore (Phase 3): concurrency CẤU HÌNH ĐƯỢC qua RENDER_CONCURRENCY.
//    Default 1 = mutex như cũ (AN TOÀN cho VPS 2 vCPU — đừng ngây thơ chạy 3 render
//    nặng cùng lúc trên 2 core; nâng VPS rồi hãy tăng). ──
const RENDER_CONCURRENCY = Math.max(1, Number(process.env.RENDER_CONCURRENCY) || 1);
let renderActive = 0;
const renderQueue = [];
function withRenderLock(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      renderActive++;
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      } finally {
        renderActive--;
        const next = renderQueue.shift();
        if (next) next();
      }
    };
    if (renderActive < RENDER_CONCURRENCY) run();
    else renderQueue.push(run);
  });
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

// ffmpeg atempo chỉ nhận [0.5, 2.0] mỗi lần → nối chuỗi cho factor ngoài dải.
function buildAtempoChain(factor) {
  let r = factor, parts = [];
  while (r > 2.0) { parts.push("atempo=2.0"); r /= 2.0; }
  while (r < 0.5) { parts.push("atempo=0.5"); r /= 0.5; }
  parts.push(`atempo=${r.toFixed(4)}`);
  return parts.join(",");
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
  // Khử ẢNH TRÙNG (cùng src liền kề — cache có thể trả cùng URL cho 2 shot) → gộp
  // vào clip trước (cộng dồn duration) thay vì tạo 2 <img> trùng src/timing. Giữ
  // NGUYÊN tổng thời lượng; chỉ bỏ phần media-discovery trùng.
  {
    const u = [];
    const ud = [];
    for (let i = 0; i < bgUrls.length; i++) {
      if (u.length && u[u.length - 1] === bgUrls[i]) {
        ud[ud.length - 1] += durs[i];
      } else {
        u.push(bgUrls[i]);
        ud.push(durs[i]);
      }
    }
    bgUrls = u;
    durs = ud;
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
  // C2 broll + C3 animation đều motion-graphics → "draft" nhanh hơn nhiều, gần như không
  // khác mắt thường (perf guide HyperFrames). Chỉ C1/khác giữ quality truyền vào.
  const q = ["broll", "animation"].includes(template) ? "draft" : quality;
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
      // animation: bake ảnh cutout hero vào static src (media pass scan compile-time →
      // runtime setAttribute là quá muộn). Rỗng → giữ src="" → runtime JS tự remove imgHero.
      if (template === "animation") {
        const hero = variables?.img_hero;
        if (hero && String(hero).trim())
          patched = patched.replace(/(id="imgHero"[^>]*?\ssrc=")[^"]*(")/, `$1${escAttr(hero)}$2`);
      }
      tempEntryAbs = path.join(COMP_DIR, `.render-${id}.html`);
      await fs.writeFile(tempEntryAbs, patched, "utf8");
      compRel = `compositions/.render-${id}.html`;
    }
  }

  // ── Lõi PLAYWRIGHT (Phase 3, RENDER_ENGINE=playwright): frame-stepping tự chủ.
  //    Vẫn dùng bản HTML đã bake (ảnh b-roll tĩnh cần cho media); audio do engine
  //    tự mux từ variables.voice_url; duration đọc từ variables. ──
  if (RENDER_ENGINE === "playwright") {
    try {
      await renderWithPlaywright({
        entryHtmlAbs: path.join(__dirname, compRel),
        variables: variables ?? {},
        quality: q,
        outFile,
        fps: RENDER_FPS,
      });
      return { tmpDir, outFile };
    } catch (e) {
      console.error("[render-fail-playwright]", e?.message || e);
      throw e;
    } finally {
      if (tempEntryAbs) await fs.rm(tempEntryAbs, { force: true }).catch(() => {});
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
    // Dùng CẢ 2 vCPU: mặc định 2-core → 1 worker (render đơn luồng). 2 worker (~256MB/worker,
    // RAM 8GB dư) → capture song song ≈ nhanh ~1.5–2×. Mutex withRenderLock đã đảm bảo
    // chỉ 1 job render/lúc nên 2 worker không tranh tài nguyên với render khác.
    "--workers", "2",
    // 24fps (cinematic) — GIỮ để KHÔNG giảm độ mượt/chất lượng (Tommy yêu cầu). Tăng tốc lấy từ
    // tắt vision-QC (render 1 lần) + bỏ filter:blur, KHÔNG hạ fps. (Hạ 20/18 nếu sau này cần nhanh hơn.)
    "--fps", "24",
    // VPS KHÔNG có GPU thật → auto-probe chọn "hardware" (SwiftShader) rồi CRASH khi
    // render cảnh nặng. Ép SOFTWARE (SwiftShader thuần) cho ỔN ĐỊNH.
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

// ── Vision-QC pipeline (2B-fix): ảnh do APP sinh & gửi URL (img_hero) — VPS KHÔNG gọi OpenAI
//    (Cloudflare edge OpenAI chặn IP datacenter VPS). VPS chỉ render + chấm QC nhẹ. ──
const QC_FRAME_MARKS = [0.15, 0.45, 0.8]; // 3 mốc → tối đa 3×2=6 call Gemini/clip (đỡ đốt quota)

async function extractFrame(outFile, t) {
  const f = path.join(os.tmpdir(), `frm-${crypto.randomBytes(5).toString("hex")}.png`);
  try {
    await execFileP("ffmpeg", ["-y", "-ss", String(t), "-i", outFile, "-frames:v", "1", "-q:v", "3", f], {
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    const buf = await fs.readFile(f);
    return buf.toString("base64");
  } finally {
    await fs.rm(f, { force: true }).catch(() => {});
  }
}

// Ngưỡng re-render: CHỈ render lại khi điểm < 6 (layout thảm hoạ thật sự). Render mềm trên
// 2 vCPU ~10 phút/lần → re-render vì 7.x là phí thời gian (đã đo: 7.67 → 7.33, tệ hơn).
const QC_REDO_BELOW = 6;

async function renderAnimationWithQC({ variables }) {
  const haveGemini = !!process.env.GEMINI_API_KEY;
  const vars = { ...variables }; // img_hero = URL do app gửi (đã có sẵn) → render fetch trực tiếp
  const rounds = haveGemini ? 2 : 1; // tối đa 2 nhưng vòng 2 CHỈ chạy khi điểm < 6
  let best = null; // { tmpDir, outFile, avg, report }

  for (let round = 0; round < rounds; round++) {
    const r = await renderTemplate({ template: "animation", variables: vars, quality: "draft" });
    if (!haveGemini) { best = { ...r, avg: 10, report: [] }; break; } // 429/thiếu key → pass-through

    const dur = (await probeDuration(r.outFile)) || Number(vars.duration) || 18.5;
    const report = [];
    let sum = 0, n = 0, wantCompact = false;
    for (const m of QC_FRAME_MARKS) {
      let b64;
      try { b64 = await extractFrame(r.outFile, +(m * dur).toFixed(2)); } catch { continue; }
      const a = await assessFrame(b64);
      report.push({ round, t: +(m * dur).toFixed(2), score: a.score, issues: a.issues });
      sum += a.score; n++;
      const issues = a.issues || [];
      if (issues.some((i) => i === "text_overflow" || i === "overlap" || i === "unbalanced")) wantCompact = true;
    }
    const avg = n ? sum / n : 10;
    console.log(`[qc] round ${round} avg=${avg.toFixed(2)} frames=${n}`);

    if (!best || avg > best.avg) {
      if (best) await fs.rm(best.tmpDir, { recursive: true, force: true }).catch(() => {});
      best = { ...r, avg, report };
    } else {
      await fs.rm(r.tmpDir, { recursive: true, force: true }).catch(() => {});
    }

    // 6+ coi như ĐẠT → KHÔNG re-render (tiết kiệm ~50% thời gian). Chỉ render lại nếu < 6.
    if (n === 0 || avg >= QC_REDO_BELOW) break;
    if (round >= rounds - 1) break;
    if (wantCompact) vars.compact = "1"; // vòng cứu: co chữ gọn hơn
  }
  return best;
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
app.use(express.json({ limit: "16mb" }));

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
    // 2B: animation + visionQC=true + có ít nhất 1 key (OpenAI/Gemini) → pipeline ảnh+QC.
    // Thiếu cả 2 key hoặc không bật cờ → render 1 lần như 2A (fallback).
    const useQC =
      template === "animation" &&
      variables && variables.visionQC === true &&
      (!!process.env.OPENAI_API_KEY || !!process.env.GEMINI_API_KEY);
    const result = useQC
      ? await renderAnimationWithQC({ variables })
      : await renderTemplate({ template, variables, quality });
    const { tmpDir, outFile } = result;
    try {
      const { url, durationSec, sizeBytes } = await storeOutput(outFile, template);
      setJob(jobId, { status: "done", url, durationSec, sizeBytes, qcReport: result.report || undefined });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }).catch((e) => {
    setJob(jobId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
  });

  return res.status(202).json({ jobId });
});

// POST /audio/speed { audioBase64, factor }  → { audioBase64, durationMs }
// Tăng tốc audio bằng atempo (giữ cao độ). KHÔNG cần render-lock (ffmpeg audio rất nhẹ ~1s).
app.post("/audio/speed", async (req, res) => {
  const auth = checkAuth(req);
  if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error });

  const { audioBase64, factor } = req.body || {};
  if (typeof audioBase64 !== "string" || audioBase64.length < 16)
    return res.status(400).json({ ok: false, error: "audioBase64 không hợp lệ" });
  const f = Number(factor);
  if (!Number.isFinite(f) || f < 1.0 || f > 4.0)
    return res.status(400).json({ ok: false, error: "factor phải trong [1.0, 4.0]" });

  const id = crypto.randomUUID();
  const inFile = path.join(os.tmpdir(), `spd-in-${id}.mp3`);
  const outFile = path.join(os.tmpdir(), `spd-out-${id}.mp3`);
  try {
    await fs.writeFile(inFile, Buffer.from(audioBase64, "base64"));
    // f≈1.0 → vẫn chạy nhanh; chain an toàn cho mọi factor.
    await execFileP("ffmpeg", ["-y", "-i", inFile, "-filter:a", buildAtempoChain(f), "-vn", outFile], {
      timeout: 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    const buf = await fs.readFile(outFile);
    const durSec = await probeDuration(outFile);
    return res.json({
      audioBase64: buf.toString("base64"),
      durationMs: durSec ? Math.round(durSec * 1000) : null,
    });
  } catch (e) {
    console.error("[audio-speed-fail]", e?.stderr || e?.message || e);
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  } finally {
    await fs.rm(inFile, { force: true }).catch(() => {});
    await fs.rm(outFile, { force: true }).catch(() => {});
  }
});

app.get("/jobs/:jobId", (req, res) => {
  const auth = checkAuth(req);
  if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error });
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: "Job không tồn tại (hoặc đã hết hạn)" });
  const { status, url, error, durationSec, sizeBytes, qcReport } = job;
  return res.json({ status, url, error, durationSec, sizeBytes, qcReport });
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
