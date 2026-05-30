"use server";
import { hub } from "./hub";

// TỐN PHÍ (gọi API sinh ảnh) nhưng do user CHỦ ĐỘNG bấm → không gate RENDER_LIVE.
// Chỉ preview tạm bằng data URL, KHÔNG upload/lưu.
export async function previewImageAction(prompt: string): Promise<{
  ok: boolean;
  dataUrl?: string;
  costUsd?: number;
  provider?: string;
  error?: string;
}> {
  if (!prompt.trim()) return { ok: false, error: "Nhập prompt trước" };
  const img = await hub.image();
  if (!img) return { ok: false, error: "Chưa cấu hình image provider (Add provider → Image)" };
  try {
    const r = await img.generate({ prompt });
    return { ok: true, dataUrl: `data:${r.mimeType};base64,${r.imageBase64}`, costUsd: r.costUsd };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
