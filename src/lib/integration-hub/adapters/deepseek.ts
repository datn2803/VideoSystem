import type { LLMProvider, LLMResult } from "../types";

const PRICING: Record<string, { in: number; out: number }> = {
  // USD per million tokens (cache-miss)
  "deepseek-chat": { in: 0.27, out: 1.1 },
  "deepseek-reasoner": { in: 0.55, out: 2.19 },
};

export function makeDeepseekAdapter(opts: { apiKey: string; model?: string }): LLMProvider {
  const baseModel = opts.model || "deepseek-chat";

  return {
    async complete(input) {
      const model = input.model || baseModel;
      const messages: { role: string; content: string }[] = [];
      if (input.system) messages.push({ role: "system", content: input.system });
      for (const m of input.messages) messages.push({ role: m.role, content: m.content });

      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: input.maxTokens ?? 2048,
      };
      if (input.responseFormat === "json") {
        body.response_format = { type: "json_object" };
      }

      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`DeepSeek API error ${res.status}: ${text}`);
      }
      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
        usage: { prompt_tokens: number; completion_tokens: number };
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      const price = PRICING[model] || PRICING["deepseek-chat"];
      const costUsd =
        (data.usage.prompt_tokens * price.in) / 1_000_000 +
        (data.usage.completion_tokens * price.out) / 1_000_000;
      const result: LLMResult = {
        text,
        tokensIn: data.usage.prompt_tokens,
        tokensOut: data.usage.completion_tokens,
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
