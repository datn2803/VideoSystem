import { hub } from "@/lib/integration-hub/hub";
import { store } from "@/lib/integration-hub/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { audioStore, type AudioPart } from "./storage";

async function recordTTSUsage(costUsd: number, chars: number, providerId?: string) {
  const providers = (await store.listProviders()).filter((p) => p.kind === "tts" && p.enabled);
  const def = providerId ? await store.getProvider(providerId) : providers.find((p) => p.isDefault) || providers[0];
  if (!def) return;
  await store.recordUsage({
    providerId: def.id,
    date: new Date().toISOString().slice(0, 10),
    unitsUsed: chars,
    costEstimateUsd: costUsd,
    requestCount: 1,
  });
}

async function getDefaultTTSProvider() {
  const providers = (await store.listProviders()).filter((p) => p.kind === "tts" && p.enabled);
  return providers.find((p) => p.isDefault) || providers[0];
}

export async function generateAudioForScript(input: {
  scriptId: string;
  part: AudioPart;
  voiceId?: string;
  voiceName?: string;
  lang?: string;
}) {
  const record = await scriptStore.get(input.scriptId);
  if (!record) throw new Error("Script not found");

  const textMap: Record<AudioPart, string> = {
    hook: record.script.hook,
    body: record.script.body,
    cta: record.script.cta,
    full: `${record.script.hook}\n\n${record.script.body}\n\n${record.script.cta}`,
    broll: record.script.variantPrompts.broll.voiceOver,
    animation: record.script.variantPrompts.animation.voiceOver,
  };
  const text = textMap[input.part] || "";
  if (!text.trim()) throw new Error(`Không có text cho part "${input.part}"`);

  const provider = await getDefaultTTSProvider();
  const providerName = provider?.name || "mock";
  const tts = await hub.tts();
  const result = await tts.synthesize({ text, voiceId: input.voiceId, lang: input.lang || "vi" });

  await recordTTSUsage(result.costUsd, text.length, provider?.id);

  const saved = await audioStore.save({
    scriptId: input.scriptId,
    part: input.part,
    audioBase64: result.audioBase64,
    mimeType: result.mimeType,
    durationMs: result.durationMs,
    voiceId: input.voiceId || provider?.config?.voiceId as string || "default",
    voiceName: input.voiceName,
    providerName,
    costUsd: result.costUsd,
  });
  return saved;
}

export async function listAvailableVoices(): Promise<{ id: string; name: string; lang: string; gender?: string; providerName: string }[]> {
  const provider = await getDefaultTTSProvider();
  if (!provider) return [];
  try {
    const tts = await hub.tts();
    const voices = await tts.listVoices();
    return voices.map((v) => ({ ...v, providerName: provider.name }));
  } catch {
    return [];
  }
}
