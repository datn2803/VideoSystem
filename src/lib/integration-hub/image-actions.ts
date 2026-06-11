"use server";
import { hub } from "./hub";
import { isLive, assertDailyCap, recordPaidUsage } from "@/lib/video/cost-guard";

/**
 * Preview ảnh (TỐN PHÍ — gọi API sinh ảnh thật). P0.1 review đợt 2: TRƯỚC ĐÂY
 * không gate ("user chủ động bấm") → dryrun bấm preview vẫn mất tiền. NAY gate
 * ĐỦ cost-guard như mọi call trả phí khác:
 *  - RENDER_MODE ≠ live → chặn với thông báo rõ (preview là để NGẮM ảnh thật,
 *    mock không có ý nghĩa);
 *  - live → assertDailyCap TRƯỚC khi gọi + recordPaidUsage SAU (trần ngày đếm đủ).
 * Chỉ preview tạm bằng data URL, KHÔNG upload/lưu.
 */
export async function previewImageAction(prompt: string): Promise<{
  ok: boolean;
  dataUrl?: string;
  costUsd?: number;
  provider?: string;
  error?: string;
}> {
  if (!prompt.trim()) return { ok: false, error: "Nhập prompt trước" };
  if (!isLive()) {
    return {
      ok: false,
      error: "Preview ảnh gọi API trả phí — đang ở chế độ " + (process.env.RENDER_MODE || "dryrun") +
        ". Bật RENDER_MODE=live (env Vercel) rồi thử lại.",
    };
  }
  const img = await hub.image();
  if (!img) return { ok: false, error: "Chưa cấu hình image provider (Add provider → Image)" };
  const estUsd = Number(process.env.IMAGE_COST_PER_IMAGE_USD) || 0.05;
  try {
    await assertDailyCap(estUsd, "preview ảnh");
    const r = await img.generate({ prompt });
    await recordPaidUsage("image", r.costUsd || estUsd, 1);
    return { ok: true, dataUrl: `data:${r.mimeType};base64,${r.imageBase64}`, costUsd: r.costUsd };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
