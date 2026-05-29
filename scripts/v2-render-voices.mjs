// Render 7 voiceover sections per kịch bản 02-vu-script-case-200tr-6ty.md
// Output: assets/audio/scene-{1-7}.mp3 + scene-durations.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.resolve(__dirname, "../assets/audio");

const ELEVENLABS = "***REMOVED***";
const VOICE_ID = "cjVigY5qzO86Huf0OWal"; // Eric — smooth, classy male
const MODEL = "eleven_multilingual_v2";

// 7 scenes — text bám sát .md kịch bản
const SCENES = [
  {
    id: 1,
    label: "HOOK",
    text:
      "Tổng thu nhập 200 triệu một tháng, tài sản 10 tỷ... nhưng vẫn ngộp dòng tiền vì chỉ 6 tỷ nợ. Nghe vô lý — nhưng là thật.",
    voiceSettings: { stability: 0.45, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true },
  },
  {
    id: 2,
    label: "GIỚI THIỆU CASE",
    text:
      "Đây là case của anh T., 38 tuổi, kinh doanh lĩnh vực công nghệ. Vợ chồng anh tổng thu khoảng 200 triệu một tháng, nguồn thu ổn định. Tài sản tích lũy khoảng 10 tỷ đồng. Nghe qua thì tài chính rất tốt...",
    voiceSettings: { stability: 0.55, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true },
  },
  {
    id: 3,
    label: "VẤN ĐỀ THỰC TẾ",
    text:
      "Nhưng anh đang vướng hai khoản. Thứ nhất, 2.3 tỷ trên thẻ tín dụng — lãi suất tương đương 30%/năm, phí rút tiền mặt 24 đến 30%/năm. Thứ hai, 3.7 tỷ vay tín chấp — lãi 16 đến 20%/năm. Tổng dư nợ 6 tỷ. Kết quả: dòng tiền mỗi tháng âm khoảng 35 triệu.",
    voiceSettings: { stability: 0.4, similarity_boost: 0.85, style: 0.6, use_speaker_boost: true },
  },
  {
    id: 4,
    label: "TÁI CẤU TRÚC",
    text:
      "Mình đã giúp anh ấy ba việc. Một, gom toàn bộ nợ thẻ và tín chấp về một khoản vay thế chấp 6 tỷ, lãi suất chỉ 7.2%/năm. Hai, kéo dài thời hạn 20 năm để giảm áp lực trả nợ hàng tháng. Ba, cắt toàn bộ thẻ tín dụng, xây lại kế hoạch tài chính từ đầu.",
    voiceSettings: { stability: 0.55, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
  },
  {
    id: 5,
    label: "KẾT QUẢ SAU 5 THÁNG",
    text:
      "Sau 5 tháng: dòng tiền dương khoảng 40 triệu mỗi tháng. Tiết kiệm và đầu tư đều đặn. Tổng tích lũy được 600 triệu — trước đó gần như không thể. Quan trọng nhất, anh ấy lấy lại sự kiểm soát tài chính và không còn cảm thấy căng thẳng.",
    voiceSettings: { stability: 0.6, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
  },
  {
    id: 6,
    label: "BÀI HỌC",
    text:
      "Thu nhập cao không có nghĩa là tài chính tốt. Sai công cụ tài chính là tiền chảy đi mà không hay biết. Hiểu đúng, chọn đúng, dòng tiền mới khỏe được.",
    voiceSettings: { stability: 0.65, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true },
  },
  {
    id: 7,
    label: "CTA",
    text:
      "Bạn đang dùng nhiều thẻ tín dụng? Vay tín chấp? Inbox cho Vũ nhé. Mình sẽ phân tích giúp bạn cách thoát bẫy và tối ưu dòng tiền. Tư vấn một-một, miễn phí.",
    voiceSettings: { stability: 0.55, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true },
  },
];

async function tts(scene) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: scene.text,
      model_id: MODEL,
      voice_settings: scene.voiceSettings,
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs scene ${scene.id} ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

function probeDuration(mp3Path) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      mp3Path,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => resolve(parseFloat(out.trim())));
    p.on("error", reject);
  });
}

async function main() {
  console.log(`📢 Rendering ${SCENES.length} voiceover sections (ElevenLabs Eric, multilingual v2)\n`);
  const meta = [];
  let totalChars = 0;
  for (const scene of SCENES) {
    process.stdout.write(`▶ Scene ${scene.id} [${scene.label}] (${scene.text.length} chars)... `);
    const t0 = Date.now();
    const buf = await tts(scene);
    const outPath = path.join(AUDIO_DIR, `scene-${String(scene.id).padStart(2, "0")}.mp3`);
    fs.writeFileSync(outPath, buf);
    const duration = await probeDuration(outPath);
    totalChars += scene.text.length;
    meta.push({ id: scene.id, label: scene.label, file: path.basename(outPath), durationSec: duration, chars: scene.text.length });
    console.log(`✅ ${(buf.length / 1024).toFixed(0)}KB, ${duration.toFixed(2)}s (${((Date.now() - t0) / 1000).toFixed(1)}s elapsed)`);
  }
  fs.writeFileSync(path.join(AUDIO_DIR, "scene-durations.json"), JSON.stringify(meta, null, 2));
  const total = meta.reduce((s, m) => s + m.durationSec, 0);
  console.log(`\n📊 Total: ${total.toFixed(2)}s of voiceover, ${totalChars} chars (~${totalChars}/10000 ElevenLabs free quota)`);
  console.log(`💾 Manifest: ${AUDIO_DIR}/scene-durations.json`);
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
