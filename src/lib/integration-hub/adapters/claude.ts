import type { LLMProvider, LLMResult } from "../types";

const PRICING: Record<string, { in: number; out: number }> = {
  // USD per million tokens
  "claude-opus-4-7": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};

export function makeClaudeAdapter(opts: { apiKey: string; model?: string }): LLMProvider {
  const baseModel = opts.model || "claude-sonnet-4-6";

  return {
    async complete(input) {
      const model = input.model || baseModel;
      const body = {
        model,
        max_tokens: input.maxTokens ?? 2048,
        system: input.system,
        messages: input.messages,
      };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Claude API error ${res.status}: ${text}`);
      }
      const data = (await res.json()) as {
        content: { type: string; text: string }[];
        usage: { input_tokens: number; output_tokens: number };
      };
      const text = data.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      const price = PRICING[model] || PRICING["claude-sonnet-4-6"];
      const costUsd =
        (data.usage.input_tokens * price.in) / 1_000_000 +
        (data.usage.output_tokens * price.out) / 1_000_000;
      const result: LLMResult = {
        text,
        tokensIn: data.usage.input_tokens,
        tokensOut: data.usage.output_tokens,
        costUsd,
        raw: data,
      };
      return result;
    },
    async testConnection() {
      const t0 = Date.now();
      try {
        await this.complete({
          messages: [{ role: "user", content: "Reply with the single word: pong" }],
          maxTokens: 16,
        });
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
      }
    },
  };
}
