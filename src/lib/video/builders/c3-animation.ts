import { store } from "@/lib/integration-hub/storage";
import { hub } from "@/lib/integration-hub/hub";
import { audioStore } from "@/lib/audio/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { videoStore, type VideoDraftRecord } from "../storage";

async function pickRenderProvider() {
  const providers = (await store.listProviders()).filter((p) => p.kind === "render" && p.enabled);
  return providers.find((p) => p.isDefault) || providers[0];
}

const MOCK_MP4_HEADER = Buffer.from([
  0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
]);

function generatePlaceholderMp4(seconds: number): Buffer {
  const payload = Buffer.alloc(Math.round(40 * 1024 * Math.max(1, seconds)), 0xee);
  return Buffer.concat([MOCK_MP4_HEADER, payload]);
}

function toAbsoluteUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${process.env.PUBLIC_APP_URL || ""}${path}`;
}

export async function buildAnimation(input: {
  scriptId: string;
  audioId?: string;
}): Promise<VideoDraftRecord> {
  const script = await scriptStore.get(input.scriptId);
  if (!script) throw new Error("Script not found");

  const audios = await audioStore.byScript(input.scriptId);
  const audio = input.audioId
    ? await audioStore.get(input.audioId)
    : audios.find((a) => a.part === "animation") || audios.find((a) => a.part === "full");

  const provider = await pickRenderProvider();
  const mode = provider?.name === "creatomate" ? "creatomate" : "mock";

  const draft = await videoStore.create({
    scriptId: input.scriptId,
    audioId: audio?.id,
    concept: "animation",
    mode,
    providerName: mode,
    status: "queued",
    progress: 0,
  });

  if (mode === "creatomate") {
    try {
      const renderer = await hub.render();
      const templateId = (provider?.config?.animationTemplateId as string) || "";
      if (!templateId) throw new Error("Chưa cấu hình animationTemplateId trong provider Creatomate");
      const anim = script.script.variantPrompts.animation;
      const modifications: Record<string, unknown> = {
        voice_track: toAbsoluteUrl(audio?.storagePath),
        key_message_1: anim.keyMessages[0],
        key_message_2: anim.keyMessages[1],
        key_message_3: anim.keyMessages[2],
        data_1: anim.dataPoints[0],
        data_2: anim.dataPoints[1],
      };
      const job = await renderer.render({ templateId, modifications });
      return (await videoStore.update(draft.id, {
        status: "rendering",
        progress: 10,
        providerJobId: job.jobId,
      }))!;
    } catch (e) {
      return (await videoStore.update(draft.id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      }))!;
    }
  }

  const seconds = script.script.estimatedDurationSec || 30;
  const buf = generatePlaceholderMp4(seconds);
  const storagePath = await videoStore.saveOutputFile(draft.id, buf);
  return (await videoStore.update(draft.id, {
    status: "done",
    progress: 100,
    outputStoragePath: storagePath,
    outputUrl: storagePath,
    durationSec: seconds,
    sizeBytes: buf.length,
    costUsd: 0.05,
  }))!;
}

export async function pollAnimationJob(draftId: string): Promise<VideoDraftRecord | undefined> {
  const draft = await videoStore.get(draftId);
  if (!draft || draft.status === "done" || draft.status === "failed") return draft;
  if (draft.mode !== "creatomate" || !draft.providerJobId) return draft;

  try {
    const renderer = await hub.render();
    const status = await renderer.poll(draft.providerJobId);
    if (status.status === "done" && status.outputUrl) {
      const res = await fetch(status.outputUrl);
      if (!res.ok) throw new Error(`Download fail HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const storagePath = await videoStore.saveOutputFile(draftId, buf);
      return await videoStore.update(draftId, {
        status: "done",
        progress: 100,
        outputUrl: status.outputUrl,
        outputStoragePath: storagePath,
        sizeBytes: buf.length,
      });
    }
    if (status.status === "failed") {
      return await videoStore.update(draftId, { status: "failed", error: status.error });
    }
    return await videoStore.update(draftId, {
      status: "rendering",
      progress: Math.min(90, (draft.progress || 0) + 10),
    });
  } catch (e) {
    return await videoStore.update(draftId, {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
