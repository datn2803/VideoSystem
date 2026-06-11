import { buildTalkingHead, pollTalkingJob } from "./builders/c1-talking";
import { buildBroll, pollBrollJob } from "./builders/c2-broll";
import { buildAnimation, pollAnimationJob } from "./builders/c3-animation";
import { videoStore, type ConceptKind, type VideoDraftRecord } from "./storage";

export async function buildConcept(
  scriptId: string,
  concept: ConceptKind,
  audioId?: string,
  force?: boolean
): Promise<VideoDraftRecord> {
  if (concept === "talking") return buildTalkingHead({ scriptId, audioId, force });
  if (concept === "broll") return buildBroll({ scriptId, audioId, force });
  if (concept === "animation") return buildAnimation({ scriptId, audioId, force });
  throw new Error(`Unknown concept: ${concept}`);
}

/** Mini p-limit (không thêm dependency): chạy tasks với concurrency giới hạn. */
async function withLimit<T>(limit: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker));
  return results;
}

export async function buildAll(scriptId: string): Promise<VideoDraftRecord[]> {
  // Phase 3: chạy SONG SONG có giới hạn (thay vì thuần tuần tự) — phần build phía
  // app (sinh ảnh, whisper, dispatch) chồng lên nhau tiết kiệm rõ thời gian.
  // VPS tự serialize render (mutex/semaphore) nên dispatch song song an toàn.
  // RENDER_BUILD_CONCURRENCY: default 2 (cân bằng tốc độ vs tải Vercel action).
  const limit = Math.max(1, Number(process.env.RENDER_BUILD_CONCURRENCY) || 2);
  const concepts: ConceptKind[] = ["talking", "broll", "animation"];
  return withLimit(
    limit,
    concepts.map((concept) => async () => {
      try {
        return await buildConcept(scriptId, concept);
      } catch (e) {
        // 1 concept lỗi không kéo sập 2 concept còn lại
        return await videoStore.create({
          scriptId,
          concept,
          providerName: "unknown",
          status: "failed",
          progress: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })
  );
}

export async function pollDraft(draftId: string): Promise<VideoDraftRecord | undefined> {
  const draft = await videoStore.get(draftId);
  if (!draft) return undefined;
  if (draft.concept === "talking") return pollTalkingJob(draftId);
  if (draft.concept === "broll") return pollBrollJob(draftId);
  if (draft.concept === "animation") return pollAnimationJob(draftId);
  return draft;
}
