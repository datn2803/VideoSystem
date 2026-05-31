import { store } from "@/lib/integration-hub/storage";
import { hub } from "@/lib/integration-hub/hub";
import { audioStore } from "@/lib/audio/storage";
import { scriptStore } from "@/lib/scripts/storage";
import type { ScriptResult } from "@/lib/agents/scripter";
import { videoStore, type VideoDraftRecord } from "../storage";

async function pickRenderProvider() {
  const providers = (await store.listProviders()).filter((p) => p.kind === "render" && p.enabled);
  return providers.find((p) => p.isDefault) || providers[0];
}

const MOCK_MP4_HEADER = Buffer.from([
  0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
]);

function generatePlaceholderMp4(seconds: number): Buffer {
  const payload = Buffer.alloc(Math.round(40 * 1024 * Math.max(1, seconds)), 0xee);
  return Buffer.concat([MOCK_MP4_HEADER, payload]);
}

function toAbsoluteUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${process.env.PUBLIC_APP_URL || ""}${path}`;
}

type ParsedDataPoint = { label: string; value: string; unit: string };

/** Tách 1 câu thành 2 dòng cân đối theo số từ (chỉ để xuống dòng hiển thị). */
function splitTwoLines(text: string): [string, string] {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [(text || "").trim(), ""];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

/**
 * Tách 1 dataPoint dạng tự do thành {label, value, unit} — CHỈ khi có số thật.
 * "Người bứt phá: 65 giờ/tháng" → {label:"Người bứt phá", value:"65", unit:"giờ/tháng"}.
 * Không có số → null (KHÔNG bịa số liệu — anti-fabrication).
 */
function parseDataPoint(raw: string): ParsedDataPoint | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  const numMatch = s.match(/(\d[\d.,]*)/);
  if (!numMatch) return null;
  const value = numMatch[1];
  const numIdx = numMatch.index ?? 0;
  let label = "";
  const colon = s.indexOf(":");
  if (colon >= 0 && colon < numIdx) label = s.slice(0, colon).trim();
  else label = s.slice(0, numIdx).replace(/[:\-–—]\s*$/, "").trim();
  const unit = s.slice(numIdx + value.length).replace(/^[\s:.\-–—]+/, "").trim();
  return { label: label.slice(0, 40), value, unit: unit.slice(0, 24) };
}

/**
 * Map script → biến template HyperFrames `animation` (khớp data-composition-variables).
 *
 * ANTI-FABRICATION: truyền MỌI biến tường minh (giá trị thật hoặc rỗng) để KHÔNG
 * để default đẹp-sẵn của template lọt thành nội dung bịa. Data viz / levels chỉ
 * điền khi có dữ liệu thật parse được; thiếu → rỗng → template tự ẩn scene đó.
 */
function buildAnimationVariables(s: ScriptResult, accentColor?: string): Record<string, unknown> {
  const anim = s.variantPrompts.animation;
  const [hookLine1, hookLine2] = splitTwoLines(s.hook || "");
  const keyword = (anim.keyMessages?.[0] || "").trim();

  // Data viz: chỉ điền nếu có ≥2 dataPoint parse được số THẬT.
  const parsed = (anim.dataPoints || [])
    .map(parseDataPoint)
    .filter((d: ParsedDataPoint | null): d is ParsedDataPoint => d != null);
  const hasData = parsed.length >= 2;
  const a = hasData ? parsed[0] : null;
  const b = hasData ? parsed[1] : null;

  return {
    hook_line1: hookLine1,
    hook_line2: hookLine2,
    hook_keyword: keyword,
    hook_sub: "",
    data_title: "",
    data_a_label: a?.label ?? "",
    data_a_value: a?.value ?? "",
    data_a_unit: a?.unit ?? "",
    data_b_label: b?.label ?? "",
    data_b_value: b?.value ?? "",
    data_b_unit: b?.unit ?? "",
    data_ghost: "",
    // Levels: schema hiện chưa có dữ liệu cấu trúc → rỗng (ẩn scene). KHÔNG bịa.
    levels_title: "",
    levels: "[]",
    cta_top: "",
    cta_keyword: (s.cta || "").trim(),
    cta_sub: "",
    accent_color: accentColor || "#e11d2a",
  };
}

export async function buildAnimation(input: {
  scriptId: string;
  audioId?: string;
}): Promise<VideoDraftRecord> {
  const script = await scriptStore.get(input.scriptId);
  if (!script) throw new Error("Script not found");

  const audios = await audioStore.byScript(input.scriptId);
  const audio = input.audioId
    ? await audioStore.get(input.audioId)
    : audios.find((a) => a.part === "animation") || audios.find((a) => a.part === "full");

  const provider = await pickRenderProvider();
  const mode =
    provider?.name === "creatomate" ? "creatomate" : provider?.name === "hyperframes" ? "hyperframes" : "mock";

  const draft = await videoStore.create({
    scriptId: input.scriptId,
    audioId: audio?.id,
    concept: "animation",
    mode,
    providerName: mode,
    status: "queued",
    progress: 0,
  });

  // HyperFrames: render composition "animation" với biến map từ script (async → poll).
  if (mode === "hyperframes") {
    try {
      const renderer = await hub.render();
      const variables = buildAnimationVariables(script.script);
      const job = await renderer.render({ templateId: "animation", modifications: variables });
      return (await videoStore.update(draft.id, {
        status: "rendering",
        progress: 10,
        providerJobId: job.jobId,
        providerName: "hyperframes",
      }))!;
    } catch (e) {
      return (await videoStore.update(draft.id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      }))!;
    }
  }

  if (mode === "creatomate") {
    try {
      const renderer = await hub.render();
      const templateId = (provider?.config?.animationTemplateId as string) || "";
      if (!templateId) throw new Error("Chưa cấu hình animationTemplateId trong provider Creatomate");
      const anim = script.script.variantPrompts.animation;
      const modifications: Record<string, unknown> = {
        voice_track: toAbsoluteUrl(audio?.storagePath),
        key_message_1: anim.keyMessages[0],
        key_message_2: anim.keyMessages[1],
        key_message_3: anim.keyMessages[2],
        data_1: anim.dataPoints[0],
        data_2: anim.dataPoints[1],
      };
      const job = await renderer.render({ templateId, modifications });
      return (await videoStore.update(draft.id, {
        status: "rendering",
        progress: 10,
        providerJobId: job.jobId,
      }))!;
    } catch (e) {
      return (await videoStore.update(draft.id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      }))!;
    }
  }

  const seconds = script.script.estimatedDurationSec || 30;
  const buf = generatePlaceholderMp4(seconds);
  const storagePath = await videoStore.saveOutputFile(draft.id, buf);
  return (await videoStore.update(draft.id, {
    status: "done",
    progress: 100,
    outputStoragePath: storagePath,
    outputUrl: storagePath,
    durationSec: seconds,
    sizeBytes: buf.length,
    costUsd: 0.05,
  }))!;
}

export async function pollAnimationJob(draftId: string): Promise<VideoDraftRecord | undefined> {
  const draft = await videoStore.get(draftId);
  if (!draft || draft.status === "done" || draft.status === "failed") return draft;
  if ((draft.mode !== "creatomate" && draft.mode !== "hyperframes") || !draft.providerJobId) return draft;

  try {
    const renderer = await hub.render();
    const status = await renderer.poll(draft.providerJobId);
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
