// ── Pexels stock-footage cho C2 HYBRID — clip VIDEO THẬT (cảnh concept) bù ảnh AI ──
// ADDITIVE: chỉ dùng khi cờ C2_HYBRID=1 (gọi từ c2-broll). KHÔNG import singleton (hub) →
// PURE, unit-test offline (fetch + key TIÊM). Lỗi / không key / miss → null (caller fallback ảnh AI).
//
// API (docs verified 2026-06-17 — pexels.com/api/documentation):
//   GET https://api.pexels.com/v1/videos/search?query=&orientation=portrait&per_page=
//   header  Authorization: <KEY>   (key TRỰC TIẾP, KHÔNG 'Bearer')
//   response { videos: [{ duration:int(giây), video_files:[{ quality:'hd'|'sd', file_type:"video/mp4",
//                          width, height, fps, link }] }] }
//   (path /v1/videos/ là path MỚI; /videos/ cũ sắp deprecated → dùng /v1/.)

export type PexelsClip = { url: string; durationSec: number; width: number; height: number };

/** Cờ bật b-roll HYBRID (Pexels video cho cảnh 'concept'). Mặc định TẮT → C2 hiện tại y nguyên. */
export function isC2Hybrid(): boolean {
  return process.env.C2_HYBRID === "1";
}

// Filler trong prompt đạo diễn → BỎ để query Pexels gọn, đúng CHỦ THỂ (không dính phong cách/máy quay).
// Mục tiêu: query còn lại ưu tiên DANH TỪ chủ thể + người + HÀNH ĐỘNG (tốt cho stock mọi chủ đề).
const STOP: ReadonlySet<string> = new Set([
  // mạo từ / giới từ / liên từ
  "a", "an", "the", "of", "in", "on", "with", "and", "or", "to", "for", "at", "by", "as", "is", "are",
  "into", "onto", "from", "through", "across", "around", "behind", "between", "over", "under", "near",
  "this", "that", "these", "those", "their", "his", "her", "its", "while", "during", "then", "than",
  // phong cách / hậu kỳ điện ảnh
  "cinematic", "cinematographic", "photorealistic", "realistic", "photo", "photograph", "vertical",
  "composition", "dramatic", "directional", "lighting", "light", "shallow", "depth", "field", "bokeh",
  "moody", "cool", "warm", "toned", "tone", "color", "colour", "grade", "graded", "shot", "establishing",
  "broll", "professional", "high", "fidelity", "render", "rendered", "closeup", "macro", "slow", "motion",
  "modern", "scene", "background", "abstract", "detailed", "detail", "texture", "sharp", "focus", "studio",
  // chỉ dẫn MÁY QUAY / GÓC (không phải chủ thể)
  "wide", "medium", "extreme", "close", "up", "angle", "view", "shots", "low", "top", "down",
  "shoulder", "dynamic", "pov", "frame", "framing", "perspective", "aerial", "drone", "handheld",
  // động từ "hiển thị"/nối + tính từ chung yếu cho stock
  "showing", "shows", "show", "depicting", "symbolising", "symbolizing", "representing", "featuring",
  "young", "old", "busy", "single", "various", "relevant", "symbolic", "beautiful", "stunning", "clean",
  // từ chống-chữ (không phải chủ thể)
  "no", "readable", "text", "captions", "caption", "watermark", "logo", "ui", "labels", "label", "interface",
]);

/**
 * Prompt TẢ CẢNH (tiếng Anh) → query Pexels NGẮN cho MỌI chủ đề: bỏ filler phong cách/máy quay,
 * DEDUPE (giữ thứ tự), giữ ~5 từ chủ thể + người + hành động. PURE.
 * Rỗng sau lọc (prompt toàn filler) → rơi về 3 từ đầu của prompt gốc (vẫn có gì đó để tìm).
 */
export function toPexelsQuery(text: string): string {
  const norm = String(text || "").toLowerCase().replace(/9:16/g, " ").replace(/[^a-z0-9\s]/g, " ");
  const seen = new Set<string>();
  const words = norm
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && w.length > 1)
    .filter((w) => (seen.has(w) ? false : (seen.add(w), true))); // dedupe — khỏi phí slot cho từ lặp
  const picked = words.slice(0, 5).join(" ").trim();
  if (picked) return picked;
  return norm.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
}

/**
 * Chọn file DỌC tốt nhất từ video_files của 1 video Pexels (PURE → test được).
 * Ưu tiên mp4 dọc (h>w), gần 1080×1920, KHÔNG quá to (phạt nặng >1440 rộng → 4K dọc nặng giải-mã
 * trên VPS 2-vCPU). null nếu không có file dọc hợp lệ.
 */
export function pickPortraitFile(
  files: Array<{ link?: unknown; file_type?: unknown; width?: unknown; height?: unknown }> | undefined
): { link: string; width: number; height: number } | null {
  if (!Array.isArray(files)) return null;
  const cands = files
    .map((f) => ({
      link: typeof f?.link === "string" ? f.link : "",
      ft: String(f?.file_type || ""),
      w: Number(f?.width) || 0,
      h: Number(f?.height) || 0,
    }))
    .filter((f) => f.link && f.ft.includes("mp4") && f.h > f.w && f.w > 0); // dọc + mp4 hợp lệ
  if (!cands.length) return null;
  const score = (f: { w: number; h: number }) =>
    Math.abs(f.h - 1920) + Math.abs(f.w - 1080) + (f.w > 1440 ? (f.w - 1440) * 4 : 0);
  cands.sort((a, b) => score(a) - score(b));
  const best = cands[0];
  return { link: best.link, width: best.w, height: best.h };
}

// ── GATE RELEVANCE (C) — chống clip Pexels LẠC query (vd query 'person managing money' → trả
//    'aerial city view' / 'luxury yacht' / 'ocean waves' không người). Pexels xếp theo relevance
//    nhưng top-1 đôi khi là cảnh phong-cảnh/đời-sống chỉ khớp 1 từ phụ. Ta đọc SLUG trong page-url
//    (mô tả nội dung clip) → bỏ clip có từ PHONG-CẢNH/ĐỜI-SỐNG mà query KHÔNG hề nhắc tới + không
//    chia sẻ từ chủ thể nào. Hết clip hợp lệ → null → caller fallback ẢNH AI (đúng hơn 1 clip lạc).
const SCENERY: ReadonlySet<string> = new Set([
  "aerial", "drone", "flycam", "yacht", "yachts", "marina", "boat", "boats", "sailboat", "ship", "cruise",
  "beach", "beaches", "ocean", "sea", "seaside", "seashore", "wave", "waves", "surf", "surfing",
  "sunset", "sunrise", "mountain", "mountains", "forest", "jungle", "desert", "waterfall", "lake", "cliff",
  "sky", "clouds", "cloud", "landscape", "scenery", "scenic", "nature", "horizon", "island", "tropical",
  "vacation", "holiday", "resort", "meditation", "meditating", "meditate", "zen", "yoga", "spa", "sunbathing",
]);
function clipWords(s: string): string[] {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
}
/** Lấy slug mô tả clip từ page-url Pexels (vd .../video/luxury-yachts-at-marina-12345/ → "luxury yachts at marina"). */
function pexelsSlug(url: unknown): string {
  const m = String(url || "").match(/pexels\.com\/video\/(.+?)-\d+\/?$/i);
  return m ? m[1].replace(/-/g, " ") : "";
}
/** Clip LẠC khi: slug có từ phong-cảnh/đời-sống mà query KHÔNG nhắc, VÀ slug không chia sẻ từ chủ thể nào với query. */
export function isOffTopicClip(slug: string, queryWords: ReadonlySet<string>): boolean {
  const sw = clipWords(slug);
  if (!sw.length) return false; // không có slug (API thiếu url / test) → đừng loại
  const hasStrayScenery = sw.some((w) => SCENERY.has(w) && !queryWords.has(w));
  if (!hasStrayScenery) return false;
  const sharesSubject = sw.some((w) => queryWords.has(w) && !SCENERY.has(w));
  return !sharesSubject; // có cảnh lạc VÀ không trùng chủ thể nào → loại
}

const clipCache = new Map<string, PexelsClip | null>(); // keyword+orientation → clip (trong process)
let warnedNoKey = false;

/**
 * Tìm 1 clip stock DỌC trên Pexels theo keyword. Best-effort, KHÔNG throw → null khi
 * không key / miss / lỗi (caller fallback ảnh AI). Cache theo keyword+orientation trong process.
 * Key: opts.apiKey (vd lấy từ Hub) → else env PEXELS_API_KEY. `fetchImpl` tiêm để unit-test offline.
 */
export async function searchPexelsClip(
  keyword: string,
  opts: {
    orientation?: "portrait" | "landscape" | "square";
    apiKey?: string;
    fetchImpl?: typeof fetch;
    perPage?: number;
  } = {}
): Promise<PexelsClip | null> {
  const q = (keyword || "").trim();
  if (!q) return null;
  const orientation = opts.orientation || "portrait";
  const cacheKey = `${orientation}:${q.toLowerCase()}`;
  if (clipCache.has(cacheKey)) return clipCache.get(cacheKey)!;

  const key = opts.apiKey || process.env.PEXELS_API_KEY || process.env.PEXELS_KEY;
  if (!key) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.info("[c2-hybrid] PEXELS_API_KEY trống → bỏ Pexels, dùng ảnh AI (fallback).");
    }
    return null;
  }
  const fetchImpl = opts.fetchImpl || fetch;
  const perPage = Math.max(1, Math.min(20, opts.perPage || 8));
  try {
    const url =
      `https://api.pexels.com/v1/videos/search?query=${encodeURIComponent(q)}` +
      `&orientation=${orientation}&per_page=${perPage}`;
    const res = await fetchImpl(url, { headers: { Authorization: key } });
    if (!res.ok) {
      clipCache.set(cacheKey, null);
      return null;
    }
    const data = (await res.json()) as { videos?: Array<{ duration?: unknown; video_files?: unknown; url?: unknown }> };
    const videos = Array.isArray(data?.videos) ? data.videos : [];
    const queryWords = new Set(clipWords(q));
    for (const v of videos) {
      const file = pickPortraitFile(v?.video_files as Parameters<typeof pickPortraitFile>[0]);
      if (!file) continue;
      // GATE (C): bỏ clip phong-cảnh/đời-sống LẠC query (giữ thứ tự relevance của Pexels cho clip hợp lệ).
      if (isOffTopicClip(pexelsSlug(v?.url), queryWords)) continue;
      const dur = Number(v?.duration);
      const clip: PexelsClip = {
        url: file.link,
        durationSec: Number.isFinite(dur) && dur > 0 ? dur : 0,
        width: file.width,
        height: file.height,
      };
      clipCache.set(cacheKey, clip);
      return clip;
    }
    clipCache.set(cacheKey, null); // không clip nào KHỚP (hoặc toàn cảnh lạc) → cache + fallback ảnh AI
    return null;
  } catch {
    return null; // lỗi mạng/parse → fallback AI (KHÔNG cache: lần sau có thể thử lại)
  }
}
