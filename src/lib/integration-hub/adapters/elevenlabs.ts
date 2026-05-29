import type { TTSProvider, TTSResult } from "../types";

// ElevenLabs pricing approximate — Creator $22 / 100k chars = $0.00022/char
const COST_PER_CHAR = 0.00022;

export function makeElevenLabsAdapter(opts: {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
}): TTSProvider {
  const defaultVoice = opts.voiceId || "21m00Tcm4TlvDq8ikWAM"; // Rachel
  const modelId = opts.modelId || "eleven_multilingual_v2";

  return {
    async synthesize({ text, voiceId }) {
      const vid = voiceId || defaultVoice;
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
        method: "POST",
        headers: {
          "xi-api-key": opts.apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ElevenLabs error ${res.status}: ${errText}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const result: TTSResult = {
        audioBase64: buf.toString("base64"),
        mimeType: "audio/mpeg",
        durationMs: Math.round((text.length / 15) * 1000), // rough estimate ~15 chars/sec speech
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
