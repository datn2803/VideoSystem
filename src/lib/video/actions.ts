"use server";
import { revalidatePath } from "next/cache";
import { videoStore, type ConceptKind, type VideoDraftRecord } from "./storage";
import { buildConcept, buildAll, pollDraft } from "./orchestrator";
import { actionErrorMessage } from "@/lib/integration-hub/action-error";

export async function renderConceptAction(input: {
  scriptId: string;
  concept: ConceptKind;
  audioId?: string;
  force?: boolean;
}) {
  // try/catch → return {error}: vượt trần $/ngày / provider lỗi hiện ĐÚNG message, không để Next redact.
  try {
    const draft = await buildConcept(input.scriptId, input.concept, input.audioId, input.force);
    revalidatePath(`/scripts/${input.scriptId}`);
    return serializeDraft(draft);
  } catch (e) {
    return { error: actionErrorMessage(e) };
  }
}

export async function renderAllConceptsAction(scriptId: string) {
  try {
    const drafts = await buildAll(scriptId);
    revalidatePath(`/scripts/${scriptId}`);
    return { drafts: drafts.map(serializeDraft) };
  } catch (e) {
    return { error: actionErrorMessage(e) };
  }
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
