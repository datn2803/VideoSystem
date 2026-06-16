/**
 * Format lỗi action tốn tiền (voice/render/script) → message NGƯỜI ĐỌC HIỂU để return {error}.
 *
 * ⚠ Vì sao return thay vì throw: server action THROW ở production bị Next.js REDACT thành
 * "An error occurred in the Server Components render… message is omitted" → giấu mất nguyên nhân thật
 * (vd vượt trần $/ngày). RETURN {error: msg} thì message giữ nguyên tới client → UI hiện đúng.
 */
export function actionErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/\b429\b|quota|prepayment|rate.?limit|resource_exhausted|exhausted/i.test(msg)) {
    return "Provider hết quota/credit (429). Đợi quota reset hoặc kiểm tra billing / đổi key, rồi thử lại.";
  }
  if (/\b50[234]\b|unavailable|overloaded|temporar/i.test(msg)) {
    return "Provider đang quá tải (503). Thử lại sau ít phút.";
  }
  return msg; // cost-guard (trần $/ngày) + lỗi provider khác đã rõ nghĩa → giữ nguyên
}
