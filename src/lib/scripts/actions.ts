"use server";
import { revalidatePath } from "next/cache";
import { store } from "@/lib/integration-hub/storage";
import { generateScript, wordBudgetFor, sanitizeStoryboard } from "@/lib/agents/scripter";
import { auditScript } from "@/lib/agents/auditor";
import { projectStore } from "@/lib/projects/storage";
import { fetchSource } from "@/lib/sources/fetch-source";
import { getEngine } from "@/lib/video/engine";
import { sceneVariablesForNode } from "@/lib/video/scene-preview";
import { themeForTopic } from "@/lib/video/builders/c3-animation";
import { getOrCreateBrandKit } from "@/lib/design/director";
import { allowSelfHostRender } from "@/lib/video/cost-guard";
import type { ContentGraph } from "@/lib/content-graph";
import { scriptStore } from "./storage";

export async function generateScriptAction(input: {
  profileId: string;
  projectId?: string;
  topic: string;
  painPoint: string;
  targetPersona: string;
  formatHint?: string;
  priority?: number;
  dataHook?: string; // góc data từ ContentTopic → Fact Researcher (Part 4)
  lengthSec?: number;
  skipAudit?: boolean;
  sourceBrief?: string; // Phase 4: bài nguồn (link→video)
  sourceUrl?: string;
}) {
  const profile = await store.getProfile(input.profileId);
  if (!profile) return { error: "Không tìm thấy profile." } as const;

  // Bọc LLM (Gemini) — lỗi 429/quota/credit trả message RÕ RÀNG thay vì để Next
  // production che thành "Server Components render error" khó hiểu.
  let script: Awaited<ReturnType<typeof generateScript>>;
  let audit: Awaited<ReturnType<typeof auditScript>> | undefined;
  try {
    script = await generateScript({
      profile,
      topic: input.topic,
      painPoint: input.painPoint,
      targetPersona: input.targetPersona,
      dataHook: input.dataHook,
      formatHint: input.formatHint, // D: khung kịch bản (listicle/story/…) → Writer prompt
      lengthSec: input.lengthSec,
      sourceBrief: input.sourceBrief,
      sourceUrl: input.sourceUrl,
    });
    const scriptText = `${script.hook}\n\n${script.body}\n\n${script.cta}`;
    audit = input.skipAudit
      ? undefined
      : await auditScript(scriptText, {
          wordBudget: wordBudgetFor(input.lengthSec || 60),
          // Phase 1: kiểm storyboard graph + anti-fab số liệu (pure code, $0)
          storyboard: script.storyboard,
          hasSources: (script.sources?.length || 0) > 0,
        });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/\b429\b|quota|prepayment|rate.?limit|RESOURCE_EXHAUSTED|exhausted/i.test(msg)) {
      return {
        error:
          "Gemini đang hết quota/credit (lỗi 429). Đợi quota reset (free-tier reset theo phút/ngày) hoặc kiểm tra billing / đổi key Gemini, rồi thử lại.",
      } as const;
    }
    return { error: `Tạo script lỗi: ${msg}` } as const;
  }

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
  const audit = await auditScript(text, {
    wordBudget: wordBudgetFor(rec.script.estimatedDurationSec || 60),
    storyboard: rec.script.storyboard,
    hasSources: (rec.script.sources?.length || 0) > 0,
  });
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

/**
 * Phase 4 — Studio: lưu storyboard Tommy đã sửa (text/duration/data/thứ tự).
 * Đi qua sanitizeStoryboard (vá id/edge + validate + anti-fab) — graph hỏng → báo lỗi rõ.
 */
export async function updateStoryboardAction(scriptId: string, graph: ContentGraph) {
  const rec = await scriptStore.get(scriptId);
  if (!rec) return { error: "Không tìm thấy script" } as const;
  const clean = sanitizeStoryboard(graph, (rec.script.sources?.length || 0) > 0);
  if (!clean) return { error: "Storyboard không hợp lệ (id trùng / cycle / rỗng)" } as const;
  await scriptStore.update(scriptId, { script: { ...rec.script, storyboard: clean } });
  revalidatePath(`/scripts/${scriptId}`);
  return { ok: true, storyboard: clean } as const;
}

/**
 * Phase 4 — Studio: render 1 CẢNH lẻ (preview MP4 ngắn trên engine $0, không
 * đụng drafts chính). Trả jobId → client poll bằng pollSceneRenderAction.
 */
export async function renderSceneAction(scriptId: string, nodeId: string) {
  if (!allowSelfHostRender()) return { error: "RENDER_MODE=mock — bật dryrun/live để render preview cảnh" } as const;
  const rec = await scriptStore.get(scriptId);
  if (!rec) return { error: "Không tìm thấy script" } as const;
  // CHỐT COMPLIANCE (đồng bộ orchestrator): script audit FAIL thì cảnh lẻ cũng
  // KHÔNG render (không cho xuất nội dung vi phạm ra MP4 qua cửa preview).
  if (rec.audit?.status === "fail") {
    return { error: "Compliance: script bị Auditor đánh FAIL — sửa nội dung + Re-audit trước khi render cảnh." } as const;
  }
  const node = rec.script.storyboard?.nodes.find((n) => n.id === nodeId);
  if (!node) return { error: `Không có cảnh "${nodeId}" trong storyboard` } as const;
  const kit = await getOrCreateBrandKit(rec.profileId);
  const profile = await store.getProfile(rec.profileId);
  // Theme fallback DÙNG CHUNG themeForTopic với builder C3 — preview khớp video thật.
  const theme = String(themeForTopic(profile?.industry || "", (rec.script.hook || "x").trim()));
  const { variables } = sceneVariablesForNode(node, kit, theme);
  try {
    const engine = await getEngine("render");
    const job = await engine.render({ templateId: "animation", variables });
    return { jobId: job.jobId } as const;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) } as const;
  }
}

/** Poll job preview cảnh (stateless — không lưu draft). */
export async function pollSceneRenderAction(jobId: string) {
  try {
    const engine = await getEngine("render");
    return await engine.poll(jobId);
  } catch (e) {
    return { status: "failed" as const, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Phase 4 — "Dán link/bài → video": fetch URL (chặn SSRF) → Markdown → sinh
 * script với bài làm source brief (số trong bài = có nguồn). Trả script id.
 */
export async function createScriptFromLinkAction(input: { profileId: string; url: string; lengthSec?: number }) {
  const profile = await store.getProfile(input.profileId);
  if (!profile) return { error: "Không tìm thấy profile" } as const;
  let fetched;
  try {
    fetched = await fetchSource(input.url);
  } catch (e) {
    return { error: `Không đọc được link: ${e instanceof Error ? e.message : String(e)}` } as const;
  }
  const topic = (fetched.title || fetched.url).slice(0, 120);
  return generateScriptAction({
    profileId: input.profileId,
    topic,
    painPoint: `Người xem muốn nắm nhanh nội dung: ${topic}`,
    targetPersona: profile.audience?.segment || "khán giả của kênh",
    lengthSec: input.lengthSec,
    sourceBrief: fetched.markdown,
    sourceUrl: fetched.url,
  });
}
