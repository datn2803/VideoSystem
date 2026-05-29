"use server";
import { revalidatePath } from "next/cache";
import { videoStore, type ConceptKind, type VideoDraftRecord } from "./storage";
import { buildConcept, buildAll, pollDraft } from "./orchestrator";

export async function renderConceptAction(input: {
  scriptId: string;
  concept: ConceptKind;
  audioId?: string;
}) {
  const draft = await buildConcept(input.scriptId, input.concept, input.audioId);
  revalidatePath(`/scripts/${input.scriptId}`);
  return serializeDraft(draft);
}

export async function renderAllConceptsAction(scriptId: string) {
  const drafts = await buildAll(scriptId);
  revalidatePath(`/scripts/${scriptId}`);
  return drafts.map(serializeDraft);
}

export async function pollDraftAction(draftId: string) {
  const draft = await pollDraft(draftId);
  if (!draft) return null;
  return serializeDraft(draft);
}

export async function deleteDraftAction(id: string, scriptId: string) {
  await videoStore.delete(id);
  revalidatePath(`/scripts/${scriptId}`);
  return { ok: true };
}

export async function listDraftsByScriptAction(scriptId: string) {
  return (await videoStore.byScript(scriptId)).map(serializeDraft);
}

function serializeDraft(draft: VideoDraftRecord) {
  return {
    id: draft.id,
    scriptId: draft.scriptId,
    concept: draft.concept,
    mode: draft.mode,
    providerName: draft.providerName,
    status: draft.status,
    progress: draft.progress,
    outputUrl: draft.outputStoragePath || draft.outputUrl,
    durationSec: draft.durationSec,
    sizeBytes: draft.sizeBytes,
    costUsd: draft.costUsd,
    error: draft.error,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}
