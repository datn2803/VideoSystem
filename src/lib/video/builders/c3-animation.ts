import crypto from "node:crypto";
import { hub } from "@/lib/integration-hub/hub";
import { audioStore } from "@/lib/audio/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { blobUpload } from "@/lib/backend/blob-store";
import { getOpenAIKey, transcribeWords, alignByWeights } from "@/lib/audio/whisper";
import type { ScriptResult } from "@/lib/agents/scripter";
import { videoStore, type VideoDraftRecord } from "../storage";
import { pickRenderProvider, toAbsoluteUrl, generatePlaceholderMp4 } from "./_shared";

/**
 * Sinh 1 ảnh cutout nền TRONG SUỐT trên Vercel (OpenAI reach được; VPS bị Cloudflare
 * chặn IP datacenter) → upload Supabase → trả PUBLIC URL cho VPS render fetch.
 * Lỗi bất kỳ → trả "" (scene tự ẩn ảnh — fallback 2A, KHÔNG fail render).
 */
async function generateHeroImageUrl(scriptId: string, subject: string): Promise<string> {
  try {
    const img = await hub.image();
    if (!img) return "";
    // Light Bento v3: NHÂN VẬT 3D cartoon (Pixar/Blender), hợp nền sáng pastel.
    const prompt =
      `3D cartoon character, Pixar/Blender style, friendly young person mascot, ${subject}, ` +
      `expressive pose (thumbs up or pointing), clean soft studio lighting, pastel rim light, ` +
      `isolated on transparent background, no text, no watermark, not a real identifiable person, ` +
      `centered, high detail, playful tech vibe`;
    // quality "medium" vừa Vercel 60s (1 ảnh); adapter tự fallback nếu provider không phải gpt-image.
    const r = await img.generate({ prompt, transparent: true, quality: "medium" });
    const buf = Buffer.from(r.imageBase64, "base64");
    const hash = crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 10);
    const filename = `c3-hero-${scriptId}-${hash}.png`;
    return await blobUpload({ bucket: "broll-images", filename, buffer: buf, contentType: r.mimeType || "image/png" });
  } catch (e) {
    console.error("[c3 hero image]", e instanceof Error ? e.message : e);
    return "";
  }
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
  return h % 3; // 3 light theme trong animation.html (lavender/cream/mist)
}

/** Token đơn vị NGẮN (1 từ) cho chip/bar. */
function oneToken(unit: string): string {
  return ((unit || "").split(/[\s,;.]/).filter(Boolean)[0] || "").slice(0, 10);
}

/** Độ lớn số (bỏ dấu phân nhóm) để chọn "số khổng lồ" cho S2. */
function magnitude(value: string): number {
  const n = Number(String(value).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Đơn vị NGẮN cho số lớn S2: cắt mệnh đề phía sau (dấu phẩy/;/"tăng"…), lấy token đầu. */
function shortUnit(unit: string): string {
  let u = (unit || "").trim();
  u = u.split(/[,;]|\s(?:tăng|giảm|và|hoặc|so với)\b/i)[0].trim(); // bỏ mệnh đề sau
  u = (u.split(/\s+/)[0] || "").trim(); // token đầu (đơn vị thường 1 token)
  return u.slice(0, 8);
}

type SceneSpec = { id: string; weight: number };

function buildAnimationVariables(
  s: ScriptResult,
  accentColor?: string
): { variables: Record<string, unknown>; sceneSpecs: SceneSpec[] } {
  const anim = s.variantPrompts.animation;
  const [hookLine1, hookLine2] = splitTwoLines(s.hook || "");
  const keyword = shortKeyword(anim.keyMessages?.[0] || s.hook || "");

  // Parse số THẬT từ dataPoints (anti-fabrication). Không số → không scene data.
  const parsed = (anim.dataPoints || [])
    .map(parseDataPoint)
    .filter((d: ParsedDataPoint | null): d is ParsedDataPoint => d != null);

  // S1 chip + S2 big number: số lớn nhất parse được làm "số khổng lồ".
  const hookStat = parsed[0] ? `${parsed[0].value}|${oneToken(parsed[0].unit)}` : "";
  const big = parsed.length
    ? parsed.reduce((m, p) => (magnitude(p.value) > magnitude(m.value) ? p : m))
    : null;

  // S3 bars: chỉ cột CÙNG ĐƠN VỊ (mode đơn vị), ≥2 mới hiện (tránh trộn % với "tuần").
  const unitOf = (p: ParsedDataPoint) => oneToken(p.unit);
  const counts = new Map<string, number>();
  for (const p of parsed) counts.set(unitOf(p), (counts.get(unitOf(p)) || 0) + 1);
  let modeUnit = "";
  let bestCount = -1;
  for (const p of parsed) {
    const u = unitOf(p);
    const c = counts.get(u) || 0;
    if (c > bestCount) { bestCount = c; modeUnit = u; } // tie-break: thứ tự xuất hiện đầu
  }
  const sameUnit = parsed.filter((p) => unitOf(p) === modeUnit);
  const barsOK = sameUnit.length >= 2;
  const dataBars = sameUnit.slice(0, 4).map((p) => ({
    label: p.label.slice(0, 24),
    value: p.value,
    unit: oneToken(p.unit).slice(0, 8),
  }));

  // MỖI keyMessage = 1 CẢNH riêng (point scene) → tăng số cảnh, nhịp nhanh hơn,
  // thay vì gộp hết vào 1 ô pills tĩnh 18s. Cắt ≤120 ký tự cho gọn.
  const points = (anim.keyMessages || []).map((m) => (m || "").trim()).filter(Boolean).slice(0, 4);
  const pointScenes = points.map((m, i) => ({ n: i + 1, total: points.length, text: m.slice(0, 120) }));
  // Không dùng keyMessages làm fallback pills nữa (đã có pointScenes) → tránh trùng nội dung.
  const levels: { n: string; label: string; active: boolean }[] = [];

  // CTA: tách CÂU HỎI (cta_top) + ACTION (cta_keyword) + TỪ KHOÁ NHẤN (cta_hl).
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

  // ── v4.1: nội dung DISTINCT cho từng archetype — ưu tiên trường LLM, fallback data cũ ──
  // Số: ưu tiên bigStat (LLM khẳng định số thật); nếu không có thì dùng số lớn nhất parse được.
  const bigStat =
    anim.bigStat && String(anim.bigStat.value || "").trim() ? anim.bigStat : null;
  const bignumValue = bigStat ? String(bigStat.value) : big ? big.value : "";
  const bignumUnit = bigStat ? shortUnit(String(bigStat.unit || "")) : big ? shortUnit(big.unit) : "";
  const bignumLabel = (bigStat ? String(bigStat.label || "") : big ? big.label || "" : "").toUpperCase();

  // Bars: ưu tiên anim.bars (số thật, có chữ số), fallback dataBars parse; ≥2 mới hiện.
  const llmBars = Array.isArray(anim.bars)
    ? anim.bars
        .map((b) => ({ label: String(b.label || "").slice(0, 24), value: String(b.value || ""), unit: oneToken(String(b.unit || "")).slice(0, 8) }))
        .filter((b) => b.label && /\d/.test(b.value))
    : [];
  const finalBars = llmBars.length >= 2 ? llmBars.slice(0, 4) : barsOK ? dataBars : [];

  // Pills: CHỈ dùng anim.pills (4 điểm NGẮN chuyên dụng). keyMessages giờ thành point scenes
  // riêng → không gộp vào pills nữa (tránh trùng + tránh pill quá dài).
  const llmPills = Array.isArray(anim.pills)
    ? anim.pills.map((p) => String(p.text || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const pills = llmPills.map((t, i) => ({ n: String(i + 1), label: t.slice(0, 60) }));

  // Compare / principle / callout (định tính — content hợp lệ, không phải số bịa).
  const cmp =
    anim.compare && String(anim.compare.leftTitle || "").trim() && Array.isArray(anim.compare.leftItems)
      ? {
          leftTitle: String(anim.compare.leftTitle).slice(0, 40),
          leftItems: anim.compare.leftItems.map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 3),
          rightTitle: String(anim.compare.rightTitle || "Với AI").slice(0, 40),
          rightItems: (anim.compare.rightItems || []).map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 3),
        }
      : null;
  const principle = String(anim.principle || "").trim();
  const callout = String(anim.callout || "").trim();

  // ── Danh sách CẢNH (khớp thứ tự `order` trong animation.html) + trọng số CĂN THEO GIỌNG ĐỌC.
  //    GIỌNG = read script (hook+body+cta). hero↔hook, cta↔cta. CÁC CẢNH BODY (stat/bars/point/
  //    compare/emph) đều rơi trong phần BODY → CHIA ĐỀU thời lượng body (vì data là NON-READ,
  //    không có lời riêng — chúng minh hoạ trong lúc giọng đọc body). → hết dồn/lỡ nhịp. ──
  const wc = (t: string) => Math.max(1, String(t || "").trim().split(/\s+/).filter(Boolean).length);
  const hookW = wc(s.hook), bodyW = wc(s.body), ctaW = wc(s.cta);
  const ids: string[] = ["s1"];
  if (bignumValue) ids.push("s2");
  if (finalBars.length >= 2) ids.push("s4b");
  pointScenes.forEach((_p, i) => ids.push("spt" + i));
  if (pills.length) ids.push("s6");
  if (callout || principle) ids.push("s_emph");
  if (cmp) ids.push("s_cmp");
  ids.push("s7");
  const numBody = Math.max(1, ids.length - 2); // trừ hero (s1) + cta (s7)
  const bodyEach = bodyW / numBody;
  const sceneSpecs: SceneSpec[] = ids.map((id) => ({
    id,
    weight: id === "s1" ? hookW : id === "s7" ? ctaW : bodyEach,
  }));

  const variables = {
    // S1 hook
    hook_line1: hookLine1,
    hook_line2: hookLine2,
    hook_keyword: keyword,
    hook_sub: "",
    hook_eyebrow: "",
    hook_stat: hookStat,
    // S2 big number (rỗng nếu không có số → scene tự ẩn)
    bignum_value: bignumValue,
    bignum_unit: bignumUnit,
    bignum_label: bignumLabel,
    // S3 progress bars (≥2 mục cùng đơn vị)
    data_bars: JSON.stringify(finalBars),
    bars_title: finalBars.length >= 2 ? "Những con số" : "",
    // S4 pills 2×2 (CHỈ pills ngắn chuyên dụng) + levels (backward-compat, để rỗng)
    pills: JSON.stringify(pills),
    pills_title: pills.length ? "Điểm chính" : "",
    levels_title: "",
    levels: JSON.stringify(levels),
    // Point scenes: mỗi keyMessage 1 cảnh riêng → nhiều cảnh hơn, nhịp nhanh hơn
    points: JSON.stringify(pointScenes),
    // S_cmp compare 2 cột / S_emph principle + callout (định tính, rỗng → ẩn)
    compare: cmp ? JSON.stringify(cmp) : "",
    principle: principle,
    callout: callout,
    // S7 CTA
    cta_top: ctaTop,
    cta_keyword: ctaKeyword,
    cta_sub: "",
    cta_hl: ctaHl,
    // Ảnh cutout: rỗng ở 2A (S1 tự bỏ ảnh) — VPS sẽ điền ở 2B.
    img_hero: "",
    accent_color: accentColor || "#e11d2a",
    theme: String(themeFromSeed((s.hook || s.cta || "x").trim())),
  };

  return { variables, sceneSpecs };
}

export async function buildAnimation(input: {
  scriptId: string;
  audioId?: string;
}): Promise<VideoDraftRecord> {
  const script = await scriptStore.get(input.scriptId);
  if (!script) throw new Error("Script not found");

  const audios = await audioStore.byScript(input.scriptId);
  // GIỌNG C3 = "full" (read script = hook+body+cta) → KHỚP C1/C2 khi ghép/đồng bộ.
  // (Trước đây dùng part "animation" = text riêng → lệch C1. Giờ bỏ, dùng chung read script.)
  const audio = input.audioId
    ? await audioStore.get(input.audioId)
    : audios.find((a) => a.part === "full") || audios.find((a) => a.part === "animation");

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
      // 2B-fix: sinh ảnh cutout NGAY TRÊN VERCEL (VPS bị OpenAI chặn IP) → URL Supabase.
      // Subject GENERIC từ keyMessage/hook; lỗi → "" (scene tự ẩn ảnh).
      const anim = script.script.variantPrompts.animation;
      const heroSubject = (anim.heroSubject || anim.keyMessages?.[0] || script.script.hook || "modern finance concept")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      const { variables: animVars, sceneSpecs } = buildAnimationVariables(script.script);

      // Whisper word-level (Vercel gọi được OpenAI) → căn scene_times theo giọng đọc.
      // Chạy SONG SONG với sinh ảnh hero để tránh vượt Vercel 60s. Lỗi/thiếu key → words=null
      // → alignByWeights tự fallback chia theo tỉ lệ trọng số (vẫn tốt hơn chia đều cứng).
      const openaiKey = await getOpenAIKey();
      const [imgHeroUrl, words] = await Promise.all([
        generateHeroImageUrl(input.scriptId, `${heroSubject}, conceptual subject for a Vietnamese finance/tech short video`),
        voiceUrl && openaiKey ? transcribeWords(voiceUrl, openaiKey) : Promise.resolve(null),
      ]);
      const times = alignByWeights(sceneSpecs.map((sp) => sp.weight), words, durationSec);
      const sceneTimes: Record<string, { start: number; dur: number }> = {};
      sceneSpecs.forEach((sp, i) => { sceneTimes[sp.id] = times[i]; });

      const variables = {
        ...animVars,
        voice_url: voiceUrl,
        duration: String(durationSec),
        img_hero: imgHeroUrl, // URL công khai → VPS render fetch (KHÔNG nhờ VPS sinh ảnh)
        visionQC: true, // VPS chỉ chấm QC (bỏ imagePrompts — không sinh ảnh trên VPS nữa)
        scene_times: JSON.stringify(sceneTimes), // đồng bộ cảnh với giọng đọc
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
