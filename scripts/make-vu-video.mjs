// Standalone script: tạo 1 video proof-of-pipeline cho Vũ
// HeyGen API yêu cầu paid credit → fallback: static-image video với ElevenLabs voice
// Pipeline: DeepSeek (script) → ElevenLabs (MP3 voice Việt) → ffmpeg (static image + audio → MP4)
// Run: node scripts/make-vu-video.mjs

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../out");

// API keys đọc từ env (KHÔNG hardcode — tránh lộ key khi commit).
// Chạy: DEEPSEEK_API_KEY=... ELEVENLABS_API_KEY=... HEYGEN_API_KEY=... node scripts/make-vu-video.mjs
const DEEPSEEK = process.env.DEEPSEEK_API_KEY || "";
const ELEVENLABS = process.env.ELEVENLABS_API_KEY || "";
const HEYGEN = process.env.HEYGEN_API_KEY || ""; // for avatar preview image
if (!DEEPSEEK || !ELEVENLABS) {
  console.error("Thiếu env: cần DEEPSEEK_API_KEY + ELEVENLABS_API_KEY (HEYGEN_API_KEY tuỳ chọn).");
  process.exit(1);
}

// ElevenLabs Vietnamese-friendly voices via multilingual v2 model
// Eric — smooth, trustworthy male (banker tone)
const ELEVEN_VOICE = "cjVigY5qzO86Huf0OWal";
const ELEVEN_MODEL = "eleven_multilingual_v2";

// Static avatar image (Minho stock from HeyGen — Korean-looking male banker)
const AVATAR_PREVIEW_AVATAR_ID = "Minho_public_2";

const PROFILE = {
  name: "Vũ",
  role: "Chuyên viên Tín dụng Cá nhân — Shinhan Bank",
  expertise: ["Vay mua nhà", "Vay mua xe", "Vay tiêu dùng tín chấp", "Thẻ tín dụng"],
  audience: "Người Việt 25–40 tuổi, lên kế hoạch mua nhà/xe đầu tiên, ngại giấy tờ ngân hàng, sợ lãi suất ẩn",
  tone: "Chuyên nghiệp, đáng tin cậy, gần gũi, dùng ngôn ngữ đời thường",
};

const TOPIC = "5 sai lầm phổ biến khi vay mua nhà lần đầu — tránh ngay nếu không muốn mất tiền oan";

async function step(label, fn) {
  const t0 = Date.now();
  process.stdout.write(`\n▶ ${label}... `);
  try {
    const result = await fn();
    console.log(`✅ ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return result;
  } catch (e) {
    console.log(`❌`);
    throw e;
  }
}

async function generateScript() {
  const system = `Bạn là content writer kịch bản video ngắn (50-65 giây) cho personal banker Việt Nam.
Phong cách: ${PROFILE.tone}.
Tuân thủ NHNN: KHÔNG cam kết lãi suất cố định, KHÔNG hứa "100% duyệt", KHÔNG dùng "an toàn tuyệt đối".
Output JSON: { "hook": "5s mở đầu giật chú ý", "body": "35-45s nội dung chính, chia 3-4 ý", "cta": "5-10s kêu gọi follow/comment" }
Văn nói tự nhiên, không bullet point, dùng từ "bạn" — như đang nói chuyện 1-1.`;

  const user = `Người nói: ${PROFILE.name}, ${PROFILE.role}.
Audience: ${PROFILE.audience}.
Chuyên môn: ${PROFILE.expertise.join(", ")}.

Chủ đề: "${TOPIC}"

Viết kịch bản. Trả JSON đúng schema, KHÔNG markdown fence.`;

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${DEEPSEEK}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1500,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices[0].message.content;
  const tin = data.usage.prompt_tokens, tout = data.usage.completion_tokens;
  console.log(`(${tin}in/${tout}out, ~$${((tin * 0.27 + tout * 1.1) / 1_000_000).toFixed(4)})`);
  return JSON.parse(text);
}

async function ttsElevenLabs(text, outPath) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: ELEVEN_MODEL,
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return buf.length;
}

async function getAvatarPreview(outPath) {
  // Fetch avatar list and find Minho preview URL
  const res = await fetch("https://api.heygen.com/v2/avatars", {
    headers: { "X-Api-Key": HEYGEN },
  });
  const data = await res.json();
  const avatars = data.data.avatars;
  const minho = avatars.find((a) => a.avatar_id === AVATAR_PREVIEW_AVATAR_ID);
  if (!minho || !minho.preview_image_url) throw new Error("Minho avatar not found");
  const img = await fetch(minho.preview_image_url);
  const buf = Buffer.from(await img.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return { url: minho.preview_image_url, size: buf.length };
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function buildVideo(imagePath, audioPath, scriptText, outPath) {
  // 9:16 vertical 720x1280, loop image, audio drives duration
  // Add subtitle burn-in for accessibility
  const srtPath = outPath.replace(/\.mp4$/, ".srt");
  // Simple SRT: whole script as one chunk (rough)
  const audioMeta = await new Promise((res, rej) => {
    const p = spawn("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", audioPath]);
    let out = ""; p.stdout.on("data", d => out += d.toString());
    p.on("close", () => res(parseFloat(out.trim()) || 60));
  });
  // Build SRT split by sentence
  const sentences = scriptText.split(/(?<=[.!?])\s+/).filter(Boolean);
  const perSec = audioMeta / sentences.length;
  let srt = "";
  sentences.forEach((s, i) => {
    const start = i * perSec;
    const end = (i + 1) * perSec;
    srt += `${i + 1}\n${fmtTime(start)} --> ${fmtTime(end)}\n${s.trim()}\n\n`;
  });
  fs.writeFileSync(srtPath, srt);

  // Subtitle .srt saved alongside; for burn-in, escape commas in force_style with \,
  // Comma inside subtitle path or escape is fiddly across platforms → skip burn-in v1, ship .srt sidecar
  await ffmpeg([
    "-y",
    "-loop", "1", "-i", imagePath,
    "-i", audioPath,
    "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280",
    "-c:v", "libx264", "-preset", "fast", "-tune", "stillimage",
    "-c:a", "aac", "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ]);
}

function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  console.log(`📋 Profile: ${PROFILE.name} — ${PROFILE.role}`);
  console.log(`📌 Topic: ${TOPIC}`);
  console.log(`⚠️  Stack: DeepSeek + ElevenLabs + ffmpeg (HeyGen API need paid credit)`);

  const script = await step("Sinh kịch bản DeepSeek", generateScript);
  console.log(`   Hook: ${script.hook}`);
  console.log(`   Body: ${script.body.slice(0, 120)}...`);
  console.log(`   CTA:  ${script.cta}`);

  const fullText = `${script.hook}\n\n${script.body}\n\n${script.cta}`;
  fs.writeFileSync(path.join(OUT_DIR, `vu-script-${ts}.json`), JSON.stringify(script, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `vu-script-${ts}.txt`), fullText);
  console.log(`   💾 Script: out/vu-script-${ts}.{json,txt}`);
  console.log(`   📏 ${fullText.length} chars (ElevenLabs quota: ~${fullText.length}/10000)`);

  const audioPath = path.join(OUT_DIR, `vu-audio-${ts}.mp3`);
  const audioSize = await step("ElevenLabs TTS giọng Việt (Eric, multilingual v2)", () =>
    ttsElevenLabs(fullText, audioPath)
  );
  console.log(`   💾 ${audioPath} (${(audioSize / 1024).toFixed(1)}KB)`);

  const imgPath = path.join(OUT_DIR, `vu-avatar-${ts}.jpg`);
  const imgMeta = await step("Download avatar preview (Minho stock)", () => getAvatarPreview(imgPath));
  console.log(`   💾 ${imgPath} (${(imgMeta.size / 1024).toFixed(1)}KB)`);

  const videoPath = path.join(OUT_DIR, `vu-c1-${ts}.mp4`);
  await step("ffmpeg: ghép image + audio + subtitle (9:16, H.264)", () =>
    buildVideo(imgPath, audioPath, fullText, videoPath)
  );

  const stats = fs.statSync(videoPath);
  console.log(`   💾 ${videoPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);

  console.log(`\n🎬 VIDEO READY: ${videoPath}`);
  console.log(`\n💡 Note: Để có talking head animated (Vũ thật sự nói), cần:`);
  console.log(`   - HeyGen Creator plan ($24/mo) → API credit, hoặc`);
  console.log(`   - Phase 3+4 VPS HyperFrames setup (2-3 ngày)`);
}

main().catch((e) => {
  console.error(`\n❌ FAIL: ${e.message}`);
  process.exit(1);
});
