import type { ImageProvider, ImageResult } from "../types";

// Gemini 2.5 Flash Image (Nano Banana) — sinh ảnh qua generateContent.
// Ảnh trả về base64 ở candidates[0].content.parts[].inlineData.data
export function makeGeminiImageAdapter(opts: { apiKey: string; modelId?: string }): ImageProvider {
  const model = opts.modelId || "gemini-2.5-flash-image";
  return {
    async generate({ prompt }): Promise<ImageResult> {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": opts.apiKey, "content-type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (!res.ok) throw new Error(`Gemini Image error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType?: string } }[] } }[];
      };
      const parts = data.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p) => p.inlineData?.data);
      if (!imgPart?.inlineData) throw new Error("Gemini Image: không tìm thấy ảnh (inlineData) trong response");
      return {
        imageBase64: imgPart.inlineData.data,
        mimeType: imgPart.inlineData.mimeType || "image/png",
        costUsd: 0.039,
      };
    },
    async testConnection() {
      const t0 = Date.now();
      try {
        // List models — rẻ, KHÔNG tốn ảnh.
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${opts.apiKey}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
      }
    },
  };
}
