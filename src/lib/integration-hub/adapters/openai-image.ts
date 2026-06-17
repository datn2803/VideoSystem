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
    async generate({ prompt, transparent, quality: qOverride }): Promise<ImageResult> {
      // gpt-image-2 / mini KHÔNG hỗ trợ background:transparent → ép gpt-image-1 cho ảnh cutout.
      // Opaque (C2) giữ nguyên model cấu hình.
      const TRANSPARENT_OK = new Set(["gpt-image-1"]);
      const effModel = transparent && !TRANSPARENT_OK.has(model) ? "gpt-image-1" : model;
      const body: Record<string, unknown> = { model: effModel, prompt, n: 1, size };
      // chỉ gpt-image hỗ trợ low/medium/high; dall-e dùng standard/hd → bỏ qua.
      if (effModel.includes("gpt-image")) body.quality = qOverride || quality;
      // Ảnh cutout C3: nền TRONG SUỐT (PNG) để ghép trên nền tối composition.
      if (transparent && effModel.includes("gpt-image")) {
        body.background = "transparent";
        body.output_format = "png";
      }
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`OpenAI Image error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI Image: response thiếu b64_json");
      return { imageBase64: b64, mimeType: "image/png", costUsd: estimateCost(effModel, size) };
    },
    // C2 ACCURATE: dùng /v1/images/edits với 1 ảnh tham chiếu (logo brand thật) →
    // ghép logo THẬT vào cảnh thay vì để AI vẽ lại (méo/sai). gpt-image hỗ trợ edits.
    async generateFromReference({ prompt, referencePng, referenceMime, quality: qOverride }): Promise<ImageResult> {
      const effModel = model.includes("gpt-image") ? model : "gpt-image-1";
      const form = new FormData();
      form.append("model", effModel);
      form.append("prompt", prompt);
      form.append("n", "1");
      form.append("size", size);
      if (effModel.includes("gpt-image")) form.append("quality", qOverride || quality);
      const refBytes = new Uint8Array(referencePng);
      form.append("image", new Blob([refBytes], { type: referenceMime || "image/png" }), "reference.png");
      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}` },
        body: form,
      });
      if (!res.ok) throw new Error(`OpenAI Image edit error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI Image edit: response thiếu b64_json");
      return { imageBase64: b64, mimeType: "image/png", costUsd: estimateCost(effModel, size) };
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
