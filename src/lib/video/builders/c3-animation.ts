import crypto from "node:crypto";
import { hub } from "@/lib/integration-hub/hub";
import { audioStore } from "@/lib/audio/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { store } from "@/lib/integration-hub/storage";
import { blobUpload } from "@/lib/backend/blob-store";
import { getOpenAIKey, transcribeWords, alignByWeights, type Word } from "@/lib/audio/whisper";
import type { ScriptResult } from "@/lib/agents/scripter";
import { getOrCreateBrandKit } from "@/lib/design/director";
import { mixVoiceWithMusic } from "@/lib/audio/mix-service";
import { videoStore, type VideoDraftRecord } from "../storage";
import { getEngine } from "../engine";
import { allowSelfHostRender, isLive, assertDailyCap, recordPaidUsage, recordExtraUsage } from "../cost-guard";
import { pickRenderProvider, toAbsoluteUrl, generatePlaceholderMp4 } from "./_shared";
import { RENDER_PIPELINE_VERSION } from "../render-version";

/**
 * Sinh 1 ảnh cutout nền TRONG SUỐT trên Vercel (OpenAI reach được; VPS bị Cloudflare
 * chặn IP datacenter) → upload Supabase → trả PUBLIC URL cho VPS render fetch.
 * Lỗi bất kỳ → trả "" (scene tự ẩn ảnh — fallback 2A, KHÔNG fail render).
 * ⚠ C3 v2: HIỆN KHÔNG GỌI (đã bỏ nhân vật 3D). GIỮ LẠI có chủ đích = reserved cho
 * AI-gen icon/logo/ảnh minh hoạ nhỏ tương lai (theo ý Tommy). KHÔNG phải dead code lỡ tay.
 */
async function generateHeroImageUrl(scriptId: string, subject: string): Promise<string> {
  try {
    // Cost-guard (P0.3 review đợt 2): ảnh AI là PAID — dù hàm đang reserved
    // (không nơi nào gọi), gate sẵn để tương lai gọi lại không rò tiền.
    if (!isLive()) return "";
    const img = await hub.image();
    if (!img) return "";
    await assertDailyCap(Number(process.env.IMAGE_COST_PER_IMAGE_USD) || 0.05, "ảnh hero C3");
    // Light Bento v3: NHÂN VẬT 3D cartoon (Pixar/Blender), hợp nền sáng pastel.
    const prompt =
      `3D cartoon character, Pixar/Blender style, friendly young person mascot, ${subject}, ` +
      `expressive pose (thumbs up or pointing), clean soft studio lighting, pastel rim light, ` +
      `isolated on transparent background, no text, no watermark, not a real identifiable person, ` +
      `centered, high detail, playful tech vibe`;
    // quality "medium" vừa Vercel 60s (1 ảnh); adapter tự fallback nếu provider không phải gpt-image.
    const r = await img.generate({ prompt, transparent: true, quality: "medium" });
    // Quyết toán trần ngày (review T2: assert mà không record = tiền tiêu thật
    // không bao giờ vào spendToday → hero vĩnh viễn không đếm vào trần).
    await recordPaidUsage("image", r.costUsd || Number(process.env.IMAGE_COST_PER_IMAGE_USD) || 0.05, 1);
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

/** Chọn THEME theo CHỦ ĐỀ (industry của profile) — chốt với Tommy:
 *  tài chính/ngân hàng → DARK PRO (nghiêm túc, chỉn chu, idx 3);
 *  công nghệ/đời sống/khác → BRIGHT tươi (idx 0-2, vary theo nội dung).
 *  Composition clamp idx về [0, THEMES-1] nên an toàn nếu VPS chưa cập nhật dark. */
export function themeForTopic(industry: string, seed: string): number {
  const ind = (industry || "").toLowerCase();
  const isFinance = /bank|financ|tài chính|ngân hàng|fintech|chứng khoán|securit|invest|đầu tư|bảo hiểm|insur|tín dụng|\bvay\b|\bloan/.test(ind);
  if (isFinance) return 3; // Dark Pro
  return themeFromSeed(seed); // 0-2 Bright
}

/** Gom thành phụ đề SYNC karaoke cho C3: JSON [{s,e,w:[{t,x}]}]. Ngắt câu theo dấu kết câu /
 *  ~7 từ / ~42 ký tự / khoảng lặng >0.55s. e câu = s câu sau (liền mạch).
 *  - CÓ Whisper words → timing THẬT (sync chuẩn nhất).
 *  - words=null (whisper lỗi/thiếu key — hay xảy ra & SILENT) → FALLBACK: chia đều `fallbackText`
 *    (read-script) theo thời lượng → VẪN có caption (kém sync hơn) thay vì rỗng. */
function buildCaptions(words: Word[] | null, total: number, fallbackText?: string): string {
  type WT = { t: number; x: string; gap: number };
  let wlist: WT[] = [];
  if (words && words.length > 0) {
    const ws = words.map((w) => ({ x: (w.text || "").trim(), start: w.start, end: w.end })).filter((w) => w.x);
    wlist = ws.map((w, i) => ({ t: +w.start.toFixed(2), x: w.x, gap: i + 1 < ws.length ? ws[i + 1].start - w.end : 99 }));
  } else {
    const toks = (fallbackText || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (toks.length === 0) return "";
    const t0 = 0.3, t1 = Math.max(t0 + 1, total - 0.8);
    wlist = toks.map((x, i) => ({ t: +(t0 + (t1 - t0) * (i / Math.max(1, toks.length - 1))).toFixed(2), x, gap: 0 }));
  }
  if (wlist.length === 0) return "";
  type Ph = { s: number; e: number; w: { t: number; x: string }[] };
  const phrases: Ph[] = [];
  let cur: { t: number; x: string }[] = [];
  let chars = 0;
  const flush = () => { if (cur.length) { phrases.push({ s: cur[0].t, e: 0, w: cur }); cur = []; chars = 0; } };
  for (const wd of wlist) {
    cur.push({ t: wd.t, x: wd.x });
    chars += wd.x.length + 1;
    if (cur.length >= 7 || chars >= 42 || /[.!?…]$/.test(wd.x) || wd.gap > 0.55) flush();
  }
  flush();
  for (let i = 0; i < phrases.length; i++) phrases[i].e = i + 1 < phrases.length ? phrases[i + 1].s : Math.max(total, phrases[i].s + 1);
  return JSON.stringify(phrases);
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
  durationSec: number,
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

  // MỖI point = 1 CẢNH thẻ HƯỚNG DẪN giàu data (tiêu đề bước + cách làm + số liệu hỗ trợ) → tăng số cảnh + DẠY
  // kiến thức. Ưu tiên anim.points (bản giàu); thiếu → fallback keyMessages (chỉ title) cho backward-compat.
  const richPoints = Array.isArray(anim.points) ? anim.points : [];
  const rawPoints: { title: string; detail?: string; stat?: { value: string; unit: string; label: string } }[] =
    richPoints.length ? richPoints : (anim.keyMessages || []).map((m) => ({ title: m }));
  const pointScenes = rawPoints
    .map((p) => {
      const title = String((p && p.title) || "").trim();
      if (!title) return null;
      const detail = String((p && p.detail) || "").trim();
      const sv = p && p.stat ? String(p.stat.value || "").trim() : "";
      const stat = sv
        ? { value: sv.slice(0, 7), unit: oneToken(String(p.stat!.unit || "")).slice(0, 6), label: String(p.stat!.label || "").trim().slice(0, 34) }
        : undefined;
      return { title: title.slice(0, 64), detail: detail.slice(0, 150), stat };
    })
    .filter((p): p is { title: string; detail: string; stat: { value: string; unit: string; label: string } | undefined } => p !== null)
    .slice(0, 4)
    // text = title: tương thích NGƯỢC composition CŨ trên VPS (đọc p.text) → KHÔNG vỡ point scene khi
    // builder mới deploy trước lúc Tommy scp composition mới (composition mới đọc p.title||p.text).
    .map((p, i, arr) => ({ n: i + 1, total: arr.length, text: p.title, title: p.title, detail: p.detail, stat: p.stat }));
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

  // ── v5 data-viz ĐA DẠNG (NON-READ, minh hoạ — "số chạy") ──
  const donut = anim.donut && /\d/.test(String(anim.donut.value || "")) ? anim.donut : null;
  const beforeAfter =
    anim.beforeAfter && String(anim.beforeAfter.fromValue || "").trim() && String(anim.beforeAfter.toValue || "").trim()
      ? anim.beforeAfter
      : null;
  const miniStats = Array.isArray(anim.miniStats)
    ? anim.miniStats
        .map((m) => ({ value: String(m.value || ""), unit: String(m.unit || ""), label: String(m.label || "") }))
        .filter((m) => m.value && m.label)
        .slice(0, 4)
    : [];
  const trendPts = anim.trend && Array.isArray(anim.trend.points)
    ? anim.trend.points.map((p) => String(p)).filter((p) => /\d/.test(p)).slice(0, 6)
    : [];
  const trend = trendPts.length >= 2 ? { label: String(anim.trend!.label || "Xu hướng"), points: trendPts } : null;
  const flowSteps = anim.flow && Array.isArray(anim.flow.steps)
    ? anim.flow.steps.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 4) : [];
  const flow = flowSteps.length >= 2 ? { title: String(anim.flow!.title || "Quy trình"), steps: flowSteps } : null;

  // ── Danh sách CẢNH + NGÂN SÁCH cảnh (chống quá nhiều → nhanh) + trọng số CĂN THEO GIỌNG ĐỌC.
  //    Luôn giữ hero + points + cta; cảnh DATA chọn theo ƯU TIÊN tới khi đủ budget (~durationSec/4.5).
  const wc = (t: string) => Math.max(1, String(t || "").trim().split(/\s+/).filter(Boolean).length);
  const hookW = wc(s.hook), bodyW = wc(s.body), ctaW = wc(s.cta);
  const dataPriority: { id: string; ok: boolean }[] = [
    { id: "s2", ok: !!bignumValue },
    { id: "s4b", ok: finalBars.length >= 2 },
    { id: "s_ba", ok: !!beforeAfter },
    { id: "s_donut", ok: !!donut },
    { id: "s_flow", ok: !!flow },
    { id: "s_mini", ok: miniStats.length >= 2 },
    { id: "s_cmp", ok: !!cmp },
    { id: "s_trend", ok: !!trend },
    { id: "s_emph", ok: !!(callout || principle) },
    { id: "s6", ok: pills.length > 0 },
  ];
  const numPoints = pointScenes.length;
  const budget = Math.max(5, Math.floor((durationSec || 40) / 4.5));
  const dataBudget = Math.max(0, budget - 2 - numPoints); // trừ hero + cta + points
  const keep = new Set<string>();
  let usedBudget = 0;
  for (const d of dataPriority) if (d.ok && usedBudget < dataBudget) { keep.add(d.id); usedBudget++; }
  const kept = (id: string) => keep.has(id);

  // ids THEO ĐÚNG THỨ TỰ composition: s1, [data trước], points, [data sau], s7
  const ids: string[] = ["s1"];
  for (const id of ["s2", "s_donut", "s_flow", "s_ba", "s4b", "s_mini", "s_trend"]) if (kept(id)) ids.push(id);
  pointScenes.forEach((_p, i) => ids.push("spt" + i));
  for (const id of ["s6", "s_emph", "s_cmp"]) if (kept(id)) ids.push(id);
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
    // S2 big number — chỉ khi trong budget (gate theo `keep`)
    bignum_value: kept("s2") ? bignumValue : "",
    bignum_unit: kept("s2") ? bignumUnit : "",
    bignum_label: kept("s2") ? bignumLabel : "",
    // S3 progress bars
    data_bars: kept("s4b") ? JSON.stringify(finalBars) : "[]",
    bars_title: kept("s4b") ? "Những con số" : "",
    // S4 pills 2×2
    pills: kept("s6") ? JSON.stringify(pills) : "[]",
    pills_title: kept("s6") ? "Điểm chính" : "",
    levels_title: "",
    levels: JSON.stringify(levels),
    // Point scenes: mỗi keyMessage 1 cảnh riêng
    points: JSON.stringify(pointScenes),
    // S_cmp compare / S_emph principle + callout
    compare: kept("s_cmp") && cmp ? JSON.stringify(cmp) : "",
    principle: kept("s_emph") ? principle : "",
    callout: kept("s_emph") ? callout : "",
    // v5 data-viz đa dạng (gate theo budget)
    donut: kept("s_donut") && donut ? JSON.stringify(donut) : "",
    before_after: kept("s_ba") && beforeAfter ? JSON.stringify(beforeAfter) : "",
    mini_stats: kept("s_mini") ? JSON.stringify(miniStats) : "[]",
    mini_title: "Chỉ số",
    trend: kept("s_trend") && trend ? JSON.stringify(trend) : "",
    flow: kept("s_flow") && flow ? JSON.stringify(flow) : "",
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

/** Cache key C3 (Phase 3): input ổn định đổi là hash đổi → render lại đúng;
 *  trùng → trả video cũ (tiết kiệm 10-20 phút render VPS + không tạo draft mới).
 *  Gồm musicId (thêm/xoá nhạc = video mới). LOẠI storyboard khỏi content: studio
 *  sửa storyboard hiện CHƯA chảy vào video chính (chỉ preview cảnh lẻ) — để trong
 *  hash chỉ tổ phá cache vô ích (re-render ra video y hệt). */
function hashAnimationRender(scriptId: string, audioId: string | undefined, musicId: string | undefined, content: ScriptResult, tokens: string, theme: string): string {
  const stable = { ...content, storyboard: undefined };
  return crypto
    .createHash("sha256")
    .update(`${RENDER_PIPELINE_VERSION}::${scriptId}::${audioId || ""}::${musicId || ""}::${JSON.stringify(stable)}::${tokens}::${theme}`)
    .digest("hex");
}

export async function buildAnimation(input: {
  scriptId: string;
  audioId?: string;
  /** true (nút Re-render) → bỏ qua cache renderHash */
  force?: boolean;
}): Promise<VideoDraftRecord> {
  const script = await scriptStore.get(input.scriptId);
  if (!script) throw new Error("Script not found");
  const profile = await store.getProfile(script.profileId); // → chọn theme dark/bright theo industry

  const audios = await audioStore.byScript(input.scriptId);
  // GIỌNG C3 = "full" (read script = hook+body+cta) → KHỚP C1/C2 khi ghép/đồng bộ.
  // (Trước đây dùng part "animation" = text riêng → lệch C1. Giờ bỏ, dùng chung read script.)
  const audio = input.audioId
    ? await audioStore.get(input.audioId)
    : audios.find((a) => a.part === "full") || audios.find((a) => a.part === "animation");

  const provider = await pickRenderProvider();
  // RENDER_MODE=mock → không gọi cả VPS (test pipeline thuần placeholder).
  const mode = !allowSelfHostRender()
    ? "mock"
    : provider?.name === "creatomate" ? "creatomate" : provider?.name === "hyperframes" ? "hyperframes" : "mock";

  // BrandKit (Tầng 2 → Tầng 3): token chảy vào composition qua biến `tokens`.
  // Composition MỚI ưu tiên tokens; composition CŨ trên VPS chưa khai báo biến
  // này → tự bỏ qua, rơi về `theme` fallback bên dưới → KHÔNG gãy khi chưa scp.
  const kit = mode === "hyperframes" ? await getOrCreateBrandKit(script.profileId) : null;
  const tokensJson = kit ? JSON.stringify(kit.tokens) : "";
  const themeFallback = String(
    themeForTopic(profile?.industry || "", (script.script.hook || script.script.cta || "x").trim())
  );

  // Nhạc nền (Phase 5): tìm TRƯỚC hash — có/không nhạc là 2 video khác nhau.
  const music = audios.find((a) => a.part === "music");

  // ── Cost-guard cache (Phase 3): cùng script content + audio + nhạc + BrandKit →
  //    trả video cũ, KHÔNG re-render VPS (tiết kiệm 10-20 phút). force → bỏ cache. ──
  const renderHash = hashAnimationRender(input.scriptId, audio?.id, music?.id, script.script, tokensJson, themeFallback);
  if (mode === "hyperframes" && !input.force) {
    const cached = (await videoStore.byScript(input.scriptId)).find(
      (v) => v.concept === "animation" && v.status === "done" && v.renderHash === renderHash && !!v.outputStoragePath
    );
    if (cached) return cached;
  }

  const draft = await videoStore.create({
    scriptId: input.scriptId,
    audioId: audio?.id,
    concept: "animation",
    mode,
    providerName: mode,
    renderHash: mode === "hyperframes" ? renderHash : undefined,
    status: "queued",
    progress: 0,
  });

  // HyperFrames: render composition "animation" với biến map từ script (async → poll).
  if (mode === "hyperframes") {
    try {
      const renderer = await getEngine("render");
      // Voice-over: URL công khai (Supabase) — service ở VPS tải audio qua mạng.
      let voiceUrl = toAbsoluteUrl(audio?.storagePath) || "";
      // Whisper transcribe trên VOICE GỐC (trước khi mix nhạc) — timing chuẩn hơn.
      const voiceUrlRaw = voiceUrl;
      // Nhạc nền MiniMax (Phase 5, tuỳ chọn): script có track "music" → mix duck
      // -18dB dưới giọng (cache theo voiceId+musicId → URL ổn định, renderHash sống).
      if (voiceUrl && audio && music) {
        const musicUrl = toAbsoluteUrl(music.storagePath);
        if (musicUrl) {
          const mixed = await mixVoiceWithMusic({ id: audio.id, url: voiceUrl }, { id: music.id, url: musicUrl });
          if (mixed) voiceUrl = mixed;
        }
      }
      // Độ dài: ưu tiên độ dài audio thật để animation co giãn khớp giọng đọc.
      const durationSec =
        audio?.durationMs && audio.durationMs > 0
          ? Math.round(audio.durationMs / 1000)
          : script.script.estimatedDurationSec || 18.5;
      const { variables: animVars, sceneSpecs } = buildAnimationVariables(script.script, durationSec);

      // Whisper word-level (Vercel gọi được OpenAI) → căn scene_times theo giọng đọc.
      // Lỗi/thiếu key → words=null → alignByWeights tự fallback chia theo tỉ lệ trọng số.
      // C3 v2: BỎ sinh ảnh nhân vật 3D (Tommy chốt) → tiết kiệm gpt-image + nhanh hơn; img_hero="" → scene tự ẩn.
      // Whisper = call OpenAI TRẢ PHÍ (nhỏ ~$0.006/phút) → gate isLive + trần ngày (P0.3 + L1).
      // dryrun: words=null → caption/scene_times fallback chia đều (pipeline vẫn chạy).
      const openaiKey = await getOpenAIKey();
      const whisperEst = ((durationSec || 60) / 60) * (Number(process.env.WHISPER_COST_PER_MIN_USD) || 0.006);
      const useWhisper = isLive() && !!voiceUrlRaw && !!openaiKey;
      if (useWhisper) await assertDailyCap(whisperEst, "Whisper C3");
      const words = useWhisper ? await transcribeWords(voiceUrlRaw, openaiKey!) : null;
      if (words) await recordExtraUsage("openai-whisper", whisperEst);
      const imgHeroUrl = "";
      const times = alignByWeights(sceneSpecs.map((sp) => sp.weight), words, durationSec);
      const sceneTimes: Record<string, { start: number; dur: number }> = {};
      sceneSpecs.forEach((sp, i) => { sceneTimes[sp.id] = times[i]; });

      const variables = {
        ...animVars,
        voice_url: voiceUrl,
        duration: String(durationSec),
        img_hero: imgHeroUrl, // URL công khai → VPS render fetch (KHÔNG nhờ VPS sinh ảnh)
        scene_times: JSON.stringify(sceneTimes), // đồng bộ cảnh với giọng đọc
        topic: (script.topic || script.script.hook || "").slice(0, 40), // header trên đóng khung đỉnh
        // BrandKit tokens (Phase 2) — đổi kit là đổi look, không sửa code composition.
        tokens: tokensJson,
        // Cổng QC thiết kế 5 chiều trên VPS (vision Gemini — call TRẢ PHÍ nhẹ):
        // mặc định CHỈ bật ở live (kỷ luật cost-guard); RENDER_QC=1 ép bật mọi mode,
        // RENDER_QC=0 tắt hẳn. Server gate thêm theo GEMINI_API_KEY; re-render <6, ≤2 vòng.
        visionQC: process.env.RENDER_QC === "1" || (process.env.RENDER_QC !== "0" && isLive()),
        // THEME fallback theo industry (composition cũ): tài chính → dark pro; còn lại → bright.
        theme: themeFallback,
        // Phụ đề SYNC read-script (karaoke). Whisper words → sync chuẩn; null → fallback chia đều read-script.
        captions: buildCaptions(words, durationSec, `${script.script.hook} ${script.script.body} ${script.script.cta}`),
      };
      const job = await renderer.render({ templateId: "animation", variables });
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
      // Creatomate là dịch vụ render TRẢ PHÍ theo credit (KHÔNG phải self-host $0)
      // → gate isLive + trần ngày như mọi call paid (review đợt vá T4).
      if (!isLive()) {
        return (await videoStore.update(draft.id, {
          status: "failed",
          error: "Creatomate là dịch vụ trả phí — cần RENDER_MODE=live (cost-guard).",
        }))!;
      }
      await assertDailyCap(Number(process.env.CREATOMATE_COST_PER_RENDER_USD) || 0.3, "render Creatomate C3");
      const renderer = await getEngine("render");
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
      const job = await renderer.render({ templateId, variables: modifications });
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
    const renderer = await getEngine("render");
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
