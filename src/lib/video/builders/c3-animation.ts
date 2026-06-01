import { hub } from "@/lib/integration-hub/hub";
import { audioStore } from "@/lib/audio/storage";
import { scriptStore } from "@/lib/scripts/storage";
import type { ScriptResult } from "@/lib/agents/scripter";
import { videoStore, type VideoDraftRecord } from "../storage";
import { pickRenderProvider, toAbsoluteUrl, generatePlaceholderMp4 } from "./_shared";

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
/** Rút 1 cụm từ khoá NGẮN (≤4 từ) cho chữ lớn S1 — tránh đổ cả câu dài vào .key 150px.
 * Ưu tiên cụm trong dấu ngoặc/"…", nếu không thì lấy tối đa 4 từ đầu của keyMessage. */
function shortKeyword(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const quoted = s.match(/[""“”'](.+?)[""“”']/);
  const base = (quoted?.[1] || s).trim();
  const words = base.split(/\s+/).filter(Boolean);
  return words.slice(0, 4).join(" ");
}

/** Chọn THEME (0-4) ổn định theo nội dung → mỗi content 1 bộ màu/nền khác nhau
 * (hết tình trạng "đổi content vẫn y 1 concept"). Cùng script → cùng theme (re-render ổn định). */
function themeFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 5; // 5 theme trong animation.html
}

function buildAnimationVariables(s: ScriptResult, accentColor?: string): Record<string, unknown> {
  const anim = s.variantPrompts.animation;
  const [hookLine1, hookLine2] = splitTwoLines(s.hook || "");

  // Data viz: chỉ điền nếu có ≥2 dataPoint parse được số THẬT (anti-fabrication).
  const parsed = (anim.dataPoints || [])
    .map(parseDataPoint)
    .filter((d: ParsedDataPoint | null): d is ParsedDataPoint => d != null);
  const hasData = parsed.length >= 2;
  const a = hasData ? parsed[0] : null;
  const b = hasData ? parsed[1] : null;

  // S3 (hồi sinh): keyMessages = NỘI DUNG THẬT → point cards (badge số + câu chốt).
  // Card đầu đánh dấu "active" để nổi bật (chỉ là style, không phải tuyên bố dữ liệu).
  const points = (anim.keyMessages || []).map((m) => (m || "").trim()).filter(Boolean).slice(0, 3);
  const levels = points.map((m, i) => ({ n: String(i + 1), label: m, active: i === 0 }));

  // S1 từ khoá lớn: cụm NGẮN từ keyMessage đầu (không đổ cả câu vào chữ 150px).
  const keyword = shortKeyword(anim.keyMessages?.[0] || s.hook || "");

  // CTA: tách CÂU HỎI (cta_top) + ACTION (cta_keyword) + TỪ KHOÁ NHẤN (cta_hl, vd 'LAI').
  const ctaRaw = (s.cta || "").trim();
  let ctaTop = "";
  let ctaKeyword = ctaRaw;
  const qIdx = ctaRaw.indexOf("?");
  if (qIdx >= 0 && qIdx < ctaRaw.length - 2) {
    ctaTop = ctaRaw.slice(0, qIdx + 1).trim();
    ctaKeyword = ctaRaw.slice(qIdx + 1).trim();
  }
  const hlMatch = ctaRaw.match(/['"“”']([^'"“”']{1,20})['"“”']/);
  const ctaHl = hlMatch ? hlMatch[1].trim() : "";

  // Bars GỌN: nhãn ngắn + số + đơn vị 1 token → biểu đồ cột không bị chữ lộn xộn.
  const dataBars = parsed.slice(0, 4).map((p) => ({
    label: p.label.slice(0, 24),
    value: p.value,
    unit: ((p.unit || "").split(/[\s,;.]/).filter(Boolean)[0] || "").slice(0, 8),
  }));

  return {
    hook_line1: hookLine1,
    hook_line2: hookLine2,
    hook_keyword: keyword,
    hook_sub: "",
    // Eyebrow cho scene data — nhãn trung tính (KHÔNG phải số bịa), chỉ hiện khi có data thật.
    data_title: hasData ? "Con số biết nói" : "",
    data_a_label: a?.label ?? "",
    data_a_value: a?.value ?? "",
    data_a_unit: a?.unit ?? "",
    data_b_label: b?.label ?? "",
    data_b_value: b?.value ?? "",
    data_b_unit: b?.unit ?? "",
    data_ghost: "",
    // S3 hồi sinh: tiêu đề nhãn trung tính + point cards từ keyMessages (nội dung thật).
    levels_title: points.length ? "Những điểm cốt lõi" : "",
    levels: JSON.stringify(levels),
    cta_top: ctaTop,
    cta_keyword: ctaKeyword,
    cta_sub: "",
    cta_hl: ctaHl,
    accent_color: accentColor || "#e11d2a",
    // Đa dạng theo content + minh hoạ data ở hook (chip số THẬT, rỗng nếu không có số).
    theme: String(themeFromSeed((s.hook || s.cta || "x").trim())),
    hook_stat: parsed[0] ? `${parsed[0].value}|${(parsed[0].unit || "").split(/[\s,;.]/).filter(Boolean)[0]?.slice(0, 10) || ""}` : "",
    // Biến thể data viz theo content: 0=2 cột so sánh, 1=biểu đồ cột (chỉ khi có ≥2 số thật).
    data_style: hasData ? String(themeFromSeed((s.cta || s.hook || "y").trim()) % 2) : "0",
    data_bars: JSON.stringify(dataBars),
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
      // Voice-over: URL công khai (Supabase) — service ở VPS tải audio qua mạng.
      const voiceUrl = toAbsoluteUrl(audio?.storagePath) || "";
      // Độ dài: ưu tiên độ dài audio thật để animation co giãn khớp giọng đọc.
      const durationSec =
        audio?.durationMs && audio.durationMs > 0
          ? Math.round(audio.durationMs / 1000)
          : script.script.estimatedDurationSec || 18.5;
      const variables = {
        ...buildAnimationVariables(script.script),
        voice_url: voiceUrl,
        duration: String(durationSec),
      };
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
  const buf = generatePlaceholderMp4(seconds, 40, 0xee);
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
