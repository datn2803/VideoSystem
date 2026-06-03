"use server";
import { revalidatePath } from "next/cache";
import { audioStore, type AudioPart } from "./storage";
import { generateAudioForScript, listAvailableVoices } from "./voice-agent";

export async function generateAudioAction(input: {
  scriptId: string;
  part: AudioPart;
  voiceId?: string;
  voiceName?: string;
  speed?: number;
}) {
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
}

export async function generateAllAudioAction(scriptId: string, voiceId?: string, voiceName?: string, speed?: number) {
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
        return { part, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );
  revalidatePath(`/scripts/${scriptId}`);
  return results;
}

export async function deleteAudioAction(id: string, scriptId: string) {
  await audioStore.delete(id);
  revalidatePath(`/scripts/${scriptId}`);
  return { ok: true };
}

export async function listVoicesAction() {
  return await listAvailableVoices();
}
