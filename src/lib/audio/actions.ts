"use server";
import { revalidatePath } from "next/cache";
import { audioStore, type AudioPart } from "./storage";
import { generateAudioForScript, listAvailableVoices } from "./voice-agent";

export async function generateAudioAction(input: {
  scriptId: string;
  part: AudioPart;
  voiceId?: string;
  voiceName?: string;
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

export async function generateAllAudioAction(scriptId: string, voiceId?: string, voiceName?: string) {
  const parts: AudioPart[] = ["full", "broll", "animation"];
  const results = [];
  for (const part of parts) {
    try {
      const r = await generateAudioForScript({ scriptId, part, voiceId, voiceName });
      results.push({ part, ok: true, id: r.id });
    } catch (e) {
      results.push({ part, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
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
