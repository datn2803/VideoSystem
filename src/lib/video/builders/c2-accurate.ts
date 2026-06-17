// ── C2 "ACCURATE" — ảnh b-roll bám ĐÚNG kịch bản (BLUEPRINT_C2_V2_ACCURATE.md) ──
// ADDITIVE: chỉ chạy khi cờ C2_ACCURATE=1. Lỗi bất kỳ nhánh nào → caller fallback
// về planShotPrompts cũ (KHÔNG phá C2 cũ).
// THIẾT KẾ: module KHÔNG import singleton nặng (hub/usage) — `llm` được TIÊM vào
// planShotsAccurate → mọi hàm còn lại là PURE → unit-test offline không cần env/DB.

export type ImageType = "brand" | "app-ui" | "product" | "concept" | "chart";

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

const IMAGE_TYPES: ReadonlySet<string> = new Set(["brand", "app-ui", "product", "concept", "chart"]);

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

/** Chọn suffix theo imageType (concept = no-text; còn lại = cho phép chữ). */
export function suffixFor(imageType: ImageType): string {
  return imageType === "concept" ? SUFFIX_NOTEXT : SUFFIX_TEXT;
}

// Brand phổ biến → domain chuẩn (ưu tiên trước heuristic). Mở rộng dễ, KHÔNG hard-code chủ đề.
const KNOWN_DOMAINS: Record<string, string> = {
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
};

/** Suy domain từ tên brand: known-map → nếu đã là domain → giữ → else thử '.com'. */
export function guessDomain(entity: string | undefined): string | null {
  const e = (entity || "").trim().toLowerCase();
  if (!e) return null;
  if (KNOWN_DOMAINS[e]) return KNOWN_DOMAINS[e];
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return e; // đã là domain
  const slug = e.replace(/[^a-z0-9]/g, "");
  return slug ? `${slug}.com` : null; // 1 từ → thử .com (best-effort)
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
}): Promise<ShotPlan[]> {
  const { topic, scriptText, factHint, segments, fallbackPrompts, count, llm, writerModel, onUsage } = ctx;
  const concepts = (): ShotPlan[] =>
    Array.from({ length: count }, (_, i) => ({
      imageType: "concept" as const,
      prompt: (fallbackPrompts[i] || fallbackPrompts[0] || "").trim() || "cinematic b-roll establishing shot",
    }));
  try {
    const segBlock = segments.map((s, i) => `${i + 1}. ${s || topic}`).join("\n");
    const res = await llm.complete({
      model: writerModel,
      system:
        "Bạn là ĐẠO DIỄN HÌNH ẢNH cho video dọc 9:16. Với MỖI cảnh, làm 2 việc: (1) PHÂN LOẠI imageType, (2) viết PROMPT ảnh tiếng Anh CỤ THỂ bám ĐÚNG entity (tên brand/tool/sản phẩm) và SỐ thật trong lời — TUYỆT ĐỐI không chung chung kiểu 'glowing app interface'. " +
        "imageType — ƯU TIÊN cảnh ĐANG DÙNG (màn hình/thao tác/thiết bị thật) hơn là chỉ logo: " +
        "'app-ui' = câu mô tả DÙNG phần mềm/app/màn hình/thiết bị-có-màn-hình (kể cả Apple Watch hiện nhịp tim, điện thoại hiện thông báo) → prompt mô tả UI realistic CÓ chữ ĐÚNG tool (vd 'the Make.com scenario editor showing connected modules and a Google Sheets row being filled', 'a phone showing a +500,000đ bank payment notification', 'an Apple Watch face showing 128 bpm heart rate while running'). " +
        "'product' = THIẾT BỊ/vật phẩm vật lý đang dùng (vd đồng hồ trên cổ tay khi chạy bộ, máy POS quẹt thẻ) → ảnh sản phẩm realistic trong bối cảnh dùng. " +
        "'brand' = CHỈ khi trọng tâm là NHẬN DIỆN thương hiệu/logo — câu giới thiệu/nhắc TÊN công ty mà KHÔNG mô tả thao tác/màn hình cụ thể → cần logo thật; entity=tên brand, domain=domain đoán (sepay.vn, make.com, zalo.me, notion.so). ĐỪNG chọn brand nếu câu đang nói VỀ DÙNG sản phẩm — khi đó chọn app-ui/product. " +
        "'chart' = số liệu/biểu đồ → biểu đồ trong bối cảnh, có nhãn số đúng. " +
        "'concept' = cảm xúc/trừu tượng → b-roll điện ảnh KHÔNG chữ. " +
        "Chỉ trả JSON: mảng object {imageType, entity, domain, prompt} đúng thứ tự, KHÔNG giải thích.",
      messages: [
        {
          role: "user",
          content:
            `CHỦ ĐỀ: ${topic}\n\nKỊCH BẢN (đọc để lấy entity/số):\n"""${scriptText.slice(0, 1800)}"""\n\n` +
            (factHint.trim() ? `ENTITY/SỐ THẬT (ưu tiên bám):\n"""${factHint.slice(0, 1200)}"""\n\n` : "") +
            `CÁC CẢNH (đoạn lời tương ứng):\n${segBlock}\n\n` +
            `Trả JSON mảng ĐÚNG ${count} object {imageType, entity, domain, prompt}. Mỗi prompt bám entity/số của đoạn lời đó; brand → entity+domain; app-ui → mô tả UI có chữ đúng tool; concept → cảnh điện ảnh không chữ.`,
        },
      ],
      maxTokens: 1400,
      responseFormat: "json",
    });
    if (onUsage && (res.costUsd || res.tokensIn || res.tokensOut)) {
      await onUsage(res.costUsd || 0, res.tokensIn || 0, res.tokensOut || 0);
    }
    return parseShotPlans(res.text, count, fallbackPrompts);
  } catch {
    return concepts(); // an toàn: lỗi LLM → toàn bộ concept + prompt cũ
  }
}
