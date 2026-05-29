"use server";
import { revalidatePath } from "next/cache";
import { store } from "@/lib/integration-hub/storage";
import { generateScript } from "@/lib/agents/scripter";
import { auditScript } from "@/lib/agents/auditor";
import { scriptStore } from "./storage";

export async function generateScriptAction(input: {
  profileId: string;
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
    topic: input.topic,
    painPoint: input.painPoint,
    targetPersona: input.targetPersona,
    formatHint: input.formatHint,
    priority: input.priority,
    script,
    audit,
  });

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

export async function deleteScriptAction(id: string) {
  await scriptStore.delete(id);
  revalidatePath("/scripts");
  return { ok: true };
}
