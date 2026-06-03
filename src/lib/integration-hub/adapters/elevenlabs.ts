import type { TTSProvider, TTSResult } from "../types";

// ElevenLabs pricing approximate — Creator $22 / 100k chars = $0.00022/char
const COST_PER_CHAR = 0.00022;

// Chỉ Turbo v2.5 & Flash v2.5 nhận language_code để ÉP ngôn ngữ.
// multilingual_v2 / v3 nếu gửi language_code sẽ LỖI API → gửi có điều kiện.
const LANG_ENFORCED_MODELS = new Set(["eleven_turbo_v2_5", "eleven_flash_v2_5"]);

// Tốc độ đọc mặc định của dự án: 1.1 = nhanh hơn ~10% → cuốn hơn, không hụt hơi.
// ElevenLabs chỉ nhận voice_settings.speed trong [0.7, 1.2]; ngoài dải dễ méo dấu thanh tiếng Việt.
const DEFAULT_SPEED = 1.1;
const clampSpeed = (v: number) => Math.min(1.2, Math.max(0.7, v));

export function makeElevenLabsAdapter(opts: {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  languageCode?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
}): TTSProvider {
  // Rachel là giọng ENGLISH — chỉ là fallback. Khuyến nghị set Voice ID người Việt
  // (Voice Library → Language=Vietnamese) qua provider config để đọc tự nhiên.
  const defaultVoice = opts.voiceId || "21m00Tcm4TlvDq8ikWAM";
  // Turbo v2.5 hỗ trợ tiếng Việt; multilingual_v2 KHÔNG → mặc định Turbo v2.5.
  const modelId = opts.modelId || "eleven_turbo_v2_5";
  const langCode = opts.languageCode || "vi";

  return {
    async synthesize({ text, voiceId, speed }) {
      const vid = voiceId || defaultVoice;
      // speed có thể override theo từng call; fallback config opts.speed → DEFAULT_SPEED.
      const effectiveSpeed = clampSpeed(speed ?? opts.speed ?? DEFAULT_SPEED);
      // Default cho tiếng Việt (ngôn ngữ có thanh điệu): style cao dễ méo dấu thanh.
      const body: Record<string, unknown> = {
        text,
        model_id: modelId,
        voice_settings: {
          stability: opts.stability ?? 0.5,
          similarity_boost: opts.similarityBoost ?? 0.85,
          style: opts.style ?? 0.0,
          use_speaker_boost: opts.useSpeakerBoost ?? true,
          speed: effectiveSpeed,
        },
      };
      // Chỉ ép language_code với model hỗ trợ; tránh lỗi API trên multilingual_v2/v3.
      if (LANG_ENFORCED_MODELS.has(modelId) && langCode) {
        body.language_code = langCode;
      }
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
        method: "POST",
        headers: {
          "xi-api-key": opts.apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ElevenLabs error ${res.status}: ${errText}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const result: TTSResult = {
        audioBase64: buf.toString("base64"),
        mimeType: "audio/mpeg",
        durationMs: Math.round((text.length / 15) * 1000 / effectiveSpeed), // ~15 chars/sec, chia speed vì audio nhanh hơn → ngắn hơn
        costUsd: text.length * COST_PER_CHAR,
      };
      return result;
    },
    async listVoices() {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": opts.apiKey },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { voices: { voice_id: string; name: string; labels?: Record<string, string> }[] };
      return data.voices.map((v) => ({
        id: v.voice_id,
        name: v.name,
        lang: v.labels?.language || "multi",
        gender: v.labels?.gender,
      }));
    },
    async testConnection() {
      const t0 = Date.now();
      try {
        // Dùng /v1/voices (thuộc quyền "Voices") thay vì /v1/user (đòi quyền "User" riêng) —
        // tránh 401 khi key chỉ cấp quyền Text to Speech + Voices như app cần.
        const res = await fetch("https://api.elevenlabs.io/v1/voices", {
          headers: { "xi-api-key": opts.apiKey },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
      }
    },
  };
}
