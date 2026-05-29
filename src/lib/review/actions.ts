"use server";
import { revalidatePath } from "next/cache";
import { scriptStore, type ReviewState } from "@/lib/scripts/storage";

const REVIEWER = "demo-user";

async function setState(id: string, state: ReviewState, comment?: string) {
  const updated = await scriptStore.update(id, {
    reviewState: state,
    reviewComment: comment,
    reviewedAt: new Date().toISOString(),
    reviewedBy: REVIEWER,
  });
  revalidatePath("/review");
  revalidatePath(`/scripts/${id}`);
  return updated;
}

export async function moveToReviewAction(id: string) {
  return setState(id, "in_review");
}

export async function approveScriptAction(id: string, comment?: string) {
  return setState(id, "approved", comment);
}

export async function rejectScriptAction(id: string, comment?: string) {
  return setState(id, "rejected", comment);
}

export async function moveBackToDraftAction(id: string) {
  return setState(id, "draft");
}

export async function markExportedAction(id: string) {
  return setState(id, "exported");
}
