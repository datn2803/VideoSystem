"use server";
import { revalidatePath } from "next/cache";
import { store } from "@/lib/integration-hub/storage";
import { generateScript } from "@/lib/agents/scripter";
import { auditScript } from "@/lib/agents/auditor";
import { projectStore } from "@/lib/projects/storage";
import { scriptStore } from "./storage";

export async function generateScriptAction(input: {
  profileId: string;
  projectId?: string;
  topic: string;
  painPoint: string;
  targetPersona: string;
  formatHint?: string;
  priority?: number;
  lengthSec?: number;
  skipAudit?: boolean;
}) {
  const profile = await store.getProfile(input.profileId);
  if (!profile) throw new Error("Profile not found");

  const script = await generateScript({
    profile,
    topic: input.topic,
    painPoint: input.painPoint,
    targetPersona: input.targetPersona,
    lengthSec: input.lengthSec,
  });

  // Compose full text for audit
  const scriptText = `${script.hook}\n\n${script.body}\n\n${script.cta}`;
  const audit = input.skipAudit ? undefined : await auditScript(scriptText);

  const record = await scriptStore.create({
    profileId: input.profileId,
    projectId: input.projectId,
    topic: input.topic,
    painPoint: input.painPoint,
    targetPersona: input.targetPersona,
    formatHint: input.formatHint,
    priority: input.priority,
    script,
    audit,
  });

  // Nếu sinh từ 1 project → gắn script vào project đó để hiện trong detail.
  if (input.projectId) {
    await projectStore.addScript(input.projectId, record.id);
    revalidatePath(`/projects/${input.projectId}`);
  }

  revalidatePath("/scripts");
  revalidatePath("/projects");
  return { id: record.id, script, audit };
}

export async function reAuditScriptAction(id: string) {
  const rec = await scriptStore.get(id);
  if (!rec) throw new Error("Script not found");
  const text = `${rec.script.hook}\n\n${rec.script.body}\n\n${rec.script.cta}`;
  const audit = await auditScript(text);
  await scriptStore.update(id, { audit });
  revalidatePath(`/scripts/${id}`);
  return { audit };
}

/**
 * Lưu DATA POINTS đã được Tommy DUYỆT/SỬA (human gatekeeper) → C3 chỉ hiển thị số
 * người dùng đã xác nhận, KHÔNG dùng số AI tự đẻ chưa kiểm chứng (chống tin sai).
 * buildAnimation đọc thẳng từ script.variantPrompts.animation.dataPoints nên chỉ
 * cần ghi đè field này; render C3 sau đó sẽ dùng số đã duyệt.
 */
export async function updateAnimationDataPointsAction(id: string, dataPoints: string[]) {
  const rec = await scriptStore.get(id);
  if (!rec) throw new Error("Script not found");
  const clean = (Array.isArray(dataPoints) ? dataPoints : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const next = {
    ...rec.script,
    variantPrompts: {
      ...rec.script.variantPrompts,
      animation: { ...rec.script.variantPrompts.animation, dataPoints: clean },
    },
  };
  await scriptStore.update(id, { script: next });
  revalidatePath(`/scripts/${id}`);
  return { ok: true, dataPoints: clean };
}

export async function deleteScriptAction(id: string) {
  await scriptStore.delete(id);
  revalidatePath("/scripts");
  return { ok: true };
}
