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
  if (concept === "broll") return buildBroll({ scriptId, audioId });
  if (concept === "animation") return buildAnimation({ scriptId, audioId });
  throw new Error(`Unknown concept: ${concept}`);
}

export async function buildAll(scriptId: string): Promise<VideoDraftRecord[]> {
  // Run sequentially to avoid hitting provider rate limits; could parallelize for real APIs
  const results: VideoDraftRecord[] = [];
  for (const concept of ["talking", "broll", "animation"] as ConceptKind[]) {
    try {
      results.push(await buildConcept(scriptId, concept));
    } catch (e) {
      // Continue with others
      const draft = await videoStore.create({
        scriptId,
        concept,
        providerName: "unknown",
        status: "failed",
        progress: 0,
        error: e instanceof Error ? e.message : String(e),
      });
      results.push(draft);
    }
  }
  return results;
}

export async function pollDraft(draftId: string): Promise<VideoDraftRecord | undefined> {
  const draft = await videoStore.get(draftId);
  if (!draft) return undefined;
  if (draft.concept === "talking") return pollTalkingJob(draftId);
  if (draft.concept === "broll") return pollBrollJob(draftId);
  if (draft.concept === "animation") return pollAnimationJob(draftId);
  return draft;
}
