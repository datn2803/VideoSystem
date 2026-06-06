import type { LLMResult } from "@/lib/integration-hub/types";

/**
 * Cảnh báo khi 1 grounded call KHÔNG trả nguồn thật → chống ngầm hiểu data từ trí nhớ model
 * là real-time (anti-fabrication). Trả "" nếu có citations (đã grounded thật → khỏi cảnh báo).
 * Phân biệt: model có search nhưng không gắn nguồn vs model KHÔNG search (thường do key chưa bật billing).
 */
export function groundedNoSourceWarning(result: LLMResult): string {
  if ((result.citations?.length ?? 0) > 0) return "";
  const gm = (result.raw as { candidates?: { groundingMetadata?: { webSearchQueries?: string[] } }[] })
    ?.candidates?.[0]?.groundingMetadata;
  const queries = gm?.webSearchQueries ?? [];
  const reason = queries.length
    ? `model có search (${queries.length} truy vấn) nhưng không trả nguồn`
    : `model KHÔNG gọi Google Search (thường do Gemini key chưa bật billing — grounding cần tier trả phí)`;
  return `⚠ KHÔNG có nguồn real-time: ${reason}. Nội dung dưới đây có thể từ trí nhớ model — hãy tự kiểm chứng số liệu.`;
}
