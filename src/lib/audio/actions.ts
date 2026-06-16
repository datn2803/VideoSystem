"use server";
import { revalidatePath } from "next/cache";
import { audioStore, type AudioPart } from "./storage";
import { generateAudioForScript, listAvailableVoices } from "./voice-agent";
import { actionErrorMessage } from "@/lib/integration-hub/action-error";

export async function generateAudioAction(input: {
  scriptId: string;
  part: AudioPart;
  voiceId?: string;
  voiceName?: string;
  speed?: number;
}) {
  // try/catch → return {error}: lỗi tốn tiền (vượt trần $/ngày, provider 429/503) hiện ĐÚNG message,
  // KHÔNG để throw → Next redact thành "Server Components render" khó hiểu.
  try {
    const record = await generateAudioForScript(input);
    revalidatePath(`/scripts/${input.scriptId}`);
    return {
      id: record.id,
      storagePath: record.storagePath,
      durationMs: record.durationMs,
      costUsd: record.costUsd,
      providerName: record.providerName,
      voiceName: record.voiceName,
      sizeBytes: record.sizeBytes,
    };
  } catch (e) {
    return { error: actionErrorMessage(e) };
  }
}

export async function generateAllAudioAction(scriptId: string, voiceId?: string, voiceName?: string, speed?: number) {
  try {
    const parts: AudioPart[] = ["full", "broll", "animation"];
    // Chạy SONG SONG các part để giảm tổng thời gian (ElevenLabs đồng bộ, mỗi part ~1–3s;
    // atempo VPS nhẹ ~1s nên 3 part song song vẫn trong timeout).
    // (audioStore.save có khóa ghi nên không mất bản ghi.)
    const results = await Promise.all(
      parts.map(async (part) => {
        try {
          const r = await generateAudioForScript({ scriptId, part, voiceId, voiceName, speed });
          return { part, ok: true, id: r.id };
        } catch (e) {
          return { part, ok: false, error: actionErrorMessage(e) };
        }
      })
    );
    revalidatePath(`/scripts/${scriptId}`);
    const failed = results.filter((r) => !r.ok);
    // Tất cả part lỗi (vd vượt trần ngay từ part đầu) → trả {error} để UI hiện rõ thay vì "reload ra rỗng".
    if (failed.length === parts.length && failed[0] && "error" in failed[0]) {
      return { error: failed[0].error as string };
    }
    return { results };
  } catch (e) {
    return { error: actionErrorMessage(e) };
  }
}

export async function deleteAudioAction(id: string, scriptId: string) {
  await audioStore.delete(id);
  revalidatePath(`/scripts/${scriptId}`);
  return { ok: true };
}

export async function listVoicesAction() {
  return await listAvailableVoices();
}
