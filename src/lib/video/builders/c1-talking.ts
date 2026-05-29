import crypto from "node:crypto";
import { store } from "@/lib/integration-hub/storage";
import { hub } from "@/lib/integration-hub/hub";
import { audioStore } from "@/lib/audio/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { videoStore, type VideoDraftRecord } from "../storage";

/** Chế độ render avatar thật. "mock" = không gọi API trả phí. */
type TalkingMode = "heygen" | "d-id" | "mock";

async function pickAvatarProvider() {
  const providers = (await store.listProviders()).filter((p) => p.kind === "avatar" && p.enabled);
  return providers.find((p) => p.isDefault) || providers[0];
}

async function decideMode(): Promise<TalkingMode> {
  // Cost-guard: chỉ render thật khi RENDER_LIVE="1". Mọi trường hợp khác → mock.
  if (process.env.RENDER_LIVE !== "1") return "mock";
  const avatar = await pickAvatarProvider();
  if (avatar?.name === "heygen") return "heygen";
  if (avatar?.name === "d-id") return "d-id";
  return "mock";
}

/** Chuyển storagePath thành URL công khai mà D-ID/HeyGen tải được từ internet. */
function toPublicUrl(storagePath?: string): string | undefined {
  if (!storagePath) return undefined;
  if (/^https?:\/\//i.test(storagePath)) return storagePath; // đã là URL công khai (Supabase Storage)
  const base = (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
  return base ? `${base}${storagePath}` : undefined; // không có base → không thể tạo URL công khai
}

const isHttpUrl = (u?: string): u is string => !!u && /^https?:\/\//i.test(u);

function hashRender(scriptId: string, voiceId: string | undefined, avatarImageUrl: string): string {
  return crypto.createHash("sha256").update(`${scriptId}::${voiceId || ""}::${avatarImageUrl}`).digest("hex");
}

/** Gọi fn, retry tối đa `retries` lần (mặc định 1) cho provider trả phí. */
async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const MOCK_MP4_HEADER = Buffer.from([
  0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
]);

function generatePlaceholderMp4(seconds: number): Buffer {
  const payload = Buffer.alloc(Math.round(50 * 1024 * Math.max(1, seconds)), 0xab);
  return Buffer.concat([MOCK_MP4_HEADER, payload]);
}

export async function buildTalkingHead(input: {
  scriptId: string;
  audioId?: string;
}): Promise<VideoDraftRecord> {
  const script = await scriptStore.get(input.scriptId);
  if (!script) throw new Error("Script not found");

  const audios = await audioStore.byScript(input.scriptId);
  const audio = input.audioId
    ? await audioStore.get(input.audioId)
    : audios.find((a) => a.part === "full") || audios[0];

  const mode = await decideMode();
  const provider = await pickAvatarProvider();

  if (mode === "heygen" || mode === "d-id") {
    // ── Pre-flight validate TRƯỚC khi tạo draft / gọi API (tránh phí + tránh xoá video cũ) ──
    const audioUrl = toPublicUrl(audio?.storagePath);

    // Nguồn ảnh presenter / avatar id
    let avatarId: string;
    if (mode === "d-id") {
      const img = (provider?.config?.avatarId as string | undefined)?.trim();
      // KHÔNG fallback "Daisy-inskirt-20220818" (đó là avatar id của HeyGen, sai với D-ID).
      if (!isHttpUrl(img)) {
        throw new Error(
          "D-ID cần URL ảnh presenter. Cấu hình 'Ảnh presenter (URL công khai)' (https://.../face.jpg) trong Integration Hub trước khi render."
        );
      }
      avatarId = img;

      // D-ID phải tải audio từ internet → bắt buộc audio_url công khai.
      if (!isHttpUrl(audioUrl)) {
        throw new Error(
          "D-ID cần audio_url công khai (https). Bật Supabase Storage hoặc set PUBLIC_APP_URL để file audio có URL internet."
        );
      }
    } else {
      // HeyGen: avatar id (không phải URL ảnh) — giữ fallback hợp lệ của HeyGen.
      avatarId = (provider?.config?.avatarId as string) || "Daisy-inskirt-20220818";
    }

    // ── Cost-guard cache: input giống hệt đã render xong → trả video cũ, KHÔNG gọi lại API ──
    const renderHash = hashRender(input.scriptId, audio?.voiceId, avatarId);
    const cached = (await videoStore.byScript(input.scriptId)).find(
      (v) => v.concept === "talking" && v.status === "done" && v.renderHash === renderHash && !!v.outputStoragePath
    );
    if (cached) return cached;

    const draft = await videoStore.create({
      scriptId: input.scriptId,
      audioId: audio?.id,
      concept: "talking",
      mode,
      providerName: provider?.name || mode,
      renderHash,
      status: "queued",
      progress: 0,
    });

    try {
      const avatarAdapter = await hub.avatar();
      const job = await withRetry(
        () =>
          avatarAdapter.renderTalking({
            avatarId,
            aspectRatio: "9:16",
            audioUrl,
            // Chỉ HeyGen mới cho fallback text-to-speech; D-ID đã bắt buộc audioUrl ở trên.
            text: audioUrl ? undefined : script.script.hook + " " + script.script.body + " " + script.script.cta,
          }),
        1
      );
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

  // ── Mock mode (RENDER_LIVE != "1" hoặc không có avatar provider) ──
  const draft = await videoStore.create({
    scriptId: input.scriptId,
    audioId: audio?.id,
    concept: "talking",
    mode: "mock",
    providerName: "mock",
    status: "queued",
    progress: 0,
  });
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
  }))!;
}

export async function pollTalkingJob(draftId: string): Promise<VideoDraftRecord | undefined> {
  const draft = await videoStore.get(draftId);
  if (!draft || draft.status === "done" || draft.status === "failed") return draft;
  const isLiveAvatar = draft.mode === "heygen" || draft.mode === "d-id";
  if (!isLiveAvatar || !draft.providerJobId) return draft;

  try {
    const adapter = await hub.avatar();
    const status = await adapter.poll(draft.providerJobId);
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
    if (status.status === "rendering") {
      return await videoStore.update(draftId, {
        status: "rendering",
        progress: Math.min(90, (draft.progress || 0) + 10),
      });
    }
    return draft;
  } catch (e) {
    return await videoStore.update(draftId, {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
