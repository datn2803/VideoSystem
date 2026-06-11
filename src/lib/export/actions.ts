"use server";
import { revalidatePath } from "next/cache";
import { exportStore, type Platform } from "./storage";
import { localizeCaption } from "./caption-localizer";
import { scriptStore } from "@/lib/scripts/storage";
import { markExportedAction as markScriptExported } from "@/lib/review/actions";

export async function recordExportAction(input: { scriptId: string; platform: Platform }) {
  const script = await scriptStore.get(input.scriptId);
  if (!script) throw new Error("Script not found");
  const { caption, hashtags } = localizeCaption({
    baseCaption: script.script.caption,
    baseHashtags: script.script.hashtags,
    platform: input.platform,
    topic: script.topic,
  });
  const record = await exportStore.recordExport({
    scriptId: input.scriptId,
    platform: input.platform,
    captionLocalized: caption,
    hashtags,
  });
  revalidatePath("/export");
  return record;
}

/** Hook lịch đăng (Phase 5): đặt/đổi thời điểm dự kiến đăng cho 1 export. */
export async function scheduleExportAction(exportId: string, scheduledAt: string | null) {
  if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) {
    return { error: "Thời điểm không hợp lệ" } as const;
  }
  const rec = await exportStore.schedule(exportId, scheduledAt);
  if (!rec) return { error: "Không tìm thấy export" } as const;
  revalidatePath("/export");
  return { ok: true, record: rec } as const;
}

export async function markAllExportedAction(scriptId: string) {
  // Record exports for all 3 platforms
  for (const platform of ["tiktok", "facebook", "youtube_shorts"] as Platform[]) {
    await recordExportAction({ scriptId, platform });
  }
  await markScriptExported(scriptId);
  revalidatePath("/export");
  revalidatePath("/review");
  return { ok: true };
}
