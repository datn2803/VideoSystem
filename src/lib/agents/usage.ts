import { store } from "@/lib/integration-hub/storage";

/**
 * Ghi nhận usage của 1 lần gọi LLM vào provider LLM mặc định (cho dashboard chi phí).
 * Best-effort: không có provider thì bỏ qua, không throw.
 */
export async function recordLLMUsage(costUsd: number, tokensIn: number, tokensOut: number) {
  const providers = (await store.listProviders()).filter((p) => p.kind === "llm" && p.enabled);
  const def = providers.find((p) => p.isDefault) || providers[0];
  if (!def) return;
  await store.recordUsage({
    providerId: def.id,
    date: new Date().toISOString().slice(0, 10),
    unitsUsed: tokensIn + tokensOut,
    costEstimateUsd: costUsd,
    requestCount: 1,
  });
}
