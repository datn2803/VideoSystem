// ── C2 "ACCURATE" — ảnh b-roll bám ĐÚNG kịch bản (BLUEPRINT_C2_V2_ACCURATE.md) ──
// ADDITIVE: chỉ chạy khi cờ C2_ACCURATE=1. Lỗi bất kỳ nhánh nào → caller fallback
// về planShotPrompts cũ (KHÔNG phá C2 cũ).
// THIẾT KẾ: module KHÔNG import singleton nặng (hub/usage) — `llm` được TIÊM vào
// planShotsAccurate → mọi hàm còn lại là PURE → unit-test offline không cần env/DB.

// 'real-scene' (C2 HYBRID): cảnh ĐỜI THỰC quay được bằng máy quay — người/hành động/bối cảnh/
// vật phổ thông cho MỌI chủ đề. Đây là LOẠI ƯU TIÊN cho Pexels (video THẬT) khi preferRealScene.
// AI fallback của nó dùng suffix NO-TEXT (như concept) vì là cảnh thực, không có UI/chữ.
export type ImageType = "brand" | "app-ui" | "product" | "concept" | "chart" | "real-scene";

export type ShotPlan = {
  imageType: ImageType;
  /** Tên brand/tool/sản phẩm trích từ lời (vd 'SePay', 'Make.com'). */
  entity?: string;
  /** Domain đoán cho brand (vd 'sepay.vn') → fetch logo thật. */
  domain?: string;
  /** Prompt ảnh tiếng Anh, CỤ THỂ, bám entity/số (KHÔNG 'glowing app interface' chung). */
  prompt: string;
};

/** LLM tiêm vào (structural) — TƯƠNG THÍCH hub.llm() (LLMProvider) nhưng KHÔNG import
 *  hub (test offline). Param khớp LLMProvider.complete; return để LỎNG (chỉ field cần đọc). */
export type DirectorLLM = {
  complete: (req: {
    model?: string;
    system?: string;
    messages: { role: "user" | "assistant"; content: string }[];
    maxTokens?: number;
    responseFormat?: "text" | "json";
  }) => Promise<{ text: string; costUsd?: number; tokensIn?: number; tokensOut?: number }>;
};

const IMAGE_TYPES: ReadonlySet<string> = new Set(["brand", "app-ui", "product", "concept", "chart", "real-scene"]);

/** Cờ bật C2 ACCURATE (mặc định TẮT → giữ C2 cũ). */
export function isC2Accurate(): boolean {
  return process.env.C2_ACCURATE === "1";
}

/** Quality cho ảnh ở chế độ accurate (mặc định 'medium'; cho phép 'high'/'low' qua env). */
export function c2AccurateQuality(): string {
  const q = (process.env.C2_IMAGE_QUALITY || "medium").toLowerCase();
  return q === "high" || q === "medium" || q === "low" ? q : "medium";
}

// Suffix tách theo nhánh (mục C blueprint):
//  - CONCEPT: CẤM chữ (như BROLL_STYLE_SUFFIX cũ) → b-roll điện ảnh sạch.
//  - TEXT: CHO PHÉP chữ/UI/label (app-ui/brand/chart/product) → GPT Image render chữ.
export const SUFFIX_NOTEXT =
  ". Professional cinematic photograph, vertical 9:16 composition, dramatic directional lighting, rich detail and texture, photorealistic, consistent moody cool-toned color grade, modern realistic Vietnamese setting, shallow depth of field, no readable text, no captions, no watermark, no logo, no UI labels.";
export const SUFFIX_TEXT =
  ". Realistic high-fidelity render, vertical 9:16 composition, crisp studio lighting, photorealistic, ACCURATE legible on-screen text and interface labels rendered correctly, clean modern UI, modern Vietnamese context, sharp focus, no watermark.";

/** Chọn suffix theo imageType (concept + real-scene = no-text cảnh thực; còn lại = cho phép chữ). */
export function suffixFor(imageType: ImageType): string {
  return imageType === "concept" || imageType === "real-scene" ? SUFFIX_NOTEXT : SUFFIX_TEXT;
}

// Brand phổ biến → domain chuẩn (ưu tiên trước heuristic). Mở rộng dễ, KHÔNG hard-code chủ đề.
export const KNOWN_DOMAINS: Record<string, string> = {
  sepay: "sepay.vn",
  "make.com": "make.com",
  make: "make.com",
  zalo: "zalo.me",
  google: "google.com",
  "google sheets": "sheets.google.com",
  "google drive": "drive.google.com",
  gmail: "gmail.com",
  facebook: "facebook.com",
  messenger: "messenger.com",
  tiktok: "tiktok.com",
  shopee: "shopee.vn",
  lazada: "lazada.vn",
  momo: "momo.vn",
  vnpay: "vnpay.vn",
  notion: "notion.so",
  canva: "canva.com",
  chatgpt: "openai.com",
  openai: "openai.com",
  youtube: "youtube.com",
  instagram: "instagram.com",
  shopify: "shopify.com",
  stripe: "stripe.com",
  zapier: "zapier.com",
  n8n: "n8n.io",
  slack: "slack.com",
  // Brand Việt / ngành hay gặp (đối chiếu domain thật; cái nào search/heuristic lo được thì khỏi cần ở đây).
  tiki: "tiki.vn",
  kiotviet: "kiotviet.vn",
  sapo: "sapo.vn",
  haravan: "haravan.com",
  misa: "misa.com.vn",
  viettel: "viettel.com.vn",
  zalopay: "zalopay.vn",
  grab: "grab.com",
  be: "be.com.vn",
  techcombank: "techcombank.com.vn",
  vpbank: "vpbank.com.vn",
  acb: "acb.com.vn",
  bidv: "bidv.com.vn",
  tpbank: "tpb.vn",
  tpb: "tpb.vn",
  sacombank: "sacombank.com.vn",
  vietcombank: "vietcombank.com.vn",
};

// ── FIX b-roll ĐÚNG NGỮ CẢNH: câu NHẮC TOOL/APP cụ thể → ép imageType='app-ui' (ảnh AI render GIAO
//    DIỆN tool), KHÔNG real-scene cảnh người chung. Danh sách CURATED (tránh từ chung 'make'/'be'/'google'
//    đứng 1 mình gây nhiễu). detectToolMention bơm HINT vào prompt director (nhánh hybrid). PURE. ──
const TOOL_KEYWORDS: readonly string[] = [
  "n8n", "make.com", "zapier", "notion", "airtable", "coda", "canva", "capcut",
  "chatgpt", "openai", "gemini", "claude", "midjourney", "shopify", "stripe", "slack", "discord", "telegram",
  "google sheets", "google sheet", "google forms", "google form", "google drive", "google ads", "google analytics", "gmail",
  "facebook ads", "facebook lead", "lead ads", "tiktok ads", "tiktok shop", "messenger",
  "sepay", "vnpay", "momo", "zalopay", "zalo oa", "kiotviet", "misa", "sapo", "haravan", "pancake", "ladipage",
  "dashboard", "chatbot", "webhook", "automation", "workflow", "landing page", "crm", "spreadsheet",
];
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Phát hiện câu/kịch bản NHẮC TỚI tool/app cụ thể (word-boundary, case-insensitive). Trả danh sách
 *  tool khớp (rỗng nếu không có). Dùng làm HINT cho director ưu tiên 'app-ui'. PURE → unit-test. */
export function detectToolMention(text: string): string[] {
  const t = String(text || "");
  if (!t.trim()) return [];
  const found = new Set<string>();
  for (const kw of TOOL_KEYWORDS) {
    if (new RegExp(`\\b${escRe(kw)}\\b`, "i").test(t)) found.add(kw);
  }
  return Array.from(found);
}

/** Suy domain từ tên brand: known-map → nếu đã là domain → giữ → else thử '.com'. */
export function guessDomain(entity: string | undefined): string | null {
  const e = (entity || "").trim().toLowerCase();
  if (!e) return null;
  if (KNOWN_DOMAINS[e]) return KNOWN_DOMAINS[e];
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return e; // đã là domain
  const slug = e.replace(/[^a-z0-9]/g, "");
  return slug ? `${slug}.com` : null; // 1 từ → thử .com (best-effort)
}

// ── resolveBrandDomain: phủ logo cho brand BẤT KỲ (không chỉ trong KNOWN_DOMAINS) ──
const domainCache = new Map<string, string>(); // entity(lowercased) → domain (trong process)
let warnedNoSecret = false;

/**
 * Resolve domain cho brand BẤT KỲ (mục: nâng ĐỘ PHỦ logo). Thứ tự, best-effort, KHÔNG throw:
 *  1) KNOWN_DOMAINS  2) entity đã là domain  3) Logo.dev Search (LOGODEV_SECRET sk_, lấy domain top)
 *  4) heuristic: '<slug>.vn' nếu domain tồn tại → else '<slug>.com'.
 * Cache entity→domain trong process. `fetchImpl` tiêm để unit-test offline. Lỗi/không key/không kết quả → bước kế.
 */
export async function resolveBrandDomain(
  entity: string | undefined,
  opts: { fetchImpl?: typeof fetch } = {}
): Promise<string | null> {
  const raw = (entity || "").trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  const cached = domainCache.get(key);
  if (cached) return cached;
  const fetchImpl = opts.fetchImpl || fetch;
  const set = (d: string) => { domainCache.set(key, d); return d; };

  // 1) danh bạ
  if (KNOWN_DOMAINS[key]) return set(KNOWN_DOMAINS[key]);
  // 2) đã là domain
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(key)) return set(key);
  // 3) Logo.dev Search (secret sk_) — docs+live verified: GET api.logo.dev/search?q=, header Authorization: Bearer sk_.
  // strategy=match (exact/near-exact) — KHỚP brand chính xác; default 'typeahead' ưu tiên prefix-phổ-biến nên
  // sai brand (vd 'coolmate' → 'Cool Material' thay vì Coolmate). Lấy domain top.
  const secret = process.env.LOGODEV_SECRET || process.env.LOGO_DEV_SECRET;
  if (secret) {
    try {
      const res = await fetchImpl(`https://api.logo.dev/search?q=${encodeURIComponent(raw)}&strategy=match`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (res.ok) {
        const arr = (await res.json()) as unknown;
        const top = Array.isArray(arr)
          ? (arr.find((x) => x && typeof x === "object" && typeof (x as { domain?: unknown }).domain === "string" && (x as { domain: string }).domain) as { domain: string } | undefined)
          : undefined;
        if (top?.domain) return set(top.domain.trim().toLowerCase());
      }
    } catch {
      /* rơi xuống heuristic */
    }
  } else if (!warnedNoSecret) {
    warnedNoSecret = true;
    console.info("[c2-accurate] LOGODEV_SECRET trống → bỏ qua Logo.dev Search, dùng KNOWN/heuristic.");
  }
  // 4) heuristic: mặc định '.com' (an toàn nhất cho brand lạ). Brand '.vn'/TLD đặc thù (.app/.me…)
  //    đã do KNOWN_DOMAINS + Logo.dev Search lo (chính xác). KHÔNG probe '.vn' vì domain parked
  //    hay trả 200 → false-positive (vd spotify.vn). Không key + brand lạ → '.com' là phỏng đoán an toàn nhất.
  const slug = key.replace(/[^a-z0-9]/g, "");
  return slug ? set(`${slug}.com`) : null;
}

/**
 * Fetch LOGO THẬT của brand (mục B). Chuỗi: Logo.dev (nếu có token) → Clearbit
 * (keyless) → Google favicon hi-res (keyless). Trả buffer ảnh hợp lệ hoặc null
 * (caller fallback AI). Best-effort, không throw. `fetchImpl` tiêm vào để test.
 */
export async function fetchBrandLogo(
  domain: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const d = (domain || "").trim().toLowerCase();
  if (!d) return null;
  const token = process.env.LOGODEV_TOKEN || process.env.LOGO_DEV_TOKEN;
  const candidates: string[] = [];
  if (token) candidates.push(`https://img.logo.dev/${d}?token=${token}&size=512&format=png&retina=true`);
  candidates.push(`https://logo.clearbit.com/${d}?size=512`);
  candidates.push(`https://www.google.com/s2/favicons?domain=${d}&sz=256`);
  for (const url of candidates) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "";
      if (!ct.startsWith("image/")) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 512) continue; // bỏ ảnh 1x1/placeholder rỗng
      return { buffer, contentType: ct };
    } catch {
      /* thử nguồn kế */
    }
  }
  return null;
}

/** Prompt scene cho brand khi CÓ logo thật (dùng làm reference cho GPT Image edits). */
export function brandScenePrompt(entity: string): string {
  const name = entity || "the brand";
  return `Place this exact brand logo prominently and undistorted on a clean modern brand presentation card or a smartphone screen, ${name} brand colors, cinematic studio lighting, vertical 9:16, photorealistic${SUFFIX_TEXT}`;
}

/**
 * Parse JSON mảng ShotPlan do director trả về (PURE → unit-test được).
 * - Lấy mảng JSON đầu tiên; map từng phần tử về ShotPlan hợp lệ.
 * - imageType ngoài tập hợp lệ / prompt rỗng → dùng fallback[i] (concept + prompt cũ).
 * - Luôn trả đúng `count` phần tử.
 */
export function parseShotPlans(rawText: string, count: number, fallbackPrompts: string[]): ShotPlan[] {
  const fb = (i: number): ShotPlan => ({
    imageType: "concept",
    prompt: (fallbackPrompts[i] || fallbackPrompts[0] || "").trim() || "cinematic b-roll establishing shot",
  });
  let arr: unknown[] = [];
  try {
    const txt = (rawText || "").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const match = txt.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : txt);
    arr = Array.isArray(parsed) ? parsed : [];
  } catch {
    arr = [];
  }
  return Array.from({ length: count }, (_, i) => {
    const raw = arr[i];
    if (!raw || typeof raw !== "object") return fb(i);
    const o = raw as Record<string, unknown>;
    const it = String(o.imageType || "").trim().toLowerCase();
    const prompt = String(o.prompt || "").trim();
    if (!IMAGE_TYPES.has(it) || !prompt) return fb(i);
    const entity = o.entity != null ? String(o.entity).trim().slice(0, 60) : undefined;
    const domainRaw = o.domain != null ? String(o.domain).trim().toLowerCase() : "";
    const domain = it === "brand" ? domainRaw || guessDomain(entity) || undefined : undefined;
    return { imageType: it as ImageType, entity: entity || undefined, prompt, domain };
  });
}

/**
 * BỘ ĐIỀU PHỐI HÌNH (mục A+D): 1 LLM call (writerModel = Gemini 3.x Pro, tiêm qua
 * `llm`) — vừa PHÂN LOẠI imageType mỗi shot, vừa viết prompt CỤ THỂ bám entity/số
 * từ SCRIPT + FACT HINT. Lỗi/parse fail → toàn bộ concept + prompt fallback (cũ).
 */
export async function planShotsAccurate(ctx: {
  topic: string;
  scriptText: string;
  factHint: string;
  segments: string[];
  fallbackPrompts: string[];
  count: number;
  llm: DirectorLLM;
  writerModel: string;
  onUsage?: (costUsd: number, tokensIn: number, tokensOut: number) => void | Promise<void>;
  /** Tiêm fetch cho resolveBrandDomain (test offline). Mặc định global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * C2 HYBRID (mặc định false): đạo diễn ƯU TIÊN 'real-scene' cho ĐA SỐ cảnh (→ Pexels video thật).
   * TẮT (pure C2 ACCURATE) → giữ NGUYÊN prompt cũ (không nhắc real-scene) → behavior y nguyên.
   */
  preferRealScene?: boolean;
}): Promise<ShotPlan[]> {
  const { topic, scriptText, factHint, segments, fallbackPrompts, count, llm, writerModel, onUsage, fetchImpl } = ctx;
  const preferRealScene = !!ctx.preferRealScene;
  const concepts = (): ShotPlan[] =>
    Array.from({ length: count }, (_, i) => ({
      imageType: "concept" as const,
      prompt: (fallbackPrompts[i] || fallbackPrompts[0] || "").trim() || "cinematic b-roll establishing shot",
    }));
  // Phần GIỚI THIỆU + phần KẾT (JSON-only) GIỮ NGUYÊN cho cả 2 chế độ.
  const sysIntro =
    "Bạn là ĐẠO DIỄN HÌNH ẢNH cho video dọc 9:16. Với MỖI cảnh, làm 2 việc: (1) PHÂN LOẠI imageType, (2) viết PROMPT ảnh tiếng Anh CỤ THỂ bám ĐÚNG entity (tên brand/tool/sản phẩm) và SỐ thật trong lời — TUYỆT ĐỐI không chung chung kiểu 'glowing app interface'. ";
  const sysOutro = "Chỉ trả JSON: mảng object {imageType, entity, domain, prompt} đúng thứ tự, KHÔNG giải thích.";
  // PURE C2 ACCURATE (preferRealScene=false) — văn bản Y NGUYÊN bản cũ (không phá C2 cũ).
  const typesAccurate =
    "imageType — ƯU TIÊN cảnh ĐANG DÙNG (màn hình/thao tác/thiết bị thật) hơn là chỉ logo: " +
    "'app-ui' = câu mô tả DÙNG phần mềm/app/màn hình/thiết bị-có-màn-hình (kể cả Apple Watch hiện nhịp tim, điện thoại hiện thông báo) → prompt mô tả UI realistic CÓ chữ ĐÚNG tool (vd 'the Make.com scenario editor showing connected modules and a Google Sheets row being filled', 'a phone showing a +500,000đ bank payment notification', 'an Apple Watch face showing 128 bpm heart rate while running'). " +
    "'product' = THIẾT BỊ/vật phẩm vật lý đang dùng (vd đồng hồ trên cổ tay khi chạy bộ, máy POS quẹt thẻ) → ảnh sản phẩm realistic trong bối cảnh dùng. " +
    "'brand' = CHỈ khi trọng tâm là NHẬN DIỆN thương hiệu/logo — câu giới thiệu/nhắc TÊN công ty mà KHÔNG mô tả thao tác/màn hình cụ thể → cần logo thật; entity=tên brand, domain=domain đoán (sepay.vn, make.com, zalo.me, notion.so). ĐỪNG chọn brand nếu câu đang nói VỀ DÙNG sản phẩm — khi đó chọn app-ui/product. " +
    "'chart' = số liệu/biểu đồ → biểu đồ trong bối cảnh, có nhãn số đúng. " +
    "'concept' = cảm xúc/trừu tượng → b-roll điện ảnh KHÔNG chữ. ";
  // C2 HYBRID (preferRealScene=true) — ƯU TIÊN 'real-scene' cho ĐA SỐ cảnh (→ Pexels video thật, mọi chủ đề).
  const typesHybrid =
    "imageType — MẶC ĐỊNH chọn 'real-scene' cho ĐA SỐ cảnh minh hoạ, áp dụng cho MỌI chủ đề (tài chính, sức khoẻ, kỹ năng, nấu ăn, du lịch, đời sống, kinh doanh...): " +
    "'real-scene' = cảnh ĐỜI THỰC quay được bằng máy quay, NHƯNG PHẢI BÁM ĐÚNG Ý ĐOẠN LỜI: từ câu, rút ra CHỦ THỂ (ai/cái gì) + HÀNH ĐỘNG (đang làm gì) + BỐI CẢNH liên quan TRỰC TIẾP nội dung, rồi tả 1 cảnh CỤ THỂ có người THẬT đang thao tác ĐÚNG việc đó. " +
    "Ví dụ BÁM LỜI: 'các bước hạch toán/kế toán' → 'a Vietnamese accountant reviewing financial documents and entering numbers into a spreadsheet at an office desk'; 'quản lý thời gian' → 'a person planning tasks in a notebook beside a laptop at a desk'; 'chạy bộ mỗi sáng' → 'a person jogging on a quiet residential street at sunrise'; 'nấu ăn tại nhà' → 'hands chopping fresh vegetables on a wooden board in a home kitchen'; 'tư vấn khách hàng' → 'two colleagues discussing over a laptop in a bright modern office'. " +
    "TUYỆT ĐỐI TRÁNH cảnh phong cảnh/toàn cảnh chung chung LẠC chủ thể: KHÔNG aerial/drone/flycam, KHÔNG skyline/thành phố nhìn từ trên cao, KHÔNG đường phố-giao thông-thiên nhiên ĐỨNG MỘT MÌNH — TRỪ KHI đoạn lời THỰC SỰ nói về địa điểm/đi lại/du lịch đó. Mỗi cảnh phải có CHỦ THỂ rõ (người / bàn tay / vật đang được thao tác), không để cảnh trống hay lạc đề. prompt = câu tiếng Anh TẢ CẢNH gồm CHỦ THỂ + HÀNH ĐỘNG + BỐI CẢNH, KHÔNG chữ. ĐÂY LÀ LỰA CHỌN MẶC ĐỊNH — phần lớn cảnh nên là 'real-scene'. " +
    // CHỐNG LẠC KIỂU ĐỘNG-LỰC/GIÀU-SANG (gốc rễ bug 'báo cáo tài chính' → người đứng bãi biển giơ điện thoại).
    "ĐẶC BIỆT — câu nói về CÔNG VIỆC / QUY TRÌNH / SỐ LIỆU / TIỀN BẠC / KẾT QUẢ, KỂ CẢ câu ĐỘNG LỰC hay TRỪU TƯỢNG ('tự do tài chính', 'người giàu', 'thành công', 'làm giàu', 'báo cáo tài chính', 'đầu tư') → BẮT BUỘC tả NGƯỜI đang LÀM việc đó CỤ THỂ (xem/phân tích báo cáo·biểu đồ trên laptop, đếm·quản lý tiền, làm việc ở bàn/văn phòng, dùng app ngân hàng), TUYỆT ĐỐI KHÔNG dùng biểu tượng giàu-sang/nghỉ-dưỡng để minh hoạ: KHÔNG du thuyền/yacht, KHÔNG hồ bơi/bãi biển/biển/resort, KHÔNG thiền/yoga/vườn thiền, KHÔNG 'tận hưởng tự do' chung chung — TRỪ KHI câu THỰC SỰ nói về du lịch/nghỉ ngơi/thư giãn. " +
    "Ví dụ NẮN ĐÚNG: 'người giàu quản lý tiền' → 'a person reviewing investment charts on a laptop at an office desk'; 'tự do tài chính' → 'a person calmly checking a banking app on a phone at a home desk'; 'báo cáo tài chính truyền thống' → 'an accountant reviewing printed financial reports and entering numbers into a spreadsheet at a desk'. " +
    // CHỐNG LẠC HỌC-THUẬT (gốc bug 'dùng AI'/'VTV cũng dùng' → vẽ CÔNG THỨC HOÁ HỌC) + FALLBACK TRUNG TÍNH.
    "ĐẶC BIỆT 2 — câu CÔNG NGHỆ / AI / TỰ ĐỘNG HOÁ / TIN TỨC / KỸ NĂNG trừu tượng → tả NGƯỜI đang DÙNG/THAO TÁC công nghệ đó (gõ laptop, lướt điện thoại, họp, làm ở văn phòng). TUYỆT ĐỐI KHÔNG cảnh HỌC THUẬT/KHOA HỌC lạc đề: KHÔNG bảng đen/công thức toán-lý-hoá, KHÔNG phòng thí nghiệm/ống nghiệm/hoá chất/kính hiển vi, KHÔNG lớp học lý thuyết — TRỪ KHI lời THỰC SỰ nói về toán/lý/hoá/khoa học/giáo dục đó. " +
    "FALLBACK TRUNG TÍNH — KHI KHÔNG CHẮC cảnh nào khớp lời: chọn 'real-scene' AN TOÀN = người làm việc với laptop / văn phòng hiện đại / thao tác điện thoại / ghi chép ở bàn — thà TRUNG TÍNH còn hơn SAI chủ đề (KHÔNG BAO GIỜ chèn cảnh lạc đề). " +
    "Ví dụ: 'dùng AI mỗi ngày' → 'a person using an AI chatbot on a laptop at a desk'; 'ngay cả đài lớn/VTV cũng dùng' → 'a person working on a laptop in a modern office' (KHÔNG bảng đen/công thức/lab). " +
    // FIX NGỮ CẢNH TECH: câu nhắc TOOL/APP cụ thể → app-ui MÀN HÌNH tool (không real-scene người chung).
    "ĐẶC BIỆT 3 — câu NHẮC TỚI TOOL/APP/NỀN TẢNG cụ thể (n8n, Make, Zapier, Google Forms/Sheets, Facebook Ads, dashboard, CRM, chatbot, automation, workflow…): BẮT BUỘC chọn 'app-ui' tả MÀN HÌNH/GIAO DIỆN tool đó đang thao tác ĐÚNG việc đang nói — UI hiện đại, SÁNG, sạch, label rõ — KHÔNG real-scene cảnh người chung chung, KHÔNG cảnh người-đi-bộ/đời-thường cho câu về tool. Ví dụ: 'Zapier nối Facebook Lead Ads với Google Sheets' → 'a laptop screen showing a Zapier workflow connecting Facebook Lead Ads to Google Sheets, clean modern bright dashboard UI, legible labels'; 'n8n tự động lấy data khách hàng' → 'a laptop screen showing an n8n automation workflow with connected nodes pulling customer data into a spreadsheet, bright modern UI'; 'lấy data khách hàng về CRM' → 'a laptop screen showing a CRM dashboard filling with new customer leads, clean bright UI'. " +
    "CHỈ chọn các loại dưới đây khi cảnh quay người/đời-thực THỰC SỰ không thể hiện được điều cần nói: " +
    "'app-ui' = câu BẮT BUỘC phải thấy màn hình/giao diện app/phần mềm CỤ THỂ (vd thao tác trong Make.com, thông báo chuyển khoản +500.000đ trên điện thoại) → prompt mô tả UI realistic CÓ chữ ĐÚNG tool. " +
    "'brand' = trọng tâm là NHẬN DIỆN logo MỘT thương hiệu cụ thể → cần logo thật; entity=tên brand, domain=domain đoán (sepay.vn, make.com, zalo.me, notion.so). " +
    "'chart' = cần biểu đồ/số liệu CỤ THỂ → biểu đồ có nhãn số đúng. " +
    "'product' = MỘT thiết bị/vật phẩm cụ thể làm CHỦ THỂ CHÍNH (vd Apple Watch hiện 128 bpm, máy POS quẹt thẻ); nếu chỉ là vật thường trong cảnh thì để 'real-scene'. " +
    "'concept' = cảm xúc/ý trừu tượng KHÔNG quay bằng cảnh thực được → b-roll điện ảnh KHÔNG chữ. " +
    "Mỗi prompt là câu tiếng Anh tả cảnh, dùng cho CẢ tìm video stock LẪN sinh ảnh AI. ";
  try {
    const segBlock = segments.map((s, i) => `${i + 1}. ${s || topic}`).join("\n");
    // FIX NGỮ CẢNH: tool nhắc trong kịch bản → HINT director ưu tiên 'app-ui'. CHỈ nhánh hybrid;
    // nhánh accurate (preferRealScene=false) KHÔNG đụng → golden test byte-identical không vỡ.
    const toolHints = preferRealScene ? detectToolMention(`${scriptText}\n${factHint}`) : [];
    const toolHintLine = toolHints.length
      ? `CÔNG CỤ NHẮC TỚI trong kịch bản: ${toolHints.join(", ")} → các CẢNH nói về tool này PHẢI là 'app-ui' tả MÀN HÌNH/UI tool đó (sáng, hiện đại), KHÔNG cảnh người chung.\n\n`
      : "";
    const res = await llm.complete({
      model: writerModel,
      system: sysIntro + (preferRealScene ? typesHybrid : typesAccurate) + sysOutro,
      messages: [
        {
          role: "user",
          content:
            `CHỦ ĐỀ: ${topic}\n\nKỊCH BẢN (đọc để lấy entity/số):\n"""${scriptText.slice(0, 1800)}"""\n\n` +
            (factHint.trim() ? `ENTITY/SỐ THẬT (ưu tiên bám):\n"""${factHint.slice(0, 1200)}"""\n\n` : "") +
            `CÁC CẢNH (đoạn lời tương ứng):\n${segBlock}\n\n` +
            (preferRealScene
              ? toolHintLine + `Trả JSON mảng ĐÚNG ${count} object {imageType, entity, domain, prompt}. MẶC ĐỊNH 'real-scene' tả cảnh người THẬT đang THAO TÁC đúng Ý đoạn lời (chủ thể + hành động + bối cảnh liên quan), TRÁNH phong cảnh/aerial/đường phố lạc đề; câu về công việc/tiền/số liệu (kể cả 'tự do tài chính'/'người giàu') phải tả NGƯỜI làm việc cụ thể, KHÔNG du thuyền/bãi biển/hồ bơi/thiền; app-ui/brand/chart CHỈ khi thật cần UI app/logo brand/biểu đồ; mỗi prompt là câu tiếng Anh tả cảnh dùng cho CẢ video stock LẪN ảnh AI.`
              : `Trả JSON mảng ĐÚNG ${count} object {imageType, entity, domain, prompt}. Mỗi prompt bám entity/số của đoạn lời đó; brand → entity+domain; app-ui → mô tả UI có chữ đúng tool; concept → cảnh điện ảnh không chữ.`),
        },
      ],
      maxTokens: 1400,
      responseFormat: "json",
    });
    if (onUsage && (res.costUsd || res.tokensIn || res.tokensOut)) {
      await onUsage(res.costUsd || 0, res.tokensIn || 0, res.tokensOut || 0);
    }
    const plans = parseShotPlans(res.text, count, fallbackPrompts);
    // NÂNG ĐỘ PHỦ LOGO: resolve domain ASYNC cho shot 'brand' (KNOWN → đã-domain → Logo.dev Search → heuristic),
    // vượt qua guessDomain sync trong parseShotPlans. Best-effort (không throw) → giữ plans dù resolve lỗi.
    await Promise.all(
      plans.map(async (p) => {
        if (p.imageType === "brand" && p.entity) {
          const d = await resolveBrandDomain(p.entity, { fetchImpl });
          if (d) p.domain = d;
        }
      })
    );
    return plans;
  } catch {
    return concepts(); // an toàn: lỗi LLM → toàn bộ concept + prompt cũ
  }
}
