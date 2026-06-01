import type { ImageProvider, ImageResult } from "../types";

// OpenAI GPT Image — /v1/images/generations luôn trả base64 (b64_json).
function estimateCost(model: string, size: string): number {
  if (model.includes("mini")) return 0.02;
  return size === "1024x1024" ? 0.04 : 0.08; // dọc 1024x1536 đắt hơn chút
}

export function makeOpenAIImageAdapter(opts: { apiKey: string; modelId?: string; size?: string; quality?: string }): ImageProvider {
  const model = opts.modelId || "gpt-image-1";
  const size = opts.size || "1024x1536";
  // QUAN TRỌNG (latency): "medium"/"high" gpt-image quá chậm → 5 ảnh vượt Vercel
  // 60s → render timeout (đã test thực tế: medium FAIL). Giữ "low" (~5-15s/ảnh) để
  // an toàn 60s; chất lượng đến từ PROMPT/art-direction tốt (planShotPrompts), không
  // từ tham số quality. Chỉ tăng nếu chuyển sinh ảnh sang nền không-timeout (VPS).
  const quality = opts.quality || "low";
  return {
    async generate({ prompt }): Promise<ImageResult> {
      const body: Record<string, unknown> = { model, prompt, n: 1, size };
      // chỉ gpt-image hỗ trợ low/medium/high; dall-e dùng standard/hd → bỏ qua.
      if (model.includes("gpt-image")) body.quality = quality;
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`OpenAI Image error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI Image: response thiếu b64_json");
      return { imageBase64: b64, mimeType: "image/png", costUsd: estimateCost(model, size) };
    },
    async testConnection() {
      const t0 = Date.now();
      try {
        // GET /v1/models — rẻ, KHÔNG tốn ảnh.
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { authorization: `Bearer ${opts.apiKey}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
      }
    },
  };
}
