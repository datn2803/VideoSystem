import type { LLMProvider, LLMResult } from "../types";

// PRICING /1M token (USD). Nguồn: ai.google.dev/gemini-api/docs/pricing (kiểm 17/06/2026).
// Gemini 3.x: giá ở mức <200k token (context của ta luôn dưới ngưỡng này); output GỒM thinking tokens.
const PRICING: Record<string, { in: number; out: number }> = {
  // Gemini 3.x — dùng cho Script Engine (Pro: Writer/Researcher; Flash: việc nhẹ)
  "gemini-3.1-pro-preview": { in: 2, out: 12 },
  "gemini-3.5-flash": { in: 1.5, out: 9 },
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5 },
  "gemini-3-flash-preview": { in: 0.5, out: 3 },
  // Gemini 2.5 / cũ (giữ để không vỡ provider đang cấu hình model cũ)
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
  "gemini-2.0-flash-thinking-exp": { in: 0, out: 0 },
  "gemini-1.5-pro": { in: 1.25, out: 5 },
};

export function makeGeminiAdapter(opts: { apiKey: string; model?: string }): LLMProvider {
  const baseModel = opts.model || "gemini-2.0-flash";

  return {
    async complete(input) {
      const model = input.model || baseModel;
      const contents = input.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      // ⚠ Gemini 2.5: grounding (google_search) KHÔNG đi chung responseMimeType JSON → khi grounded thì
      // bỏ JSON, trả TEXT có citations (kiến trúc Researcher[grounded→TEXT] → Writer[JSON]).
      const grounded = input.grounded === true;
      const isJson = input.responseFormat === "json" && !grounded;
      // Gemini 3.x (3.1 Pro, 3.5 Flash…) LUÔN "thinking" (không tắt được) và output GỒM thinking tokens.
      // → nới TRẦN output cho JSON/grounded để thinking không cắt cụt JSON (Writer) / câu trả lời (Researcher).
      //   Trần cao KHÔNG tốn thêm — chỉ tính phí token THỰC dùng.
      const is3x = model.startsWith("gemini-3");
      const generationConfig: Record<string, unknown> = {
        maxOutputTokens: isJson
          ? Math.max(input.maxTokens ?? 0, is3x ? 24576 : 8192)
          : grounded
            // 3.x: nới trần (thinking ăn token). 2.5/cũ: GIỮ NGUYÊN hành vi (input.maxTokens ?? 4096) — không hồi quy.
            ? (is3x ? Math.max(input.maxTokens ?? 0, 8192) : (input.maxTokens ?? 4096))
            : (input.maxTokens ?? 2048),
        responseMimeType: isJson ? "application/json" : undefined,
      };
      // ⚠ THINKING — khác nhau giữa các hệ:
      //  - Gemini 2.5: bật thinking mặc định → ăn hết token budget → JSON rỗng/cụt → tắt bằng thinkingBudget:0.
      //    (Trừ grounded: thinking giúp model QUYẾT ĐỊNH gọi google_search; tắt → trả lời từ trí nhớ.)
      //  - Gemini 3.x: KHÔNG tắt được thinking + dùng `thinkingLevel` (KHÔNG phải thinkingBudget). Set
      //    thinkingBudget cho 3.x = API LỖI (mix thinkingLevel/Budget). → ĐỂ MẶC ĐỊNH (không gửi thinkingConfig),
      //    chỉ nới trần output ở trên cho JSON không bị rỗng. (docs: ai.google.dev/gemini-api/docs/thinking)
      if (model.startsWith("gemini-2.5") && !grounded) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
      const body: Record<string, unknown> = {
        contents,
        systemInstruction: input.system ? { parts: [{ text: input.system }] } : undefined,
        generationConfig,
      };
      if (grounded) {
        body.tools = [{ google_search: {} }];
      }
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${text}`);
      }
      const data = (await res.json()) as {
        candidates?: {
          content?: { parts?: { text: string; thought?: boolean }[] };
          finishReason?: string;
          groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
        }[];
        usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; thoughtsTokenCount?: number };
      };
      const cand = data.candidates?.[0];
      // Bỏ "thinking part" (p.thought=true): với flash-lite, dù thinkingBudget:0 vẫn có thể rò 1 part
      // suy nghĩ ra trước JSON → "thought{...}" làm parse vỡ. Chỉ lấy part trả lời thật.
      const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text).join("") || "";
      if (!text) {
        throw new Error(
          `Gemini trả về rỗng (finishReason=${cand?.finishReason ?? "unknown"}). Thử tăng maxTokens hoặc kiểm tra thinking budget.`
        );
      }
      // Trích nguồn từ grounding (dedup theo url). Chỉ có khi grounded=true.
      let citations: { title: string; url: string }[] | undefined;
      if (grounded) {
        const seen = new Set<string>();
        const list: { title: string; url: string }[] = [];
        for (const chunk of cand?.groundingMetadata?.groundingChunks ?? []) {
          const web = chunk.web;
          if (!web?.uri || seen.has(web.uri)) continue;
          seen.add(web.uri);
          list.push({ title: web.title || web.uri, url: web.uri });
        }
        citations = list.length ? list : undefined;
      }
      const usage = data.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
      // Model lạ chưa có trong PRICING: 3.x → ước theo 3.5-flash (gần đúng hơn); cũ → 2.0-flash.
      const price = PRICING[model] || (model.startsWith("gemini-3") ? PRICING["gemini-3.5-flash"] : PRICING["gemini-2.0-flash"]);
      // Output GỒM thinking tokens (3.x tách thoughtsTokenCount riêng) → cộng vào để tính phí ĐÚNG.
      const outTokens = usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0);
      const costUsd =
        (usage.promptTokenCount * price.in) / 1_000_000 +
        (outTokens * price.out) / 1_000_000;
      const result: LLMResult = {
        text,
        tokensIn: usage.promptTokenCount,
        tokensOut: outTokens,
        costUsd,
        citations,
        raw: data,
      };
      return result;
    },
    async testConnection() {
      const t0 = Date.now();
      try {
        await this.complete({
          messages: [{ role: "user", content: "Reply only: pong" }],
          maxTokens: 16,
        });
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
      }
    },
  };
}
