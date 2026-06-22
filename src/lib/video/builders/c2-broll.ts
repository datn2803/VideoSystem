import crypto from "node:crypto";
import { store } from "@/lib/integration-hub/storage";
import { getOrCreateBrandKit } from "@/lib/design/director";
import { hub } from "@/lib/integration-hub/hub";
import { recordLLMUsage } from "@/lib/agents/usage";
import { footageStore } from "@/lib/footage/storage";
import { audioStore } from "@/lib/audio/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { blobUpload } from "@/lib/backend/blob-store";
import { kvRead, kvWrite } from "@/lib/backend/kv-store";
import { videoStore, type VideoDraftRecord } from "../storage";
import { getEngine } from "../engine";
import { isLive, allowSelfHostRender, assertDailyCap, recordPaidUsage } from "../cost-guard";
import { withRetry, pickRenderProvider, toAbsoluteUrl, generatePlaceholderMp4 } from "./_shared";
import { RENDER_PIPELINE_VERSION } from "../render-version";
import type { ImageProvider } from "@/lib/integration-hub/types";
import {
  isC2Accurate,
  c2AccurateQuality,
  planShotsAccurate,
  suffixFor,
  fetchBrandLogo,
  brandScenePrompt,
  type ShotPlan,
  type ImageType,
} from "./c2-accurate";
import { isC2Hybrid, searchPexelsClip, toPexelsQuery } from "./pexels";

// C2 HYBRID — loại cảnh THỬ Pexels (video THẬT) trước, miss/không key → fallback ảnh AI:
//   real-scene (cảnh đời thực — MẶC ĐỊNH cho đa số chủ đề), concept (trừu tượng), product (vật/thiết bị).
// app-ui / brand / chart → LUÔN ảnh AI (UI có chữ / logo brand / biểu đồ số — AI làm chuẩn hơn stock).
const PEXELS_TYPES: ReadonlySet<ImageType> = new Set<ImageType>(["real-scene", "concept", "product"]);

async function pickImageProvider() {
  const providers = (await store.listProviders()).filter((p) => p.kind === "image" && p.enabled);
  return providers.find((p) => p.isDefault) || providers[0];
}

// Ảnh AI là PAID → chỉ sinh tối đa MAX_IMAGES shot + hậu tố style cố định cho đồng nhất.
// (Style suffix dùng chung là BROLL_STYLE_SUFFIX bên dưới — cả hyperframes lẫn creatomate.)
const MAX_IMAGES = 5;
const IMG_CACHE_KEY = "broll-image-cache"; // hash -> public URL (tránh re-render đốt tiền)

function hashImage(scriptId: string, idx: number, prompt: string, model: string): string {
  return crypto.createHash("sha256").update(`${scriptId}::${idx}::${prompt}::${model}`).digest("hex");
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  return ".jpg";
}

// ── B-roll ảnh AI theo topic (GPT Image) ──────────────────────────────────────
// Hậu tố style cố định cho MỌI shot → bộ ảnh đồng nhất, không lộn xộn, KHÔNG chữ.
// PHASE 0 — COLOR SYSTEM: tông NGUỒN ảnh đổi từ "moody cool-toned" (tối, lạnh) sang
// SÁNG/ẤM (warm sunlit, gentle orange) → đồng tông C1 + brand cam, hết "C2 tối trầm".
const BROLL_STYLE_SUFFIX =
  ". Professional cinematic photograph, vertical 9:16 composition, bright soft natural lighting, airy and clean, rich detail and texture, photorealistic, consistent warm sunlit color grade with gentle orange highlights, modern realistic Vietnamese setting, shallow depth of field, no readable text, no captions, no watermark, no logo, no UI labels.";

// Mỗi cảnh 1 CHỈ DẪN máy quay + LOẠI CHỦ THỂ khác nhau → ép ĐA DẠNG (không phải
// cảnh nào cũng "người ngồi laptop") + minh hoạ ĐÚNG ý đoạn lời thoại (vật/màn hình/
// bàn tay/khái niệm), theo quy tắc 3 góc (toàn–trung–cận).
const SCENE_DIRECTIVES = [
  "the KEY OBJECT or RESULT as hero subject — a device screen showing an app interface / social feed / rising view-count graph / dashboard, or the relevant object — little or no person, glowing abstract UI with NO readable text",
  "WIDE cinematic establishing shot of a symbolic location/environment for this line (no people necessary)",
  "EXTREME CLOSE-UP of hands clicking / tapping / typing on a glowing laptop or smartphone screen (the action of the line)",
  "MEDIUM shot of a person whose facial expression conveys this line's emotion",
  "OVER-THE-SHOULDER shot of someone looking at a glowing phone/laptop screen showing relevant content",
  "MACRO close-up of a single relevant detail or object symbolising the idea",
  "DYNAMIC angle (top-down or low-angle) of the relevant objects/setting arranged cinematically",
];

// Hash chuỗi → số → xoay điểm bắt đầu directive THEO content: mỗi content mở đầu
// bằng LOẠI cảnh khác nhau (hết tình trạng video nào cũng mở bằng "bàn tay click").
function seedNum(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Chia voiceOver thành `n` đoạn ~đều (ưu tiên theo câu, không đủ thì theo từ).
 * Mỗi đoạn dùng làm NGỮ CẢNH cho 1 ảnh → ảnh minh hoạ đúng câu đang nói. */
function splitIntoSegments(text: string, n: number): string[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return Array.from({ length: n }, () => "");
  const sentences = clean.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= n) {
    const per = Math.ceil(sentences.length / n);
    return Array.from({ length: n }, (_, i) => sentences.slice(i * per, (i + 1) * per).join(" ").trim() || clean);
  }
  const words = clean.split(" ");
  const per = Math.ceil(words.length / n);
  return Array.from({ length: n }, (_, i) => words.slice(i * per, (i + 1) * per).join(" ").trim() || clean);
}

/**
 * "Đạo diễn" B-roll (1 call Gemini free): CHIA lời thoại thành N đoạn → mỗi ảnh
 * minh hoạ ĐÚNG đoạn đang nói (b-roll có chủ đích, khớp content). Áp QUY TẮC 3 GÓC
 * (toàn–trung–cận, luân phiên) + ảnh điện ảnh CỤ THỂ, KHÔNG chữ.
 * Fallback (LLM lỗi/parse fail): ghép cỡ-cảnh + topic + đoạn lời thoại tương ứng.
 */
async function planShotPrompts(topic: string, voiceOver: string, hints: string[], count: number): Promise<string[]> {
  const cleanHints = hints.map((h) => (h || "").trim()).filter(Boolean);
  const segments = splitIntoSegments(voiceOver, count);
  // Xoay điểm bắt đầu directive theo content → mỗi content mở đầu bằng loại cảnh khác.
  const off = seedNum(topic || voiceOver || "x") % SCENE_DIRECTIVES.length;
  const dirAt = (i: number) => SCENE_DIRECTIVES[(i + off) % SCENE_DIRECTIVES.length];
  const fallback = () =>
    Array.from({ length: count }, (_, i) => {
      const ctx = (segments[i] || cleanHints[i] || topic).trim();
      return `${dirAt(i)}, depicting: ${ctx} (topic: ${topic})`;
    });
  try {
    const llm = await hub.llm();
    const segBlock = segments
      .map((s, i) => `${i + 1}. [CHỈ DẪN: ${dirAt(i)}] Lời: ${s || topic}`)
      .join("\n");
    const res = await llm.complete({
      system:
        "Bạn là ĐẠO DIỄN HÌNH ẢNH cho video ngắn dọc 9:16. Mỗi CẢNH gồm 1 CHỈ DẪN máy quay/chủ thể + ĐOẠN lời thoại. Với MỖI cảnh: xác định Ý CHÍNH (đối tượng/hành động/khái niệm) của đoạn lời rồi MINH HOẠ TRỰC TIẾP & CỤ THỂ theo đúng chỉ dẫn đó. " +
        "BẮT BUỘC ĐA DẠNG CHỦ THỂ — TUYỆT ĐỐI KHÔNG để mọi cảnh đều là 'người ngồi nhìn laptop'. " +
        "Với khái niệm công nghệ/trừu tượng (AI, viral, một cú click, tự động hoá, dòng tiền, lãi suất...) → dùng hình CỤ THỂ HOÁ ý đó: cận màn hình laptop/điện thoại hiển thị giao diện app phát sáng, ngón tay đang bấm nút phát sáng, biểu đồ lượt xem/đường giá tăng vọt trên màn hình, dòng timeline dựng video, app AI đang tạo nội dung, giao diện hologram trừu tượng... (KHÔNG chữ/nhãn đọc được). " +
        // CHỐNG LẠC HỌC-THUẬT (gốc bug 'dùng AI' → vẽ công thức hoá học): cấm cảnh khoa học/lý thuyết + fallback trung tính.
        "TUYỆT ĐỐI KHÔNG cảnh HỌC THUẬT/KHOA HỌC lạc đề khi minh hoạ công nghệ/AI/kinh doanh: KHÔNG bảng đen/công thức toán-lý-hoá, KHÔNG phòng thí nghiệm/ống nghiệm/hoá chất/kính hiển vi, KHÔNG lớp học lý thuyết — TRỪ KHI lời THỰC SỰ nói về toán/lý/hoá/khoa học/giáo dục đó. KHI KHÔNG CHẮC cảnh nào khớp lời → chọn cảnh TRUNG TÍNH AN TOÀN: người làm việc với laptop/điện thoại ở văn phòng hiện đại (thà trung tính còn hơn SAI chủ đề, KHÔNG BAO GIỜ chèn cảnh lạc đề). " +
        "CHỈ dùng cảnh CHÂN DUNG người khi câu nói về cảm xúc/con người. Mỗi prompt: TIẾNG ANH, cụ thể, ánh sáng điện ảnh, bối cảnh Việt Nam hiện đại, mỗi cảnh KHÁC chủ thể & góc. CHỈ trả JSON mảng string đúng thứ tự, KHÔNG giải thích.",
      messages: [
        { role: "user", content: `CHỦ ĐỀ: ${topic}\n\nCÁC CẢNH (chỉ dẫn + đoạn lời thoại):\n${segBlock}\n\nTrả JSON mảng ĐÚNG ${count} prompt tiếng Anh — mỗi prompt minh hoạ TRỰC TIẾP ý của đoạn lời theo CHỈ DẪN, đa dạng chủ thể (màn hình/giao diện/bàn tay/vật thể/người), KHÔNG chữ trong ảnh.` },
      ],
      maxTokens: 1100,
      responseFormat: "json",
    });
    const txt = res.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const arr = JSON.parse(txt.match(/\[[\s\S]*\]/)?.[0] ?? txt) as unknown[];
    const fb = fallback();
    return Array.from({ length: count }, (_, i) => {
      const p = arr[i];
      return typeof p === "string" && p.trim() ? p.trim() : fb[i];
    });
  } catch {
    return fallback();
  }
}

/**
 * Sinh ảnh AI cho từng shot qua hub.image() (GPT Image). Trả [{ url, durationSec }].
 *
 * Cost-guard: chỉ sinh khi RENDER_LIVE="1" VÀ có image provider → nếu không, trả []
 * (template dùng gradient, KHÔNG throw). Cache theo hash(scriptId+idx+prompt+model)
 * để re-render không đốt tiền. withRetry(1). Cap MAX_IMAGES. Upload bucket
 * broll-images (public) → URL công khai cho service tải từ xa.
 */
type BrollImagesResult = {
  /** type: "image" (ảnh AI + Ken-Burns, mặc định) | "video" (clip Pexels thật, C2 HYBRID). */
  images: { url: string; durationSec: number; type: "image" | "video" }[];
  /** Có ý định sinh ảnh không (RENDER_LIVE=1 + có provider). Phân biệt với chế độ gradient cố ý. */
  intended: boolean;
  /** Số ảnh lỗi + message lỗi đầu tiên — để buildBroll báo draft.error rõ ràng. */
  failed: number;
  firstError?: string;
};

/**
 * Sinh 1 shot ảnh. C2 ACCURATE: shot 'brand' có domain + adapter hỗ trợ edits →
 * ghép LOGO THẬT (reference) thay vì để AI vẽ lại (méo/sai). Lỗi/không logo →
 * generate() thường (fullPrompt đã kèm suffix phù hợp nhánh). C2 cũ: plan=undefined.
 */
async function generateShot(
  adapter: ImageProvider,
  plan: ShotPlan | undefined,
  fullPrompt: string,
  quality: string | undefined
): Promise<{ imageBase64: string; mimeType: string }> {
  if (plan?.imageType === "brand" && plan.domain && adapter.generateFromReference) {
    const logo = await fetchBrandLogo(plan.domain);
    if (logo) {
      try {
        return await adapter.generateFromReference({
          prompt: brandScenePrompt(plan.entity || ""),
          referencePng: logo.buffer,
          referenceMime: logo.contentType,
          quality,
        });
      } catch (e) {
        console.error("[c2-accurate] logo edits fail → fallback AI:", e instanceof Error ? e.message : e);
      }
    }
  }
  return adapter.generate({ prompt: fullPrompt, quality });
}

async function generateBrollImages(
  scriptId: string,
  topic: string,
  voiceOver: string,
  shotList: { note: string; durationSec: number }[],
  totalDur: number,
  factHint = "",
  opts: { allowVideo?: boolean } = {}
): Promise<BrollImagesResult> {
  const imageProvider = await pickImageProvider();
  // Cost-guard (Phase 3): ảnh AI là PAID → chỉ khi RENDER_MODE=live (compat RENDER_LIVE=1).
  const useAI = isLive() && !!imageProvider;
  // Không bật live / thiếu provider → chế độ gradient CỐ Ý (không phải lỗi).
  if (!useAI) return { images: [], intended: false, failed: 0 };

  const imgAdapter = await hub.image();
  if (!imgAdapter) return { images: [], intended: false, failed: 0 };
  const model = (imageProvider!.config?.modelId as string) || "";

  // Số cảnh theo nhịp ~4s/cảnh (chuẩn 2–5s/cảnh), tối thiểu 4, cap MAX_IMAGES
  // (giữ sinh song song < Vercel 60s). Đạo diễn cảnh đa góc theo voiceOver.
  const count = Math.max(4, Math.min(MAX_IMAGES, Math.round((totalDur || 20) / 4.2)));
  // Trần chi phí/ngày TRƯỚC khi sinh (ước tính count ảnh; cache hit thì rẻ hơn — chặn an toàn).
  const perImgUsd = Number(process.env.IMAGE_COST_PER_IMAGE_USD) || 0.05;
  await assertDailyCap(count * perImgUsd, `${count} ảnh b-roll`);
  const hints = shotList.map((s) => (s.note || "").trim()).filter(Boolean);
  const prompts = await planShotPrompts(topic, voiceOver, hints, count);
  // C2 HYBRID (sau cờ C2_HYBRID, CHỈ khi caller cho phép video = path hyperframes): cảnh 'concept'
  // → clip Pexels VIDEO THẬT, miss → ảnh AI như cũ. Hybrid CẦN bộ điều phối để phân loại concept
  // → bật 'accurate' kèm theo (brand/app-ui/chart vẫn ảnh AI bám entity). Key Pexels: env (hoặc Hub sau).
  const hybrid = !!opts.allowVideo && isC2Hybrid();
  const pexelsKey = process.env.PEXELS_API_KEY || process.env.PEXELS_KEY || undefined;
  // C2 ACCURATE (sau cờ): bộ điều phối imageType + prompt bám entity/số (writerModel).
  // Lỗi điều phối (LLM/hub) → revert HOÀN TOÀN về C2 cũ (prompts[] + suffix cũ + quality cũ).
  let accurate = isC2Accurate() || hybrid;
  let accQuality = accurate ? c2AccurateQuality() : undefined;
  let plans: ShotPlan[] | null = null;
  if (accurate) {
    try {
      const directorLlm = await hub.llm();
      const writerModel = await hub.llmWriterModel();
      plans = await planShotsAccurate({
        topic,
        scriptText: voiceOver,
        factHint,
        segments: splitIntoSegments(voiceOver, count),
        fallbackPrompts: prompts,
        count,
        llm: directorLlm,
        writerModel,
        onUsage: recordLLMUsage,
        // HYBRID → đạo diễn ƯU TIÊN 'real-scene' (Pexels video thật mọi chủ đề).
        // Pure accurate (C2_ACCURATE, hybrid off) → false → prompt director Y NGUYÊN bản cũ.
        preferRealScene: hybrid,
      });
    } catch (e) {
      console.error("[c2-accurate] điều phối lỗi → fallback C2 cũ:", e instanceof Error ? e.message : e);
      accurate = false;
      accQuality = undefined;
      plans = null;
    }
  }
  const cache = await kvRead<Record<string, string>>(IMG_CACHE_KEY, {});
  const even = totalDur / count;

  // QUAN TRỌNG: sinh ảnh SONG SONG (Promise.all) thay vì tuần tự.
  // 5 ảnh GPT Image tuần tự (~20s/ảnh) > 60s → Vercel function timeout
  // ("An unexpected response..."). Song song → ~tổng ≈ thời gian 1 ảnh.
  type Shot = { idx: number; hash: string; url: string; fresh?: string; durationSec: number; error?: string; type: "image" | "video" };
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) => i).map(async (i): Promise<Shot | null> => {
      const plan = plans?.[i];
      // HYBRID: cảnh real-scene/concept/product → thử clip Pexels DỌC thật trước; có → dùng VIDEO
      // (free, KHÔNG đốt tiền ảnh, KHÔNG cache blob vì link Pexels đã công khai); miss/không key →
      // rơi xuống ảnh AI như cũ. app-ui/brand/chart KHÔNG vào đây → luôn ảnh AI (bên dưới).
      if (hybrid && plan && PEXELS_TYPES.has(plan.imageType)) {
        // Query lấy theo prompt TẢ CẢNH (chủ thể + hành động + bối cảnh); chèn entity nếu có.
        const query = toPexelsQuery(plan.entity ? `${plan.entity} ${plan.prompt}` : plan.prompt);
        const clip = await searchPexelsClip(query, { orientation: "portrait", apiKey: pexelsKey });
        if (clip?.url) {
          return { idx: i, hash: `pex:${i}`, url: clip.url, durationSec: Math.round(even * 100) / 100, type: "video" };
        }
      }
      const fullPrompt = plan ? `${plan.prompt}${suffixFor(plan.imageType)}` : `${prompts[i]}${BROLL_STYLE_SUFFIX}`;
      // accurate → hash kèm biến thể (imageType/domain/quality) để KHÔNG đụng cache ảnh C2 cũ.
      const hashInput = accurate ? `${fullPrompt}|acc:${plan?.imageType}:${plan?.domain || ""}:${accQuality}` : fullPrompt;
      const h = hashImage(scriptId, i, hashInput, model);
      let url = cache[h];
      let fresh: string | undefined;
      if (!url) {
        try {
          const img = await withRetry(() => generateShot(imgAdapter, plan, fullPrompt, accQuality), 1);
          url = await blobUpload({
            bucket: "broll-images",
            filename: `${scriptId}-${i}-${h.slice(0, 8)}${extFromMime(img.mimeType)}`,
            buffer: Buffer.from(img.imageBase64, "base64"),
            contentType: img.mimeType,
          });
          fresh = url; // ghi cache sau khi xong hết (tránh race trên object dùng chung)
        } catch (e) {
          // 1 ảnh lỗi → bỏ shot đó (không kéo sập cả video), NHƯNG lộ lý do:
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[broll-image-fail]", i, msg);
          return { idx: i, hash: h, url: "", durationSec: 0, error: msg, type: "image" };
        }
      }
      const abs = toAbsoluteUrl(url);
      if (!abs) return { idx: i, hash: h, url: "", durationSec: 0, error: "URL ảnh rỗng sau upload", type: "image" };
      return { idx: i, hash: h, url: abs, fresh, durationSec: Math.round(even * 100) / 100, type: "image" };
    })
  );

  // Ghi cache 1 lần sau khi tất cả ảnh xong (an toàn, không race).
  let cacheDirty = false;
  let freshCount = 0;
  for (const r of results) {
    if (r?.fresh) {
      cache[r.hash] = r.fresh;
      cacheDirty = true;
      freshCount++;
    }
  }
  if (cacheDirty) await kvWrite(IMG_CACHE_KEY, cache);
  // Usage meter: chỉ tính ảnh SINH MỚI (cache hit = $0) → trần/ngày enforce đúng thực tế.
  if (freshCount > 0) await recordPaidUsage("image", freshCount * perImgUsd, freshCount);

  const ok = results.filter((r): r is Shot => r != null && !!r.url);
  const errors = results.filter((r): r is Shot => r != null && !r.url && !!r.error);
  return {
    images: ok.sort((a, b) => a.idx - b.idx).map((r) => ({ url: r.url, durationSec: r.durationSec, type: r.type })),
    intended: true,
    failed: errors.length,
    firstError: errors[0]?.error,
  };
}

// (FIX A — đã GỠ Whisper/caption helpers cũ: getOpenAIKey/transcribeWords/groupWords/buildCaptionLines
//  + type Word/CaptionGroup/CaptionLine. C2 giờ HÌNH SẠCH (không caption/giọng nung) → caption do C4 overlay lo.)

/** Cache key C2 (Phase 3): content + audio + NHẠC + BrandKit + live-mode (ảnh AI có/không).
 *  musicId trong hash → thêm/xoá nhạc là render mới (không dính video cũ từ cache). */
function hashBrollRender(scriptId: string, audioId: string | undefined, musicId: string | undefined, content: object, tokens: string, live: boolean): string {
  return crypto
    .createHash("sha256")
    .update(`${RENDER_PIPELINE_VERSION}::${scriptId}::${audioId || ""}::${musicId || ""}::${JSON.stringify(content)}::${tokens}::${live ? "live" : "free"}`)
    .digest("hex");
}

export async function buildBroll(input: {
  scriptId: string;
  audioId?: string;
  /** true (nút Re-render) → bỏ qua cache renderHash */
  force?: boolean;
}): Promise<VideoDraftRecord> {
  const script = await scriptStore.get(input.scriptId);
  if (!script) throw new Error("Script not found");
  const profile = script.profileId;

  const audios = await audioStore.byScript(input.scriptId);
  // GIỌNG C2 = "full" (read script = hook+body+cta) → KHỚP C1/C3 khi ghép/đồng bộ.
  const audio = input.audioId
    ? await audioStore.get(input.audioId)
    : audios.find((a) => a.part === "full") || audios.find((a) => a.part === "broll");

  const provider = await pickRenderProvider();
  // RENDER_MODE=mock → không gọi cả VPS (test pipeline thuần placeholder).
  const mode = !allowSelfHostRender()
    ? "mock"
    : provider?.name === "creatomate" ? "creatomate" : provider?.name === "hyperframes" ? "hyperframes" : "mock";

  const brollFootage = await footageStore.listByProfile(profile);
  const shotList = script.script.variantPrompts.broll.shotList || [];
  const usedFootage = shotList
    .map((shot) => brollFootage.find((f) => f.tag === shot.footageTag))
    .filter(Boolean);

  // BrandKit (Tầng 2): C2 ăn accent + grade qua `tokens` (composition cũ tự bỏ qua).
  const kit = mode === "hyperframes" ? await getOrCreateBrandKit(profile) : null;
  const tokensJson = kit ? JSON.stringify(kit.tokens) : "";
  // Nhạc nền (Phase 5): tìm TRƯỚC hash — có/không nhạc là 2 video khác nhau.
  const music = audios.find((a) => a.part === "music");

  // ── Cost-guard cache (Phase 3): trùng hash → trả video cũ (0 credit ảnh, 0 phút VPS). ──
  const renderHash = hashBrollRender(input.scriptId, audio?.id, music?.id, script.script, tokensJson, isLive());
  if (mode === "hyperframes" && !input.force) {
    const cached = (await videoStore.byScript(input.scriptId)).find(
      (v) => v.concept === "broll" && v.status === "done" && v.renderHash === renderHash && !!v.outputStoragePath
    );
    if (cached) return cached;
  }

  const draft = await videoStore.create({
    scriptId: input.scriptId,
    audioId: audio?.id,
    concept: "broll",
    mode,
    providerName: mode,
    renderHash: mode === "hyperframes" ? renderHash : undefined,
    status: "queued",
    progress: 0,
  });

  if (mode === "hyperframes") {
    try {
      const renderer = await getEngine("render");
      // Độ dài: ưu tiên độ dài voice-over thật để ảnh phủ hết lời nói.
      const duration =
        audio?.durationMs && audio.durationMs > 0
          ? Math.round(audio.durationMs / 1000)
          : script.script.estimatedDurationSec || 30;
      // B-roll CHUYÊN NGHIỆP: ẢNH AI sinh theo topic (GPT Image), style đồng nhất,
      // 9:16, KHÔNG chữ. Cost-guard RENDER_LIVE + cache + retry trong helper.
      // Không bật / thiếu provider → bgUrls rỗng → template dùng gradient (KHÔNG throw).
      const topic = script.topic || script.script.hook || "";
      // Nguồn CHỈ ĐẠO ẢNH = READ SCRIPT (hook+body+cta) → ảnh khớp ý từng đoạn lời.
      const captionSource =
        [script.script.hook, script.script.body, script.script.cta].filter(Boolean).join(" ").trim() ||
        script.script.variantPrompts.broll.voiceOver ||
        script.script.caption ||
        "";
      // C2 ACCURATE: entity/số THẬT cho director = sources (claim) + dataPoints (số minh hoạ).
      const factHint = [
        ...(script.script.sources || []).map((s) => s.claim),
        ...((script.script.variantPrompts.animation?.dataPoints || []) as string[]),
      ].filter(Boolean).join(" · ");
      // FIX A — C2 chỉ là NGUYÊN LIỆU HÌNH cho C4: KHÔNG caption/giọng nung vào C2 → KHỎI Whisper + mix nhạc
      // (caption do C4 overlay riêng, giọng = C1 master). allowVideo: path hyperframes nhận clip Pexels (C2_HYBRID).
      const imgResult = await generateBrollImages(input.scriptId, topic, captionSource, shotList, duration, factHint, { allowVideo: true });

      // FAIL-FAST: nếu CÓ ý định sinh ảnh (RENDER_LIVE + provider) nhưng ra 0 ảnh →
      // đây là LỖI người dùng cần biết, KHÔNG render câm ra video đen im lặng.
      if (imgResult.intended && imgResult.images.length === 0) {
        const why = imgResult.firstError || "không sinh được ảnh nào";
        return (await videoStore.update(draft.id, {
          status: "failed",
          error: `Sinh ảnh B-roll thất bại: ${why} (kiểm tra bucket broll-images + quyền gpt-image)`,
        }))!;
      }

      const bgUrls = imgResult.images.map((c) => c.url);
      const shotDurations = imgResult.images.map((c) => c.durationSec);
      // bg_types song song bg_urls: "image" (ảnh AI) | "video" (clip Pexels). Rỗng/cũ → service coi all "image".
      const bgTypes = imgResult.images.map((c) => c.type);
      const hasVideo = bgTypes.includes("video");

      // FIX A — C2 HÌNH SẠCH (nguyên liệu cutaway cho C4): KHÔNG nung caption-karaoke + giọng + title-card
      // (hook) + stat vào C2. Trước: caption nung-C2 + caption overlay-C4 = 2 lớp đè ("NAT8n"). Giờ C2 chỉ
      // ra HÌNH (b-roll + grade); C4 tự lo caption (overlay) + giọng (C1 master). → cutaway sạch, hết đè.
      const variables: Record<string, unknown> = {
        duration,
        bg_type: "image", // (legacy enum — composition đọc per-clip qua bg_types bên dưới)
        bg_urls: JSON.stringify(bgUrls),
        bg_types: JSON.stringify(bgTypes), // C2 HYBRID: loại mỗi nền (image|video) song song bg_urls
        shot_durations: JSON.stringify(shotDurations),
        voice_url: "",        // C2 không giọng (C4 dùng giọng C1 master)
        caption_groups: "[]", // C2 không caption nung (C4 overlay caption riêng)
        caption_lines: "[]",
        hook: "",             // C2 không title-card (chữ nung)
        stat: "",             // C2 không stat insert (chữ nung)
        accent_color: kit?.tokens.accent || "#e11d2a",
        tokens: tokensJson,
      };

      const job = await renderer.render({ templateId: "broll", variables });
      return (await videoStore.update(draft.id, {
        status: "rendering",
        progress: 10,
        providerJobId: job.jobId,
        providerName: bgUrls.length ? (hasVideo ? "hyperframes+gpt-image+pexels" : "hyperframes+gpt-image") : "hyperframes",
        costUsd: 0,
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
      await assertDailyCap(Number(process.env.CREATOMATE_COST_PER_RENDER_USD) || 0.3, "render Creatomate C2");
      const renderer = await getEngine("render");
      const templateId = (provider?.config?.brollTemplateId as string) || "";
      if (!templateId) throw new Error("Chưa cấu hình brollTemplateId trong provider Creatomate");

      const modifications: Record<string, unknown> = {
        voice_track: toAbsoluteUrl(audio?.storagePath),
        caption: script.script.caption,
      };

      // Cost-guard: chỉ sinh ảnh AI (PAID) khi RENDER_LIVE="1" VÀ có image provider.
      // Dùng CHUNG generateBrollImages (đạo diễn cảnh + cache + retry + upload) thay
      // vì lặp lại vòng sinh ảnh inline — 1 nguồn sự thật, hết trùng lặp.
      const imageProvider = await pickImageProvider();
      const topic = script.topic || script.script.hook || "";
      // Nguồn caption + chỉ đạo ảnh = READ SCRIPT (hook+body+cta) → ảnh/caption KHỚP giọng đọc
      // (giọng C2 giờ là "full"). Fallback voiceOver b-roll cũ nếu read script rỗng.
      const captionSource =
        [script.script.hook, script.script.body, script.script.cta].filter(Boolean).join(" ").trim() ||
        script.script.variantPrompts.broll.voiceOver ||
        script.script.caption ||
        "";
      const seconds = script.script.estimatedDurationSec || 30;
      const factHint = [
        ...(script.script.sources || []).map((s) => s.claim),
        ...((script.script.variantPrompts.animation?.dataPoints || []) as string[]),
      ].filter(Boolean).join(" · ");
      const imgResult = await generateBrollImages(input.scriptId, topic, captionSource, shotList, seconds, factHint);
      const useAI = imgResult.intended;

      if (useAI) {
        // Map ảnh đã sinh → các slot image_N của template Creatomate.
        imgResult.images.forEach((img, i) => {
          modifications[`image_${i + 1}`] = img.url;
        });
      } else {
        // Fallback: footage upload theo footageTag (giữ nguyên hành vi cũ).
        usedFootage.forEach((f, i) => {
          if (f) modifications[`shot_${i + 1}`] = toAbsoluteUrl(f.storagePath);
        });
      }

      const job = await renderer.render({ templateId, variables: modifications });
      return (await videoStore.update(draft.id, {
        status: "rendering",
        progress: 10,
        providerJobId: job.jobId,
        providerName: useAI ? `creatomate+${imageProvider!.name}` : "creatomate",
        costUsd: 0,
      }))!;
    } catch (e) {
      return (await videoStore.update(draft.id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      }))!;
    }
  }

  const seconds = script.script.estimatedDurationSec || 30;
  const buf = generatePlaceholderMp4(seconds, 60, 0xcd);
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

export async function pollBrollJob(draftId: string): Promise<VideoDraftRecord | undefined> {
  const draft = await videoStore.get(draftId);
  if (!draft || draft.status === "done" || draft.status === "failed") return draft;
  // Cứu draft KẸT: "queued" mà chưa có providerJobId nghĩa là request dựng render
  // (sinh ảnh/dispatch) đã bị kill (Vercel 60s). Quá 90s → đánh "failed" để UI cho
  // bấm "Thử lại", thay vì quay vô hạn. (Draft mới <90s vẫn để action chạy nốt.)
  if (draft.status === "queued" && !draft.providerJobId) {
    const ageMs = Date.now() - new Date(draft.updatedAt).getTime();
    if (ageMs > 90_000) {
      return await videoStore.update(draftId, {
        status: "failed",
        error: "Khởi tạo render quá lâu rồi bị ngắt (timeout). Bấm Thử lại.",
      });
    }
    return draft;
  }
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
