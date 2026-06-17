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

// Filler điện ảnh trong prompt đạo diễn → BỎ để query Pexels gọn, đúng CHỦ THỂ (không dính phong cách).
const STOP: ReadonlySet<string> = new Set([
  "a", "an", "the", "of", "in", "on", "with", "and", "or", "to", "for", "at", "by", "as", "is", "are",
  "cinematic", "cinematographic", "photorealistic", "realistic", "photo", "photograph", "vertical",
  "composition", "dramatic", "directional", "lighting", "light", "shallow", "depth", "field", "bokeh",
  "moody", "cool", "warm", "toned", "tone", "color", "colour", "grade", "graded", "shot", "establishing",
  "broll", "professional", "high", "fidelity", "render", "rendered", "closeup", "macro", "slow", "motion",
  "modern", "scene", "background", "abstract", "detailed", "detail", "texture", "sharp", "focus", "studio",
  "no", "readable", "text", "captions", "caption", "watermark", "logo", "ui", "labels", "label", "interface",
]);

/**
 * Prompt đạo diễn (tiếng Anh) → query Pexels NGẮN: bỏ filler điện ảnh, giữ ~5 từ chủ thể. PURE.
 * Rỗng sau lọc → rơi về 3 từ đầu của prompt gốc (vẫn có gì đó để tìm).
 */
export function toPexelsQuery(text: string): string {
  const norm = String(text || "").toLowerCase().replace(/9:16/g, " ").replace(/[^a-z0-9\s]/g, " ");
  const words = norm.split(/\s+/).filter((w) => w && !STOP.has(w) && w.length > 1);
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
    const data = (await res.json()) as { videos?: Array<{ duration?: unknown; video_files?: unknown }> };
    const videos = Array.isArray(data?.videos) ? data.videos : [];
    for (const v of videos) {
      const file = pickPortraitFile(v?.video_files as Parameters<typeof pickPortraitFile>[0]);
      if (file) {
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
    }
    clipCache.set(cacheKey, null); // miss có chủ đích → cache để khỏi gọi lại trong process
    return null;
  } catch {
    return null; // lỗi mạng/parse → fallback AI (KHÔNG cache: lần sau có thể thử lại)
  }
}
