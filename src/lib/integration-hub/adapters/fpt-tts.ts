import type { TTSProvider, TTSResult } from "../types";

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
      const data = (await res.json()) as { async: string };
      const audioRes = await fetch(data.async);
      const buf = Buffer.from(await audioRes.arrayBuffer());
      return {
        audioBase64: buf.toString("base64"),
        mimeType: "audio/mpeg",
        durationMs: Math.round((text.length / 15) * 1000),
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
