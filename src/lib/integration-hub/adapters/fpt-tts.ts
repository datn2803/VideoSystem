import type { TTSProvider, TTSResult } from "../types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tính độ dài MP3 (ms) bằng cách duyệt frame header — chính xác cho cả CBR/VBR.
 * Trả null nếu không parse được (để fallback sang ước lượng theo độ dài text).
 */
function mp3DurationMs(buf: Buffer): number | null {
  let i = 0;
  // Bỏ qua ID3v2 nếu có
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + size;
  }
  let totalSec = 0;
  let frames = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const versionBits = (buf[i + 1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layerBits = (buf[i + 1] >> 1) & 0x03; // 1=Layer III
    const bitrateIdx = (buf[i + 2] >> 4) & 0x0f;
    const sampleIdx = (buf[i + 2] >> 2) & 0x03;
    const padding = (buf[i + 2] >> 1) & 0x01;
    if (layerBits !== 1 || bitrateIdx === 0 || bitrateIdx === 15 || sampleIdx === 3) {
      i++;
      continue;
    }
    const isV1 = versionBits === 3;
    const bitrates = isV1
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const sampleRates =
      versionBits === 3 ? [44100, 48000, 32000] : versionBits === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
    const bitrate = bitrates[bitrateIdx] * 1000;
    const sampleRate = sampleRates[sampleIdx];
    const samplesPerFrame = isV1 ? 1152 : 576;
    const frameLen = Math.floor((samplesPerFrame / 8) * (bitrate / sampleRate)) + padding;
    if (frameLen <= 0) {
      i++;
      continue;
    }
    totalSec += samplesPerFrame / sampleRate;
    frames++;
    i += frameLen;
  }
  return frames > 0 ? Math.round(totalSec * 1000) : null;
}

export function makeFptTtsAdapter(opts: { apiKey: string; voiceId?: string }): TTSProvider {
  return {
    async synthesize({ text, voiceId }): Promise<TTSResult> {
      const voice = voiceId || opts.voiceId || "leminh";
      const res = await fetch("https://api.fpt.ai/hmi/tts/v5", {
        method: "POST",
        headers: {
          "api-key": opts.apiKey,
          voice,
          speed: "0",
          "content-type": "text/plain",
        },
        body: text,
      });
      if (!res.ok) throw new Error(`FPT TTS error ${res.status}: ${await res.text()}`);

      const data = (await res.json()) as { async?: string; error?: unknown; message?: string };
      // FPT v5 trả { async: <url> }. Nếu thiếu → format khác/lỗi → throw kèm response.
      if (!data.async || typeof data.async !== "string") {
        throw new Error(`FPT TTS trả format không mong đợi: ${JSON.stringify(data)}`);
      }

      // Audio sinh BẤT ĐỒNG BỘ — URL chưa sẵn ngay. Poll tới khi có audio thật.
      // Tối đa 20 lần × 1.5s (~30s). Audio thật khi res.ok VÀ buffer > 2048 byte.
      let buf: Buffer | null = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const audioRes = await fetch(data.async, { cache: "no-store" });
          if (audioRes.ok) {
            const b = Buffer.from(await audioRes.arrayBuffer());
            if (b.length > 2048) {
              buf = b;
              break;
            }
          }
        } catch {
          // lỗi mạng tạm thời → thử lại
        }
        await sleep(1500);
      }

      if (!buf) {
        throw new Error("FPT audio chưa sẵn sau ~30s (free tier hàng đợi chậm) — thử lại hoặc nâng gói trả phí");
      }

      // durationMs: ưu tiên tính từ buffer thật; không parse được thì ước lượng theo text.
      const durationMs = mp3DurationMs(buf) ?? Math.round((text.length / 15) * 1000);

      return {
        audioBase64: buf.toString("base64"),
        mimeType: "audio/mpeg",
        durationMs,
        costUsd: 0,
      };
    },
    async listVoices() {
      return [
        { id: "banmai", name: "Ban Mai", lang: "vi", gender: "female" },
        { id: "leminh", name: "Lê Minh", lang: "vi", gender: "male" },
        { id: "thuminh", name: "Thu Minh", lang: "vi", gender: "female" },
        { id: "minhquang", name: "Minh Quang", lang: "vi", gender: "male" },
        { id: "linhsan", name: "Linh San", lang: "vi", gender: "female" },
      ];
    },
    async testConnection() {
      return { ok: true, latencyMs: 0 };
    },
  };
}
