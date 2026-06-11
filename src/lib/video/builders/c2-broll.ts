import crypto from "node:crypto";
import { store } from "@/lib/integration-hub/storage";
import { decryptSecret } from "@/lib/integration-hub/vault";
import { getOrCreateBrandKit } from "@/lib/design/director";
import { mixVoiceWithMusic } from "@/lib/audio/mix-service";
import { hub } from "@/lib/integration-hub/hub";
import { footageStore } from "@/lib/footage/storage";
import { audioStore } from "@/lib/audio/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { blobUpload } from "@/lib/backend/blob-store";
import { kvRead, kvWrite } from "@/lib/backend/kv-store";
import { videoStore, type VideoDraftRecord } from "../storage";
import { getEngine } from "../engine";
import { isLive, allowSelfHostRender, assertDailyCap, recordPaidUsage, recordExtraUsage } from "../cost-guard";
import { withRetry, pickRenderProvider, toAbsoluteUrl, generatePlaceholderMp4 } from "./_shared";
import { RENDER_PIPELINE_VERSION } from "../render-version";

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
const BROLL_STYLE_SUFFIX =
  ". Professional cinematic photograph, vertical 9:16 composition, dramatic directional lighting, rich detail and texture, photorealistic, consistent moody cool-toned color grade, modern realistic Vietnamese setting, shallow depth of field, no readable text, no captions, no watermark, no logo, no UI labels.";

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
  images: { url: string; durationSec: number }[];
  /** Có ý định sinh ảnh không (RENDER_LIVE=1 + có provider). Phân biệt với chế độ gradient cố ý. */
  intended: boolean;
  /** Số ảnh lỗi + message lỗi đầu tiên — để buildBroll báo draft.error rõ ràng. */
  failed: number;
  firstError?: string;
};

async function generateBrollImages(
  scriptId: string,
  topic: string,
  voiceOver: string,
  shotList: { note: string; durationSec: number }[],
  totalDur: number
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
  const cache = await kvRead<Record<string, string>>(IMG_CACHE_KEY, {});
  const even = totalDur / count;

  // QUAN TRỌNG: sinh ảnh SONG SONG (Promise.all) thay vì tuần tự.
  // 5 ảnh GPT Image tuần tự (~20s/ảnh) > 60s → Vercel function timeout
  // ("An unexpected response..."). Song song → ~tổng ≈ thời gian 1 ảnh.
  type Shot = { idx: number; hash: string; url: string; fresh?: string; durationSec: number; error?: string };
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) => i).map(async (i): Promise<Shot | null> => {
      const prompt = `${prompts[i]}${BROLL_STYLE_SUFFIX}`;
      const h = hashImage(scriptId, i, prompt, model);
      let url = cache[h];
      let fresh: string | undefined;
      if (!url) {
        try {
          const img = await withRetry(() => imgAdapter.generate({ prompt }), 1);
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
          return { idx: i, hash: h, url: "", durationSec: 0, error: msg };
        }
      }
      const abs = toAbsoluteUrl(url);
      if (!abs) return { idx: i, hash: h, url: "", durationSec: 0, error: "URL ảnh rỗng sau upload" };
      return { idx: i, hash: h, url: abs, fresh, durationSec: Math.round(even * 100) / 100 };
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
    images: ok.sort((a, b) => a.idx - b.idx).map((r) => ({ url: r.url, durationSec: r.durationSec })),
    intended: true,
    failed: errors.length,
    firstError: errors[0]?.error,
  };
}

// ── Caption karaoke đồng bộ audio (OpenAI Whisper word-level) ─────────────────
type Word = { text: string; start: number; end: number };
type CaptionGroup = { start: number; end: number; words: Word[] };

/**
 * Lấy OpenAI API key từ image provider (openai-image) — tái dùng key đã cấu hình
 * cho GPT Image để gọi Whisper, không cần env riêng. null nếu provider khác/thiếu.
 */
async function getOpenAIKey(): Promise<string | null> {
  const p = await pickImageProvider();
  if (!p || p.name !== "openai-image") return null;
  const enc = await store.getCredential(p.id);
  if (!enc) return null;
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

/**
 * Transcribe voice-over qua OpenAI Whisper API (word-level timestamps). Trả mảng
 * Word sạch (bỏ token nhạc/rỗng). null nếu lỗi/thiếu key → caller fallback chia đều.
 * Chạy trong app (có sẵn audio bytes + key) → VPS không cần Whisper/Python nặng.
 */
async function transcribeWords(audioUrl: string, openaiKey: string): Promise<Word[] | null> {
  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) return null;
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "audio/mpeg" }), "voice.mp3");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${openaiKey}` },
      body: form,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { words?: { word: string; start: number; end: number }[] };
    if (!Array.isArray(data.words) || data.words.length === 0) return null;
    // Clean: bỏ token nhạc/rỗng (theo transcript-guide.md).
    const words: Word[] = data.words
      .map((w) => ({ text: String(w.word || "").trim(), start: Number(w.start) || 0, end: Number(w.end) || 0 }))
      .filter((w) => w.text && !/^[♪�♪-♯]+$/.test(w.text));
    return words.length ? words : null;
  } catch {
    return null;
  }
}

/**
 * Gom word → nhóm caption karaoke 3-5 từ/nhóm (conversational, theo captions.md).
 * Ngắt khi: hết câu (dấu .!?…), khoảng lặng >0.4s, hoặc đủ 5 từ. Mỗi nhóm có
 * start/end và word timing để template highlight từ đang đọc.
 */
function groupWords(words: Word[]): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) {
      groups.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
      cur = [];
    }
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const endsSentence = /[.!?…]$/.test(w.text);
    const next = words[i + 1];
    const gap = next ? next.start - w.end : 0;
    if (cur.length >= 5 || endsSentence || gap > 0.4) flush();
  }
  flush();
  return groups;
}

type CaptionLine = { text: string; start: number; dur: number; keyword?: string };

/**
 * Tách văn bản voice-over thành các dòng caption ngắn (~8 từ), phân bổ start/dur
 * theo tỉ lệ độ dài chữ trên tổng thời lượng. Dùng cho template HyperFrames broll.
 */
function buildCaptionLines(text: string, totalDur: number): CaptionLine[] {
  const clean = (text || "").trim();
  if (!clean) return [];
  const sentences = clean
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const sen of sentences) {
    const words = sen.split(/\s+/);
    if (words.length <= 10) chunks.push(sen);
    else for (let i = 0; i < words.length; i += 8) chunks.push(words.slice(i, i + 8).join(" "));
  }
  if (chunks.length === 0) return [];
  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1;
  let t = 0;
  return chunks.map((c) => {
    const dur = Math.max(1.2, (c.length / totalChars) * totalDur);
    const line: CaptionLine = { text: c, start: Math.round(t * 100) / 100, dur: Math.round(dur * 100) / 100 };
    t += dur;
    return line;
  });
}

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
      // voice_url / bg_urls PHẢI là URL công khai (service ở VPS tải qua mạng).
      let voiceUrl = toAbsoluteUrl(audio?.storagePath) || "";
      // Whisper transcribe trên VOICE GỐC (trước khi mix nhạc) — timing chuẩn hơn.
      const voiceUrlRaw = voiceUrl;
      // Nhạc nền MiniMax (Phase 5, tuỳ chọn): có track "music" → mix duck -18dB.
      if (voiceUrl && audio && music) {
        const musicUrl = toAbsoluteUrl(music.storagePath);
        if (musicUrl) {
          const mixed = await mixVoiceWithMusic({ id: audio.id, url: voiceUrl }, { id: music.id, url: musicUrl });
          if (mixed) voiceUrl = mixed;
        }
      }

      // B-roll CHUYÊN NGHIỆP: ẢNH AI sinh theo topic (GPT Image), style đồng nhất,
      // 9:16, KHÔNG chữ. Cost-guard RENDER_LIVE + cache + retry trong helper.
      // Không bật / thiếu provider → bgUrls rỗng → template dùng gradient (KHÔNG throw).
      const topic = script.topic || script.script.hook || "";
      // Nguồn caption + chỉ đạo ảnh = READ SCRIPT (hook+body+cta) → ảnh/caption KHỚP giọng đọc
      // (giọng C2 giờ là "full"). Fallback voiceOver b-roll cũ nếu read script rỗng.
      const captionSource =
        [script.script.hook, script.script.body, script.script.cta].filter(Boolean).join(" ").trim() ||
        script.script.variantPrompts.broll.voiceOver ||
        script.script.caption ||
        "";
      const openaiKey = await getOpenAIKey();

      // Chạy SONG SONG sinh ảnh AI + transcribe Whisper → tiết kiệm thời gian,
      // tránh vượt Vercel maxDuration 60s (nếu nối tiếp dễ timeout → "unexpected response").
      // Whisper = call OpenAI TRẢ PHÍ (nhỏ) → gate isLive (P0.3); dryrun rơi về
      // caption_lines chia đều (pipeline vẫn chạy).
      const [imgResult, words] = await Promise.all([
        generateBrollImages(input.scriptId, topic, captionSource, shotList, duration),
        isLive() && voiceUrlRaw && openaiKey ? transcribeWords(voiceUrlRaw, openaiKey) : Promise.resolve(null),
      ]);
      if (words) await recordExtraUsage("openai-whisper", ((duration || 60) / 60) * (Number(process.env.WHISPER_COST_PER_MIN_USD) || 0.006));

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

      // Caption karaoke ĐỒNG BỘ audio: Whisper word-level → nhóm 3-5 từ.
      // Lỗi/thiếu key → fallback caption_lines chia đều (bên dưới).
      const captionGroups: CaptionGroup[] = words ? groupWords(words) : [];

      // PHASE 3b — title-card (hook) + stat insert.
      // hook: luôn có → broll.html dựng title-card reveal đầu clip.
      // stat: CHỈ khi parse được SỐ THẬT từ dataPoints (anti-fabrication) → không thì null (không hiện insert).
      const hook = script.script.hook || "";
      const dataPoints = (script.script.variantPrompts.animation?.dataPoints || []) as string[];
      let stat: { label: string; value: string; unit: string } | null = null;
      for (const raw of dataPoints) {
        const str = String(raw || "").trim();
        const m = str.match(/(\d[\d.,]*)/);
        if (!m) continue;
        const value = m[1];
        const numIdx = m.index ?? 0;
        const colon = str.indexOf(":");
        const label = (colon >= 0 && colon < numIdx ? str.slice(0, colon) : str.slice(0, numIdx))
          .replace(/[:\-–—]\s*$/, "")
          .trim();
        const unit = str.slice(numIdx + value.length).replace(/^[\s:.\-–—]+/, "").trim();
        stat = { label: label.slice(0, 36), value, unit: unit.slice(0, 20) };
        break;
      }

      const variables: Record<string, unknown> = {
        duration,
        bg_type: "image", // ảnh AI + Ken Burns
        bg_urls: JSON.stringify(bgUrls),
        shot_durations: JSON.stringify(shotDurations),
        voice_url: voiceUrl,
        // caption_groups: karaoke sync (ưu tiên); caption_lines: fallback chia đều.
        caption_groups: JSON.stringify(captionGroups),
        caption_lines: JSON.stringify(buildCaptionLines(captionSource, duration)),
        accent_color: kit?.tokens.accent || "#e11d2a",
        tokens: tokensJson,
        hook, // title-card reveal đầu clip
        stat: JSON.stringify(stat), // stat insert (null nếu không có số thật)
      };

      const job = await renderer.render({ templateId: "broll", variables });
      return (await videoStore.update(draft.id, {
        status: "rendering",
        progress: 10,
        providerJobId: job.jobId,
        providerName: bgUrls.length ? "hyperframes+gpt-image" : "hyperframes",
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
      const imgResult = await generateBrollImages(input.scriptId, topic, captionSource, shotList, seconds);
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
