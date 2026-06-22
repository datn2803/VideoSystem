// ── C4 "AUTO-EDITOR" — ghép C1 talking-head NỀN + cutaway b-roll C2 ──
// ADDITIVE: concept MỚI "auto-editor", KHÔNG đụng C1/C2/C3. Lấy C1+C2 đã render từ videoStore,
// tính điểm chèn cutaway theo Whisper word-timing, rồi dispatch render-service /compose (ffmpeg).
// AUDIO = giọng C1 xuyên suốt (master, khớp môi).
// PHASE 1: ghép nền + cutaway. PHASE 2 (thêm): nhịp cutaway DÀY hơn + LỚP CHỮ chạy SUỐT
// (caption karaoke + keyword IN HOA) qua groupWords/extractKeywords → /compose. CHƯA zoom (phase 3).
//
// THIẾT KẾ: planCutaways là PURE (unit-test offline). buildAutoEditor/pollAutoEditorJob dùng hub
// (như C2) → dispatch /compose qua RenderProvider.compose; poll dùng CHUNG /jobs/:id (như pollBrollJob).
import { videoStore, type VideoDraftRecord, type ConceptKind } from "../storage";
import { toAbsoluteUrl, generatePlaceholderMp4 } from "./_shared";
import { planCutaways } from "../cutaway-plan";
import { groupWords, resolveCaptionWindows } from "../overlay-plan";
import { hub } from "@/lib/integration-hub/hub";
import { audioStore } from "@/lib/audio/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { transcribeWords, getOpenAIKey, type Word } from "@/lib/audio/whisper";
import { isLive } from "../cost-guard";

export { planCutaways } from "../cutaway-plan";
export type { Cutaway } from "../cutaway-plan";

/**
 * Ghép C4: C1 (talking) NỀN + cutaway C2 (b-roll). Lấy C1/C2 ĐÃ render xong của script (hoặc id
 * truyền vào). audio C1 = master. preferRealScene/cờ KHÔNG liên quan ở đây. Lỗi → draft "failed"
 * (KHÔNG kéo sập các concept khác). Provider không hỗ trợ compose (mock) → placeholder để dev chạy.
 */
export async function buildAutoEditor(input: {
  scriptId: string;
  audioId?: string;
  force?: boolean;
  c1DraftId?: string;
  c2DraftId?: string;
}): Promise<VideoDraftRecord> {
  const drafts = await videoStore.byScript(input.scriptId);
  const pickDone = (concept: ConceptKind, id?: string) =>
    id
      ? drafts.find((d) => d.id === id)
      : drafts.find((d) => d.concept === concept && d.status === "done" && (d.outputStoragePath || d.outputUrl));
  const c1 = pickDone("talking", input.c1DraftId);
  const c2 = pickDone("broll", input.c2DraftId);
  if (!c1 || c1.status !== "done") throw new Error("Auto-editor (C4) cần C1 Talking Head đã render XONG trước.");
  if (!c2 || c2.status !== "done") throw new Error("Auto-editor (C4) cần C2 B-roll đã render XONG trước.");
  const c1Url = toAbsoluteUrl(c1.outputStoragePath || c1.outputUrl);
  const c2Url = toAbsoluteUrl(c2.outputStoragePath || c2.outputUrl);
  if (!c1Url || !c2Url)
    throw new Error("Auto-editor (C4): C1/C2 thiếu URL công khai để render-service tải (bật Supabase hoặc set PUBLIC_APP_URL).");

  // Tổng thời lượng (để TÍNH cutaway) lấy từ C1; server sẽ ffprobe lại duration THẬT cho OUTPUT.
  const script = await scriptStore.get(input.scriptId);
  const totalDur = Number(c1.durationSec) || script?.script.estimatedDurationSec || 30;

  // Whisper word-timing (best-effort, KHÔNG throw) → cutaway bám lời. Thiếu → chia đều.
  let words: Word[] | null = null;
  try {
    const audios = await audioStore.byScript(input.scriptId);
    const audio = input.audioId ? await audioStore.get(input.audioId) : audios.find((a) => a.part === "full") || audios[0];
    const audioUrl = toAbsoluteUrl(audio?.storagePath);
    const key = await getOpenAIKey();
    if (isLive() && audioUrl && /^https?:/i.test(audioUrl) && key) {
      words = await transcribeWords(audioUrl, key);
    }
  } catch {
    words = null;
  }
  const cutawaySegments = planCutaways(words, totalDur);
  // Lớp chữ: CHỈ caption karaoke (Tommy chốt BỎ keyword IN HOA — gọn, giống editor TikTok pro,
  // hết "93" trùng caption). maxWords:4 → cụm 2–4 từ/cụm (chuẩn pro; mergeShortGroups ép ≥2 từ).
  // Không Whisper (words null) → groups rỗng → server bỏ lớp chữ (ghép như phase 1).
  // resolveCaptionWindows: clamp end mỗi cụm ≤ start cụm kế → KHÔNG 2 cụm caption đè nhau (bug "NAT8n…").
  const captionGroups = resolveCaptionWindows(groupWords(words, { maxWords: 4 }));

  const draft = await videoStore.create({
    scriptId: input.scriptId,
    audioId: c1.audioId || c2.audioId,
    concept: "auto-editor",
    mode: "hyperframes",
    providerName: "auto-editor",
    status: "queued",
    progress: 0,
  });

  try {
    const provider = await hub.render();
    // Provider không hỗ trợ /compose (mock/creatomate) → placeholder (dev/mock chạy được, KHÔNG ghép thật).
    if (!provider.compose) {
      const buf = generatePlaceholderMp4(Math.round(totalDur), 50, 0x4c);
      const storagePath = await videoStore.saveOutputFile(draft.id, buf);
      return (await videoStore.update(draft.id, {
        status: "done",
        progress: 100,
        mode: "mock",
        providerName: "mock",
        outputStoragePath: storagePath,
        outputUrl: storagePath,
        durationSec: Math.round(totalDur),
        sizeBytes: buf.length,
      }))!;
    }
    const job = await provider.compose({
      c1Url,
      c2Url,
      cutawaySegments,
      durationSec: Math.round(totalDur),
      captionGroups,
      // keywords KHÔNG truyền nữa (đã bỏ keyword IN HOA); type giữ optional nên không vỡ.
    });
    return (await videoStore.update(draft.id, {
      status: "rendering",
      progress: 10,
      providerJobId: job.jobId,
      providerName: `auto-editor (${cutawaySegments.length} cutaway · ${captionGroups.length} caption)`,
      durationSec: Math.round(totalDur),
    }))!;
  } catch (e) {
    return (await videoStore.update(draft.id, {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    }))!;
  }
}

/** Poll job /compose — mirror pollBrollJob: done → tải output về lưu videoStore. */
export async function pollAutoEditorJob(draftId: string): Promise<VideoDraftRecord | undefined> {
  const draft = await videoStore.get(draftId);
  if (!draft || draft.status === "done" || draft.status === "failed") return draft;
  // Cứu draft KẸT: queued mà chưa có providerJobId quá 90s → failed (UI cho Thử lại).
  if (draft.status === "queued" && !draft.providerJobId) {
    const ageMs = Date.now() - new Date(draft.updatedAt).getTime();
    if (ageMs > 90_000)
      return await videoStore.update(draftId, { status: "failed", error: "Khởi tạo compose quá lâu rồi bị ngắt (timeout). Bấm Thử lại." });
    return draft;
  }
  if (draft.mode !== "hyperframes" || !draft.providerJobId) return draft;

  try {
    const provider = await hub.render();
    const status = await provider.poll(draft.providerJobId);
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
