import type { LLMProvider, LLMResult } from "../types";

// Gemini 2.0 Flash free tier — pricing rough estimate per million tokens
const PRICING: Record<string, { in: number; out: number }> = {
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
      const isJson = input.responseFormat === "json";
      const generationConfig: Record<string, unknown> = {
        maxOutputTokens: isJson ? Math.max(input.maxTokens ?? 0, 8192) : (input.maxTokens ?? 2048),
        responseMimeType: isJson ? "application/json" : undefined,
      };
      // Gemini 2.5 bật "thinking" mặc định → ăn hết token budget, JSON trả về rỗng/cụt. Tắt đi.
      if (model.startsWith("gemini-2.5")) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
      const body = {
        contents,
        systemInstruction: input.system ? { parts: [{ text: input.system }] } : undefined,
        generationConfig,
      };
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
        candidates?: { content?: { parts?: { text: string }[] }; finishReason?: string }[];
        usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
      };
      const cand = data.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text).join("") || "";
      if (!text) {
        throw new Error(
          `Gemini trả về rỗng (finishReason=${cand?.finishReason ?? "unknown"}). Thử tăng maxTokens hoặc kiểm tra thinking budget.`
        );
      }
      const usage = data.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
      const price = PRICING[model] || PRICING["gemini-2.0-flash"];
      const costUsd =
        (usage.promptTokenCount * price.in) / 1_000_000 +
        (usage.candidatesTokenCount * price.out) / 1_000_000;
      const result: LLMResult = {
        text,
        tokensIn: usage.promptTokenCount,
        tokensOut: usage.candidatesTokenCount,
        costUsd,
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
