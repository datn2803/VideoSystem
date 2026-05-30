"use server";
import { revalidatePath } from "next/cache";
import { store } from "@/lib/integration-hub/storage";
import { generateContentPlan } from "@/lib/agents/planner";
import { projectStore } from "./storage";

const DEFAULT_OWNER = "demo-user";

function defaultName(profileName: string): string {
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `Plan ${profileName} · ${date}`;
}

// Planner chạy bằng LLM free tier (Gemini) → KHÔNG tốn phí, an toàn để gọi tự động.
export async function createProjectWithPlanAction(profileId: string, n: number = 12, name?: string) {
  const profile = await store.getProfile(profileId);
  if (!profile) throw new Error("Profile not found");

  const { topics, costUsd } = await generateContentPlan(profile, n);

  const project = await projectStore.create({
    ownerId: DEFAULT_OWNER,
    profileId,
    name: name?.trim() || defaultName(profile.name),
    topics,
    planCostUsd: costUsd,
  });

  revalidatePath("/projects");
  return { id: project.id, topicsCount: topics.length };
}

export async function listProjectsAction() {
  return await projectStore.list();
}

export async function getProjectAction(id: string) {
  return await projectStore.get(id);
}

export async function deleteProjectAction(id: string) {
  await projectStore.delete(id);
  revalidatePath("/projects");
  return { ok: true };
}

// Sinh lại content plan (topics) cho project đã có — không đụng scripts đã tạo.
export async function regeneratePlanAction(projectId: string, n: number = 12) {
  const project = await projectStore.get(projectId);
  if (!project) throw new Error("Project not found");
  const profile = await store.getProfile(project.profileId);
  if (!profile) throw new Error("Profile not found");

  const { topics, costUsd } = await generateContentPlan(profile, n);
  await projectStore.update(projectId, { topics, planCostUsd: costUsd });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { topicsCount: topics.length };
}

export async function renameProjectAction(projectId: string, name: string) {
  await projectStore.update(projectId, { name: name.trim() || "Project" });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true };
}
