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
import { renderWithPlaywright, transcodeToWebm } from "./lib/render-engine.mjs";
import { buildComposeGraph } from "./lib/compose-overlay.mjs";

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
// FIX GRADE ADAPTIVE: đo luma nguồn mỗi ẢNH b-roll (ffmpeg scale 1×1 gray = trung bình) → brightness BÙ
// để footage xấp xỉ tông C1 SÁNG. Cảnh TỐI kéo MẠNH (tới MAX), cảnh đã sáng giữ ~1.0. Video bỏ qua (tông
// tự nhiên). Best-effort: lỗi/không đo được → bỏ (broll.html rơi về --bg-bright chung). Đo SONG SONG.
// Trả map url(string) → clipBright(number). TARGET/MAX chỉnh được qua env (BROLL_GRADE_TARGET/_MAX).
async function probeBgLuminance(bgUrls, bgTypes, tmpDir) {
  const TARGET = Number(process.env.BROLL_GRADE_TARGET) || 165;
  // MAX 1.6 (giảm từ 1.8): nguồn ảnh giờ ĐÃ SÁNG từ gốc (prompt ép light-mode/bright) → grade chỉ bù NHẸ,
  // tránh kéo mạnh gây xám/bệt/cháy. Cảnh tối còn sót vẫn được nâng tới 1.6.
  const MIN = 1.0, MAX = Number(process.env.BROLL_GRADE_MAX) || 1.6;
  const map = {};
  if (!Array.isArray(bgUrls) || !bgUrls.length) return map;
  await mapWithConcurrency(bgUrls.map((_, i) => i), 4, async (i) => {
    const url = bgUrls[i];
    if (bgTypes?.[i] === "video") return;                 // video: giữ tông tự nhiên
    if (!/^https?:\/\//i.test(String(url))) return;        // chỉ đo ẢNH remote (bỏ video webm local)
    if (map[url] != null) return;                          // url trùng → đã đo
    // TIMEOUT (AbortController) như hàm dl(): 1 ảnh tải treo KHÔNG được chặn worker/làm chậm render.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Number(process.env.BROLL_PROBE_TIMEOUT_MS) || 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 512) return;
      const f = path.join(tmpDir, `probe-${i}.img`);
      await fs.writeFile(f, buf);
      const { stdout } = await execFileP(
        "ffmpeg", ["-v", "error", "-i", f, "-vf", "scale=1:1:flags=area", "-pix_fmt", "gray", "-f", "rawvideo", "-"],
        { encoding: "buffer", maxBuffer: 1024 }
      );
      await fs.rm(f, { force: true }).catch(() => {});
      const luma = stdout && stdout.length ? stdout[0] : 0;
      if (luma > 0) map[url] = Math.round(Math.max(MIN, Math.min(MAX, TARGET / luma)) * 1000) / 1000;
    } catch { /* best-effort (timeout/lỗi tải/ffmpeg) → bỏ, dùng --bg-bright chung */ }
    finally { clearTimeout(timer); }
  });
  return map;
}

// extends to cover any rounding gap so footage never cuts to gradient early.
function injectBrollImages(html, bgUrls, bgTypes, shotDurations, totalDur, lumaMap) {
  if (!Array.isArray(bgUrls) || bgUrls.length === 0) return html; // no footage → template gradient fallback
  // bgTypes song song bgUrls ("image"|"video"). Thiếu/cũ (payload C2 trước HYBRID) → coi TẤT CẢ
  // là "image" → hành vi <img> cũ y nguyên (backward-compat tuyệt đối).
  let types = Array.isArray(bgTypes) && bgTypes.length === bgUrls.length
    ? bgTypes.map((t) => (t === "video" ? "video" : "image"))
    : bgUrls.map(() => "image");
  // Resolve per-image durations: use shotDurations if valid, else split evenly.
  let durs = Array.isArray(shotDurations) && shotDurations.length === bgUrls.length
    ? shotDurations.map((d) => Number(d)).map((d) => (Number.isFinite(d) && d > 0 ? d : 0))
    : [];
  if (durs.length !== bgUrls.length || durs.some((d) => d <= 0)) {
    const even = totalDur / bgUrls.length;
    durs = bgUrls.map(() => even);
  }
  // Khử nền TRÙNG (cùng src liền kề — cache có thể trả cùng URL cho 2 shot) → gộp duration
  // vào clip trước. Giữ type của clip được GIỮ LẠI (src trùng nên type trùng). Tổng thời lượng KHÔNG đổi.
  {
    const u = [];
    const ud = [];
    const ut = [];
    for (let i = 0; i < bgUrls.length; i++) {
      if (u.length && u[u.length - 1] === bgUrls[i]) {
        ud[ud.length - 1] += durs[i];
      } else {
        u.push(bgUrls[i]);
        ud.push(durs[i]);
        ut.push(types[i]);
      }
    }
    bgUrls = u;
    durs = ud;
    types = ut;
  }
  let start = 0;
  const tags = bgUrls.map((url, i) => {
    const isLast = i === bgUrls.length - 1;
    // last clip holds to the end (cover rounding); others use their own dur.
    const dur = isLast ? Math.max(0.1, totalDur - start) : durs[i];
    const s = Math.round(start * 1000) / 1000;
    const d = Math.round(dur * 1000) / 1000;
    start += durs[i];
    // track-index i so overlapping crossfade tails layer correctly.
    const common = `id="bgv${i}" class="bg clip" data-bg-index="${i}" data-start="${s}" data-duration="${d}" data-track-index="${i}"`;
    // C2 HYBRID: clip Pexels → <video> (muted/playsinline/preload=auto; frame-stepping điều khiển qua
    // currentTime + __prepareFrame chờ 'seeked'). Ảnh AI → <img> + Ken-Burns như cũ.
    if (types[i] === "video") {
      return `<video ${common} muted playsinline preload="auto" src="${escAttr(url)}"></video>`;
    }
    // GRADE ADAPTIVE: bake --clip-bright (server đo luma) → brightness bù riêng từng ảnh; thiếu → --bg-bright.
    const cb = lumaMap && lumaMap[url] ? ` style="--clip-bright:${lumaMap[url]}"` : "";
    return `<img ${common}${cb} src="${escAttr(url)}">`;
  });
  // Insert the footage tags inside #bglayer (replace its empty body).
  return html.replace(/(<div id="bglayer">)(\s*<\/div>)/, `$1${tags.join("")}</div>`);
}

// Worker-pool: chạy `fn(item)` với tối đa `limit` tác vụ ĐỒNG THỜI (kéo item kế khi 1 worker rảnh).
// fn được bọc try/catch → 1 item lỗi KHÔNG làm chết worker / reject cả mẻ (giữ tính best-effort).
async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  const n = Math.max(1, Math.min(limit, items.length));
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { await fn(items[i], i); } catch { /* mỗi item đã best-effort bên trong */ }
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
}

// C2 HYBRID: tải clip Pexels (type "video") về FILE LOCAL cạnh entry HTML, đổi src sang tên file
// tương đối → frame-stepping seek tức thì (remote video buffers/seeks mỗi frame = timeout/OOM trên
// VPS 2-vCPU, đúng lý do trước đây chỉ dùng ảnh). Ảnh giữ URL remote (nhẹ, load ngay). Best-effort:
// clip nào tải lỗi → giữ URL remote (giảm chất chứ KHÔNG sập). Trả { urls, files(để xoá) }.
//
// CODEC (C2 HYBRID): Pexels phát H.264/MP4 mà Playwright Chromium KHÔNG decode được (không có
// codec độc quyền) → <video> đứng hình. Vì vậy SAU khi tải về ta TRANSCODE → VP9/WebM (codec mở
// Chromium decode+seek tốt) rồi mới dùng. maxDurationSec bound thời gian encode trên VPS.
// TỐC ĐỘ: tải+transcode SONG SONG (mapWithConcurrency) thay vì for tuần tự — xem ghi chú trong hàm.
async function downloadFootageVideos(bgUrls, bgTypes, destDir, id, maxDurationSec) {
  const urls = bgUrls.slice();
  const files = [];
  // Chỉ những index là "video" + remote hợp lệ mới cần tải+transcode (ảnh AI giữ URL remote).
  const targets = [];
  for (let i = 0; i < urls.length; i++) {
    if (bgTypes?.[i] !== "video") continue;
    const remote = urls[i];
    if (!remote || /^[.][/]/.test(String(remote))) continue; // rỗng / đã là path local → bỏ
    targets.push(i);
  }
  if (targets.length === 0) return { urls, files };

  // TỐC ĐỘ: TRƯỚC đây for-loop TUẦN TỰ (tải xong clip i mới sang i+1) → tổng = Σ(tải+transcode).
  // GIỜ chạy SONG SONG (worker-pool, default 4 đồng thời, chỉnh qua BROLL_DL_CONCURRENCY) → tổng ≈
  // mẻ chậm nhất. Mỗi worker xử lý 1 index RIÊNG: `urls[i]=` ghi index khác nhau, `files.push` là
  // thao tác đồng bộ (event-loop đơn luồng) → KHÔNG đua dữ liệu. Thứ tự `urls` giữ NGUYÊN theo index.
  // Lỗi 1 clip → riêng clip đó giữ URL remote (fallback), KHÔNG chặn cả mẻ.
  const limit = Math.max(1, Math.min(6, Number(process.env.BROLL_DL_CONCURRENCY) || 4));
  const t0 = Date.now();
  await mapWithConcurrency(targets, limit, async (i) => {
    const remote = urls[i];
    const tDl0 = Date.now();
    try {
      const res = await fetch(remote);
      if (!res.ok) return;
      const ct = res.headers.get("content-type") || "";
      if (!ct.startsWith("video/")) return; // không phải video → giữ remote
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) return; // file rỗng/hỏng → giữ remote
      const srcAbs = path.join(destDir, `.render-${id}-bg${i}.src.mp4`);
      await fs.writeFile(srcAbs, buf);
      const dlMs = Date.now() - tDl0;
      // H.264 → VP9/WebM (xem transcodeToWebm). OK → dùng webm + dọn cả 2 file sau render.
      const webmName = `.render-${id}-bg${i}.webm`;
      const webmAbs = path.join(destDir, webmName);
      const tTx0 = Date.now();
      try {
        await transcodeToWebm(srcAbs, webmAbs, maxDurationSec);
        urls[i] = webmName; // src tương đối — cùng thư mục entry HTML (same-origin file://)
        files.push(webmAbs, srcAbs);
        console.log(`[broll-dl] bg${i} ok dl=${dlMs}ms tx=${Date.now() - tTx0}ms`);
      } catch (e) {
        // Transcode lỗi (hiếm): dọn CẢ mp4 nguồn LẪN webm dở (transcodeToWebm cũng tự dọn outAbs —
        // đây là lớp phòng vệ), GIỮ URL remote (best-effort — render không sập, dù clip remote H.264
        // có thể vẫn không decode). Log để truy vết.
        console.error("[broll-webm-transcode-fail]", i, e?.message || e);
        await fs.rm(srcAbs, { force: true }).catch(() => {});
        await fs.rm(webmAbs, { force: true }).catch(() => {});
      }
    } catch (e) {
      console.error("[broll-video-dl-fail]", i, e?.message || e); // giữ remote, render vẫn chạy
    }
  });
  console.log(`[broll-dl] ${targets.length} clip(s) tải+transcode trong ${Date.now() - t0}ms (concurrency=${Math.min(limit, targets.length)})`);
  return { urls, files };
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
  let tempVideoFiles = []; // C2 HYBRID: clip Pexels tải về local → xoá sau render (cả 2 nhánh engine)

  // animation + broll: bake duration + voice src into a temp copy kept INSIDE
  // compositions/ (so the template's ../assets and ../vendor relative URLs still
  // resolve). ALLOWED_TEMPLATES = {animation, broll}, so this covers both.
  if (template === "animation" || template === "broll") {
    const dur = Number(variables?.duration);
    const hasVoice = variables?.voice_url && String(variables.voice_url).trim();
    // broll also carries footage clips (bg_urls) → inject static <img>/<video> tags.
    let bgUrls = template === "broll" ? safeJsonArray(variables?.bg_urls) : [];
    const needsBake = (Number.isFinite(dur) && dur > 0) || hasVoice || bgUrls.length > 0;
    if (needsBake) {
      const src = await fs.readFile(path.join(COMP_DIR, `${template}.html`), "utf8");
      const fallback = template === "broll" ? 12 : 18.5; // each template's base length
      const durSec = Number.isFinite(dur) && dur > 0 ? Math.min(dur, 600) : fallback; // hard cap 10 min
      let patched = patchComposition(src, durSec, hasVoice ? variables.voice_url : "");
      if (template === "broll" && bgUrls.length > 0) {
        const shotDurations = safeJsonArray(variables?.shot_durations);
        const bgTypes = safeJsonArray(variables?.bg_types);
        // C2 HYBRID: tải clip Pexels về local TRƯỚC khi bake (frame-stepping seek remote = stall/timeout
        // trên VPS); ảnh AI giữ URL remote (nhẹ). Không có video → bỏ qua (ảnh thuần như cũ).
        if (bgTypes.some((t) => t === "video")) {
          const dl = await downloadFootageVideos(bgUrls, bgTypes, COMP_DIR, id, durSec);
          bgUrls = dl.urls;
          tempVideoFiles = dl.files;
        }
        // GRADE ADAPTIVE: đo luma nguồn mỗi ảnh → brightness bù (cảnh tối sáng mạnh hơn) bake vào <img>.
        const lumaMap = await probeBgLuminance(bgUrls, bgTypes, tmpDir);
        patched = injectBrollImages(patched, bgUrls, bgTypes, shotDurations, durSec, lumaMap);
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
    const tRender0 = Date.now();
    try {
      await renderWithPlaywright({
        entryHtmlAbs: path.join(__dirname, compRel),
        variables: variables ?? {},
        quality: q,
        outFile,
        fps: RENDER_FPS,
      });
      console.log(`[render-playwright] ${template} render trong ${Date.now() - tRender0}ms (fps=${RENDER_FPS})`);
      return { tmpDir, outFile };
    } catch (e) {
      console.error("[render-fail-playwright]", e?.message || e);
      throw e;
    } finally {
      if (tempEntryAbs) await fs.rm(tempEntryAbs, { force: true }).catch(() => {});
      for (const f of tempVideoFiles) await fs.rm(f, { force: true }).catch(() => {}); // C2 HYBRID: xoá clip tạm
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
    for (const f of tempVideoFiles) await fs.rm(f, { force: true }).catch(() => {}); // C2 HYBRID: xoá clip tạm
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

  try {
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
  } catch (e) {
    // Vòng sau throw → dọn tmpDir của best vòng trước (kẻo leak /tmp trên VPS).
    if (best) await fs.rm(best.tmpDir, { recursive: true, force: true }).catch(() => {});
    throw e;
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

// ── C4 AUTO-EDITOR: ghép C1 talking-head NỀN + cutaway b-roll C2 (+ lớp chữ caption) ──
// C1 nền + AUDIO C1 = master (giọng khớp môi). Cutaway C2 (TẮT TIẾNG, scale-cover 1080×1920) hiện
// FULL-FRAME tại các đoạn cutaway_segments rồi cắt về mặt C1 (jump-cut). CHỐNG LẶP HÌNH: mỗi cutaway
// tua tới 1 CẢNH C2 KHÁC nhau (input -ss/-t riêng + setpts về đúng cửa sổ; round-robin coprime trải
// khắp C2 — xem lib/compose-overlay.mjs) → cutaway liền kề khác cảnh, dùng hết cảnh, KHÔNG loop về đầu.
// ⚠ duration THẬT lấy từ C1 bằng ffprobe (KHÔNG tính từ frame) → audio KHÔNG lệch tiếng.
async function composeAutoEditor({ c1Url, c2Url, cutawaySegments, durationHint, captionGroups, keywords, accentColor }) {
  const id = crypto.randomBytes(8).toString("hex");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "compose-"));
  try {
    const c1File = path.join(tmpDir, "c1.mp4");
    const c2File = path.join(tmpDir, "c2.mp4");
    const outFile = path.join(tmpDir, `auto-editor-${id}.mp4`);

    // Tải có TIMEOUT (AbortController) + chặn file quá lớn: render-lock serialize → 1 tải treo CHẶN cả
    // hàng; tránh hang vô hạn / OOM trên VPS 2-vCPU. (COMPOSE_DL_TIMEOUT_MS override; default 120s.)
    const dl = async (url, dest) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Number(process.env.COMPOSE_DL_TIMEOUT_MS) || 120_000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`tải ${url} HTTP ${res.status}`);
        const len = Number(res.headers.get("content-length") || 0);
        if (len > 600 * 1024 * 1024) throw new Error(`file quá lớn (${Math.round(len / 1e6)}MB): ${url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1024) throw new Error(`file rỗng/hỏng: ${url}`);
        await fs.writeFile(dest, buf);
      } finally {
        clearTimeout(timer);
      }
    };
    await dl(c1Url, c1File);
    await dl(c2Url, c2File);

    // Duration THẬT từ C1 (master). Thiếu → dùng hint của app; vẫn không có → lỗi (tránh đoán sai).
    const realDur = (await probeDuration(c1File)) || Number(durationHint) || 0;
    if (!(realDur > 0)) throw new Error("Không đọc được duration C1 (ffprobe) — không thể ghép.");

    // Lọc + clamp cutaway theo duration THẬT (bỏ đoạn vượt biên / quá ngắn).
    const segs = (Array.isArray(cutawaySegments) ? cutawaySegments : [])
      .map((s) => ({ start: Number(s?.start), dur: Number(s?.dur) }))
      .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.dur) && s.dur > 0 && s.start >= 0.2)
      .map((s) => ({ start: s.start, end: Math.min(realDur - 0.15, s.start + s.dur) }))
      .filter((s) => s.end - s.start >= 0.4)
      .sort((a, b) => a.start - b.start);

    const fps = RENDER_FPS;
    const W = 1080, H = 1920;
    const scaleCrop = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}`;

    // ── PHASE 2: LỚP CHỮ overlay (caption karaoke + keyword IN HOA) chạy SUỐT (cả lúc mặt C1) ──
    // Render composition captions-overlay.html ở chế độ ALPHA (WebM trong suốt) rồi đè lên [vout].
    // BEST-EFFORT: lỗi lớp chữ → ghép KHÔNG chữ (vẫn ra video, không kéo sập cả job).
    const capGroups = Array.isArray(captionGroups) ? captionGroups : [];
    const kws = Array.isArray(keywords) ? keywords : [];
    let capMov = null;
    if (capGroups.length || kws.length) {
      capMov = path.join(tmpDir, "caps.mov"); // qtrle/argb (alpha) — xem render-engine alpha mode
      // Cap TƯỜNG MINH 600s (khớp cap nội bộ render-engine) — phòng video cực dài render lớp chữ
      // hàng chục nghìn frame; short-form luôn ≤ ngần này nên không cắt chữ thực tế.
      const capDur = Math.min(600, realDur);
      try {
        await renderWithPlaywright({
          entryHtmlAbs: path.join(COMP_DIR, "captions-overlay.html"),
          variables: {
            duration: capDur,
            caption_groups: JSON.stringify(capGroups),
            keywords: JSON.stringify(kws),
            accent_color: accentColor || "#FFD400",
          },
          quality: "draft",
          outFile: capMov,
          fps,
          alpha: true,
        });
      } catch (e) {
        console.error("[compose-caption-fail]", e?.message || e);
        capMov = null;
      }
    }

    // C4 CHỐNG LẶP HÌNH: mỗi cutaway lấy 1 ĐOẠN C2 ở 1 CẢNH KHÁC nhau (buildComposeGraph — round-robin
    // coprime trải khắp C2) thay vì 1 overlay C2 chạy theo t. Cần c2Dur (ranh cảnh) → ffprobe; không
    // đọc được → fallback overlay loop cũ (KHÔNG sập). filter_complex: C1 nền → cutaway → lớp chữ alpha.
    const c2Dur = await probeDuration(c2File);
    const { mode, c2Offsets, filter } = buildComposeGraph({ scaleCrop, segs, c2Dur, hasCaption: !!capMov });
    console.log(`[compose] C1 ${realDur}s + ${segs.length} cutaway [${mode}${c2Dur ? ` c2=${c2Dur}s` : ""}] + ${capMov ? `chữ(${capGroups.length} cụm,${kws.length} keyword)` : "KHÔNG chữ"} (fps=${fps})`);

    // input 0 = C1; (distinct) input 1..N = N đoạn C2 -ss/-t (input-seek: CHỈ decode đoạn cần, KHÔNG
    // buffer khổng lồ như filter split); (loop) input 1 = C2 -stream_loop; caption alpha (nếu có) = input cuối.
    const c2Inputs = [];
    if (mode === "distinct") {
      for (const o of c2Offsets) c2Inputs.push("-ss", String(o.offset), "-t", String(o.readDur), "-i", c2File);
    } else if (mode === "loop") {
      c2Inputs.push("-stream_loop", "-1", "-i", c2File);
    }

    const args = [
      "-y",
      "-i", c1File,
      ...c2Inputs,
      ...(capMov ? ["-i", capMov] : []), // lớp chữ alpha (input cuối — index buildComposeGraph đã chốt)
      "-filter_complex", filter,
      "-map", "[vout]",
      "-map", "0:a?", // AUDIO = C1 (master, khớp môi); '?' = C1 không tiếng thì bỏ qua (không lỗi)
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-r", String(fps),
      "-t", String(realDur), // CHỐT độ dài = C1 (master) → audio không lệch
      "-c:a", "aac", "-b:a", "160k",
      outFile,
    ];
    await execFileP("ffmpeg", args, { timeout: RENDER_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
    return { tmpDir, outFile };
  } catch (e) {
    console.error("[compose-fail]", e?.stderr || e?.message || e);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); // LỖI → dọn tmp ngay (tránh leak /tmp)
    throw e;
  }
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

// POST /compose { c1_url, c2_url, cutaway_segments:[{start,dur}], duration?, caption_groups?, keywords?, accent_color? }
// C4 AUTO-EDITOR: ghép C1 nền + cutaway C2 + (phase2) LỚP CHỮ caption karaoke + keyword IN HOA chạy
// SUỐT. ASYNC như /render; poll GET /jobs/:id (chung).
app.post("/compose", (req, res) => {
  const auth = checkAuth(req);
  if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error });

  const { c1_url, c2_url, cutaway_segments, duration, caption_groups, keywords, accent_color } = req.body || {};
  if (typeof c1_url !== "string" || !/^https?:\/\//i.test(c1_url))
    return res.status(400).json({ ok: false, error: "c1_url phải là URL http(s)" });
  if (typeof c2_url !== "string" || !/^https?:\/\//i.test(c2_url))
    return res.status(400).json({ ok: false, error: "c2_url phải là URL http(s)" });
  if (cutaway_segments != null && !Array.isArray(cutaway_segments))
    return res.status(400).json({ ok: false, error: "cutaway_segments phải là mảng [{start,dur}]" });
  if (caption_groups != null && !Array.isArray(caption_groups))
    return res.status(400).json({ ok: false, error: "caption_groups phải là mảng" });
  if (keywords != null && !Array.isArray(keywords))
    return res.status(400).json({ ok: false, error: "keywords phải là mảng" });

  pruneJobs();
  const jobId = crypto.randomUUID();
  setJob(jobId, { status: "queued", createdAt: Date.now() });

  // Background — mutex withRenderLock serialize (2 vCPU) như /render.
  withRenderLock(async () => {
    setJob(jobId, { status: "rendering" });
    const { tmpDir, outFile } = await composeAutoEditor({
      c1Url: c1_url,
      c2Url: c2_url,
      cutawaySegments: cutaway_segments || [],
      durationHint: duration,
      captionGroups: caption_groups || [],
      keywords: keywords || [],
      accentColor: typeof accent_color === "string" ? accent_color : undefined,
    });
    try {
      const { url, durationSec, sizeBytes } = await storeOutput(outFile, "auto-editor");
      setJob(jobId, { status: "done", url, durationSec, sizeBytes });
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

// POST /audio/mix { voiceBase64, musicBase64, duckDb? } → { audioBase64, durationMs }
// Trộn nhạc nền DƯỚI giọng đọc (Phase 5): nhạc volume duckDb (default -18dB,
// chuẩn html-video), aloop lặp phủ hết voice, amix duration=first cắt theo voice.
// Nhẹ (~1-2s ffmpeg) → không cần render-lock.
app.post("/audio/mix", async (req, res) => {
  const auth = checkAuth(req);
  if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error });

  const { voiceBase64, musicBase64, duckDb } = req.body || {};
  if (typeof voiceBase64 !== "string" || voiceBase64.length < 16)
    return res.status(400).json({ ok: false, error: "voiceBase64 không hợp lệ" });
  if (typeof musicBase64 !== "string" || musicBase64.length < 16)
    return res.status(400).json({ ok: false, error: "musicBase64 không hợp lệ" });
  const duck = Number.isFinite(Number(duckDb)) ? Math.max(-40, Math.min(0, Number(duckDb))) : -18;

  const id = crypto.randomUUID();
  const vFile = path.join(os.tmpdir(), `mix-v-${id}.mp3`);
  const mFile = path.join(os.tmpdir(), `mix-m-${id}.mp3`);
  const outFile = path.join(os.tmpdir(), `mix-out-${id}.mp3`);
  try {
    await fs.writeFile(vFile, Buffer.from(voiceBase64, "base64"));
    await fs.writeFile(mFile, Buffer.from(musicBase64, "base64"));
    await execFileP(
      "ffmpeg",
      [
        "-y",
        "-i", vFile,
        "-stream_loop", "-1", "-i", mFile, // nhạc lặp vô hạn — amix duration=first cắt theo voice
        "-filter_complex",
        `[1:a]volume=${duck}dB[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
        "-map", "[aout]",
        "-c:a", "libmp3lame", "-b:a", "192k",
        outFile,
      ],
      { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 }
    );
    const buf = await fs.readFile(outFile);
    const durSec = await probeDuration(outFile);
    return res.json({ audioBase64: buf.toString("base64"), durationMs: durSec ? Math.round(durSec * 1000) : null });
  } catch (e) {
    console.error("[audio-mix-fail]", e?.stderr || e?.message || e);
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  } finally {
    await fs.rm(vFile, { force: true }).catch(() => {});
    await fs.rm(mFile, { force: true }).catch(() => {});
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
