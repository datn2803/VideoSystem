import { hub } from "@/lib/integration-hub/hub";
import { store } from "@/lib/integration-hub/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { makeMockTTS } from "@/lib/integration-hub/adapters/mock";
import { isLive, assertDailyCap, consumeReserve } from "@/lib/video/cost-guard";
import { audioStore, type AudioPart } from "./storage";
import { sanitizeForTTS } from "./sanitize-tts";
import { speedUpAudioViaService } from "./speed-service";

// Ghi usage TTS vào provider_usage (cộng vào spendTodayUsd của cost-guard).
// Giữ tên riêng thay vì recordPaidUsage chung vì ghi CHI TIẾT hơn (chars + providerId).
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
  consumeReserve(costUsd); // quyết toán đặt chỗ assertDailyCap (P1.1)
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
  speed?: number;
}) {
  const record = await scriptStore.get(input.scriptId);
  if (!record) throw new Error("Script not found");

  const textMap: Record<AudioPart, string> = {
    hook: record.script.hook,
    body: record.script.body,
    cta: record.script.cta,
    full: `${record.script.hook}\n\n${record.script.body}\n\n${record.script.cta}`,
    broll: record.script.variantPrompts.broll.voiceOver,
    music: "", // part music KHÔNG đi qua TTS — sinh ở minimax-music
    animation: record.script.variantPrompts.animation.voiceOver,
  };
  const rawText = textMap[input.part] || "";
  if (!rawText.trim()) throw new Error(`Không có text cho part "${input.part}"`);
  // Làm sạch text TRƯỚC khi đưa vào TTS (không đổi text hiển thị/đã lưu).
  const text = sanitizeForTTS(rawText);

  const provider = await getDefaultTTSProvider();
  // P0.2 review đợt 2 — cost-guard TTS (ElevenLabs = PAID, trước đây không gate):
  //  - RENDER_MODE ≠ live → ÉP mock TTS (MP3 im lặng đúng độ dài ước tính, $0) —
  //    pipeline C1/C2/C3 vẫn chạy trọn ở dryrun, không gọi ElevenLabs tính phí;
  //  - live → trần chi phí/ngày chặn TRƯỚC khi synthesize.
  const live = isLive();
  const providerName = live ? provider?.name || "mock" : "mock (cost-guard)";
  const tts = live ? await hub.tts() : makeMockTTS();
  if (live) {
    const per1k = Number(process.env.TTS_COST_PER_1K_CHARS_USD) || 0.05;
    await assertDailyCap((text.length / 1000) * per1k, `TTS ${text.length} ký tự`);
  }

  // Chiến lược tốc độ: ElevenLabs đọc native tới 1.2 (API chặn cứng), phần vượt
  // → ffmpeg atempo trên VPS (giữ cao độ). target ≤1.2 → KHÔNG gọi VPS.
  const cfgSpeed = Number(provider?.config?.speed);
  const target = Math.min(2.0, Math.max(0.7, input.speed ?? (Number.isFinite(cfgSpeed) ? cfgSpeed : 1.5)));
  const nativeSpeed = Math.min(target, 1.2);

  const result = await tts.synthesize({ text, voiceId: input.voiceId, lang: input.lang || "vi", speed: nativeSpeed });

  if (live) await recordTTSUsage(result.costUsd, text.length, provider?.id);

  let audioBase64 = result.audioBase64;
  let durationMs = result.durationMs;
  const mimeType = result.mimeType;

  if (target > 1.2) {
    const factor = target / 1.2;
    try {
      const sped = await speedUpAudioViaService(audioBase64, factor);
      if (sped) {
        audioBase64 = sped.audioBase64;
        durationMs = sped.durationMs ?? Math.round(durationMs / factor);
      }
    } catch (e) {
      // VPS lỗi/tắt → KHÔNG fail cả lần tạo; giữ audio native 1.2 + log cảnh báo.
      console.warn("[voice-agent] atempo VPS lỗi, dùng audio native 1.2:", e instanceof Error ? e.message : e);
    }
  }

  const saved = await audioStore.save({
    scriptId: input.scriptId,
    part: input.part,
    audioBase64,
    mimeType,
    durationMs,
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
