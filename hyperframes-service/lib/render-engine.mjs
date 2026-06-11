// Render engine Playwright + ffmpeg (Phase 3) — thay lõi `npx hyperframes render`
// bằng FRAME-STEPPING tự chủ, soi theo adapter-hyperframes của nexu-io/html-video
// (Apache-2.0 — THIRD_PARTY.md), nhưng đổi chiến lược: thay vì recordVideo theo
// thời gian thực (rớt frame trên VPS 2vCPU software-render), ta SEEK GSAP timeline
// TỪNG FRAME (tl.time(i/fps), tăng dần đơn điệu → count-up onUpdate chạy đúng)
// → screenshot → pipe vào ffmpeg (image2pipe → libx264 CRF yuv420p faststart).
// Deterministic, không rớt frame, kiểm soát trọn frame — đúng kế hoạch nâng cấp.
//
// Bật qua env RENDER_ENGINE=playwright (server.mjs); default vẫn CLI cũ (zero-risk).
// Env phụ: FFMPEG_PATH (default "ffmpeg"), PW_CHANNEL (default Chromium bundle
// của playwright; test local Windows có thể dùng "msedge").
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// Đọc TẠI THỜI ĐIỂM GỌI (không chốt lúc import — caller/test có thể set env sau import).
const ffmpegBin = () => process.env.FFMPEG_PATH || "ffmpeg";

/** Tải voice-over về file tạm (ffmpeg mux). Lỗi → null (video câm vẫn render). */
async function downloadVoice(url, tmpDir) {
  if (!url || !String(url).trim()) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const f = path.join(tmpDir, "voice.mp3");
    await fs.writeFile(f, buf);
    return f;
  } catch {
    return null;
  }
}

/**
 * Render 1 composition đã BAKE (server lo patchComposition/injectBrollImages
 * trước) bằng frame-stepping.
 *
 * @param {object} o
 * @param {string} o.entryHtmlAbs  đường dẫn TUYỆT ĐỐI của HTML entry (nằm trong
 *                                 compositions/ để ../assets ../vendor resolve)
 * @param {object} o.variables     biến composition (shim getVariables)
 * @param {string} o.quality       draft|standard|high → CRF/preset/định dạng frame
 * @param {string} o.outFile       file mp4 đích
 * @param {number} [o.fps=24]
 * @returns {Promise<{ outFile: string }>}
 */
export async function renderWithPlaywright({ entryHtmlAbs, variables, quality, outFile, fps = 24 }) {
  const { chromium } = await import("playwright");
  const vars = variables ?? {};
  const draft = quality === "draft";
  const duration = Math.min(600, Math.max(1, Number(vars.duration) || 18.5));
  const totalFrames = Math.max(1, Math.round(duration * fps));

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pwr-"));
  // Shim getVariables + entry copy NẰM CẠNH composition gốc (giữ relative assets).
  const src = await fs.readFile(entryHtmlAbs, "utf8");
  const shim = `<script>window.__hyperframes={getVariables:()=>(${JSON.stringify(vars).replace(/<\//g, "<\\/")})};<` + `/script>`;
  // Chèn shim NGAY TRƯỚC <script> đầu tiên sau <body> (trước script chính của composition).
  const entryDir = path.dirname(entryHtmlAbs);
  const pwEntry = path.join(entryDir, `.pw-${crypto.randomBytes(5).toString("hex")}.html`);
  const injected = src.includes("<script>\n      const v =")
    ? src.replace("<script>\n      const v =", `${shim}<script>\n      const v =`)
    : src.replace(/<script>(?![^<]*src=)/, `${shim}<script>`); // composition đầu tiên không-src
  await fs.writeFile(pwEntry, injected, "utf8");

  let browser;
  let ffmpeg;
  try {
    const voiceFile = await downloadVoice(vars.voice_url, tmpDir);

    browser = await chromium.launch({
      headless: true,
      channel: process.env.PW_CHANNEL || undefined,
      // VPS không GPU → software render ổn định (SwiftShader); local cũng chạy được.
      args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb", "--hide-scrollbars"],
    });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(30_000);
    await page.goto("file://" + pwEntry.replace(/\\/g, "/"), { waitUntil: "domcontentloaded" });
    // Font local (be-vietnam-pro.css) + doFit pass-2 (fonts.ready.then) cần chạy xong
    // TRƯỚC frame đầu — nếu không chữ đo sai cỡ.
    await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
    await page.waitForTimeout(700);
    const hasTimeline = await page.evaluate(() => !!(window.__timelines && window.__timelines.main));
    if (!hasTimeline) throw new Error("Composition không expose window.__timelines.main — không seek được");

    // ffmpeg: nhận frame qua stdin (image2pipe), mux voice nếu có, cắt đúng duration.
    const frameFmt = draft ? "mjpeg" : "png";
    const args = [
      "-y",
      "-f", "image2pipe",
      "-vcodec", frameFmt === "mjpeg" ? "mjpeg" : "png",
      "-framerate", String(fps),
      "-i", "-",
      ...(voiceFile ? ["-i", voiceFile] : []),
      "-map", "0:v",
      ...(voiceFile ? ["-map", "1:a", "-c:a", "aac", "-b:a", "160k"] : []),
      "-c:v", "libx264",
      "-preset", draft ? "veryfast" : "medium",
      "-crf", draft ? "23" : "20",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-r", String(fps),
      "-t", String(duration),
      outFile,
    ];
    ffmpeg = spawn(ffmpegBin(), args, { stdio: ["pipe", "ignore", "pipe"] });
    let ffErr = "";
    ffmpeg.stderr.on("data", (c) => { ffErr += c.toString("utf8"); if (ffErr.length > 8000) ffErr = ffErr.slice(-8000); });
    // stdin PHẢI có handler error: ffmpeg chết sớm → write EPIPE emit trên stream;
    // không handler = uncaughtException → SẬP CẢ SERVICE (mất job store in-memory).
    ffmpeg.stdin.on("error", () => {});
    const ffDone = new Promise((resolve, reject) => {
      ffmpeg.on("error", (e) => reject(new Error(`ffmpeg spawn: ${e.message} (FFMPEG_PATH?)`)));
      ffmpeg.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${ffErr.slice(-1500)}`))));
    });
    // Đăng ký handler NGAY: nếu vòng lặp frame throw trước khi tới `await ffDone`,
    // finally kill ffmpeg → ffDone reject "mồ côi" = unhandledRejection → Node 22
    // terminate process. catch rỗng này chỉ chặn unhandled; `await ffDone` ở dưới
    // vẫn nhận nguyên rejection (catch tạo promise MỚI, không nuốt promise gốc).
    ffDone.catch(() => {});

    // Frame-stepping: seek TĂNG DẦN từng frame → screenshot → ghi stdin (chờ drain).
    const writeFrame = (buf) =>
      new Promise((resolve, reject) => {
        ffmpeg.stdin.write(buf, (err) => (err ? reject(err) : resolve()));
      });
    for (let i = 0; i < totalFrames; i++) {
      const t = Math.min(duration - 0.0001, i / fps);
      await page.evaluate((tt) => {
        const tl = window.__timelines.main;
        tl.time(tt, false);
      }, t);
      const shot = await page.screenshot(
        frameFmt === "mjpeg" ? { type: "jpeg", quality: 90 } : { type: "png" }
      );
      await writeFrame(shot);
    }
    ffmpeg.stdin.end();
    await ffDone;
    return { outFile };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (ffmpeg && ffmpeg.exitCode == null) ffmpeg.kill("SIGKILL");
    await fs.rm(pwEntry, { force: true }).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
