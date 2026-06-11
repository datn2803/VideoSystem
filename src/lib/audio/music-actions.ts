"use server";
/**
 * Nhạc nền MiniMax (Phase 5) — actions. Gate ĐỦ cost-guard: chỉ chạy ở
 * RENDER_MODE=live + trần chi phí/ngày + usage ghi nhận (extra-usage).
 */
import { revalidatePath } from "next/cache";
import { scriptStore } from "@/lib/scripts/storage";
import { isLive, assertDailyCap, recordExtraUsage } from "@/lib/video/cost-guard";
import { generateMusic, musicPromptFor, minimaxCreds } from "./minimax-music";
import { audioStore } from "./storage";

export async function generateMusicAction(scriptId: string, promptOverride?: string) {
  if (!isLive()) {
    return { error: "RENDER_MODE chưa phải live — nhạc MiniMax là dịch vụ trả phí (gate cost-guard)." } as const;
  }
  if (!minimaxCreds()) {
    return { error: "Chưa cấu hình MINIMAX_API_KEY (Vercel env) — thêm key rồi thử lại." } as const;
  }
  const rec = await scriptStore.get(scriptId);
  if (!rec) return { error: "Không tìm thấy script" } as const;

  const estUsd = Number(process.env.MUSIC_COST_PER_TRACK_USD) || 0.1;
  try {
    await assertDailyCap(estUsd, "nhạc MiniMax");
    const prompt = promptOverride?.trim() || musicPromptFor(rec.topic);
    const bytes = await generateMusic(prompt);
    // Xoá track nhạc cũ của script (1 script 1 nhạc nền)
    const olds = (await audioStore.byScript(scriptId)).filter((a) => a.part === "music");
    for (const o of olds) await audioStore.delete(o.id);
    const record = await audioStore.save({
      scriptId,
      part: "music",
      audioBase64: bytes.toString("base64"),
      mimeType: "audio/mpeg",
      durationMs: 0, // MiniMax không trả duration cho music — mix dùng duration voice
      voiceId: "minimax-music-1.5",
      voiceName: "MiniMax music",
      providerName: "minimax",
      costUsd: estUsd,
    });
    await recordExtraUsage("minimax-music", estUsd);
    revalidatePath(`/scripts/${scriptId}`);
    return { ok: true, id: record.id, storagePath: record.storagePath } as const;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) } as const;
  }
}

export async function deleteMusicAction(scriptId: string) {
  const olds = (await audioStore.byScript(scriptId)).filter((a) => a.part === "music");
  for (const o of olds) await audioStore.delete(o.id);
  revalidatePath(`/scripts/${scriptId}`);
  return { ok: true } as const;
}
