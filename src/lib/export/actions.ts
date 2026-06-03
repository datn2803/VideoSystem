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
