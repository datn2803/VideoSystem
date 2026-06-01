import crypto from "node:crypto";
import { store } from "@/lib/integration-hub/storage";
import { decryptSecret } from "@/lib/integration-hub/vault";
import { hub } from "@/lib/integration-hub/hub";
import { footageStore } from "@/lib/footage/storage";
import { audioStore } from "@/lib/audio/storage";
import { scriptStore } from "@/lib/scripts/storage";
import { blobUpload } from "@/lib/backend/blob-store";
import { kvRead, kvWrite } from "@/lib/backend/kv-store";
import { videoStore, type VideoDraftRecord } from "../storage";

async function pickRenderProvider() {
  const providers = (await store.listProviders()).filter((p) => p.kind === "render" && p.enabled);
  return providers.find((p) => p.isDefault) || providers[0];
}

async function pickImageProvider() {
  const providers = (await store.listProviders()).filter((p) => p.kind === "image" && p.enabled);
  return providers.find((p) => p.isDefault) || providers[0];
}

// Ảnh AI là PAID → chỉ sinh tối đa MAX_IMAGES shot + hậu tố style cố định cho đồng nhất.
const MAX_IMAGES = 5;
const STYLE_SUFFIX =
  ". Vertical 9:16 cinematic photo, high detail, realistic, Vietnamese context, natural lighting, no text, no watermark.";
const IMG_CACHE_KEY = "broll-image-cache"; // hash -> public URL (tránh re-render đốt tiền)

function hashImage(scriptId: string, idx: number, prompt: string, model: string): string {
  return crypto.createHash("sha256").update(`${scriptId}::${idx}::${prompt}::${model}`).digest("hex");
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  return ".jpg";
}

const MOCK_MP4_HEADER = Buffer.from([
  0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
]);

function generatePlaceholderMp4(seconds: number, kindByte = 0xcd): Buffer {
  const payload = Buffer.alloc(Math.round(60 * 1024 * Math.max(1, seconds)), kindByte);
  return Buffer.concat([MOCK_MP4_HEADER, payload]);
}

function toAbsoluteUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${process.env.PUBLIC_APP_URL || ""}${path}`;
}

// ── B-roll ảnh AI theo topic (GPT Image) ──────────────────────────────────────
// Hậu tố style cố định cho MỌI shot → bộ ảnh đồng nhất, không lộn xộn, KHÔNG chữ.
const BROLL_STYLE_SUFFIX =
  ". Cinematic vertical 9:16 editorial photo, consistent cool color grade, modern, Vietnamese context, soft natural light, shallow depth of field, NO text, NO watermark, no logo.";

/**
 * 1 call LLM (Gemini free): topic + mô tả cảnh tiếng Việt → mỗi shot 1 prompt ảnh
 * TIẾNG ANH cụ thể, hợp chủ đề (cảnh/vật/bối cảnh minh hoạ), KHÔNG chữ trong ảnh.
 * Fallback: dùng "topic, note" nếu LLM lỗi/parse fail.
 */
async function shotsToImagePrompts(topic: string, notes: string[]): Promise<string[]> {
  const clean = notes.map((n) => (n || "").trim()).filter(Boolean);
  if (clean.length === 0) return [];
  try {
    const llm = await hub.llm();
    const list = clean.map((n, i) => `${i + 1}. ${n}`).join("\n");
    const res = await llm.complete({
      system:
        "Bạn viết prompt ảnh cho stock/AI image. Cho CHỦ ĐỀ và danh sách mô tả cảnh (tiếng Việt), trả JSON mảng prompt TIẾNG ANH — mỗi prompt mô tả 1 cảnh/vật/bối cảnh CỤ THỂ minh hoạ ý đó, hợp chủ đề, KHÔNG có chữ/text trong ảnh. CHỈ trả JSON mảng string, KHÔNG giải thích.",
      messages: [
        { role: "user", content: `CHỦ ĐỀ: ${topic}\n\nCÁC CẢNH:\n${list}\n\nTrả JSON mảng ${clean.length} prompt tiếng Anh, đúng thứ tự.` },
      ],
      maxTokens: 600,
      responseFormat: "json",
    });
    const txt = res.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const arr = JSON.parse(txt.match(/\[[\s\S]*\]/)?.[0] ?? txt) as unknown[];
    return clean.map((note, i) => {
      const p = arr[i];
      return typeof p === "string" && p.trim() ? p.trim() : `${topic}, ${note}`;
    });
  } catch {
    return clean.map((note) => `${topic}, ${note}`); // fallback
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
async function generateBrollImages(
  scriptId: string,
  topic: string,
  shotList: { note: string; durationSec: number }[],
  totalDur: number
): Promise<{ url: string; durationSec: number }[]> {
  const imageProvider = await pickImageProvider();
  const useAI = process.env.RENDER_LIVE === "1" && !!imageProvider;
  if (!useAI) return []; // không bật RENDER_LIVE / thiếu provider → gradient fallback

  const imgAdapter = await hub.image();
  if (!imgAdapter) return [];
  const model = (imageProvider!.config?.modelId as string) || "";
  const shots = shotList.slice(0, MAX_IMAGES).filter((s) => (s.note || "").trim());
  if (shots.length === 0) return [];

  const prompts = await shotsToImagePrompts(topic, shots.map((s) => s.note));
  const cache = await kvRead<Record<string, string>>(IMG_CACHE_KEY, {});
  const even = totalDur / shots.length;

  // QUAN TRỌNG: sinh ảnh SONG SONG (Promise.all) thay vì tuần tự.
  // 5 ảnh GPT Image tuần tự (~20s/ảnh) > 60s → Vercel function timeout
  // ("An unexpected response..."). Song song → ~tổng ≈ thời gian 1 ảnh.
  type Shot = { idx: number; hash: string; url: string; fresh?: string; durationSec: number };
  const results = await Promise.all(
    shots.map(async (shot, i): Promise<Shot | null> => {
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
        } catch {
          return null; // 1 ảnh lỗi → bỏ shot đó, không fail cả video
        }
      }
      const abs = toAbsoluteUrl(url);
      if (!abs) return null;
      const d = shot.durationSec && shot.durationSec > 0 ? shot.durationSec : even;
      return { idx: i, hash: h, url: abs, fresh, durationSec: Math.round(d * 100) / 100 };
    })
  );

  // Ghi cache 1 lần sau khi tất cả ảnh xong (an toàn, không race).
  let cacheDirty = false;
  for (const r of results) {
    if (r?.fresh) {
      cache[r.hash] = r.fresh;
      cacheDirty = true;
    }
  }
  if (cacheDirty) await kvWrite(IMG_CACHE_KEY, cache);

  return results
    .filter((r): r is Shot => r != null)
    .sort((a, b) => a.idx - b.idx)
    .map((r) => ({ url: r.url, durationSec: r.durationSec }));
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

export async function buildBroll(input: {
  scriptId: string;
  audioId?: string;
}): Promise<VideoDraftRecord> {
  const script = await scriptStore.get(input.scriptId);
  if (!script) throw new Error("Script not found");
  const profile = script.profileId;

  const audios = await audioStore.byScript(input.scriptId);
  const audio = input.audioId
    ? await audioStore.get(input.audioId)
    : audios.find((a) => a.part === "broll") || audios.find((a) => a.part === "full");

  const provider = await pickRenderProvider();
  const mode =
    provider?.name === "creatomate" ? "creatomate" : provider?.name === "hyperframes" ? "hyperframes" : "mock";

  const brollFootage = await footageStore.listByProfile(profile);
  const shotList = script.script.variantPrompts.broll.shotList || [];
  const usedFootage = shotList
    .map((shot) => brollFootage.find((f) => f.tag === shot.footageTag))
    .filter(Boolean);

  const draft = await videoStore.create({
    scriptId: input.scriptId,
    audioId: audio?.id,
    concept: "broll",
    mode,
    providerName: mode,
    status: "queued",
    progress: 0,
  });

  if (mode === "hyperframes") {
    try {
      const renderer = await hub.render();
      // Độ dài: ưu tiên độ dài voice-over thật để ảnh phủ hết lời nói.
      const duration =
        audio?.durationMs && audio.durationMs > 0
          ? Math.round(audio.durationMs / 1000)
          : script.script.estimatedDurationSec || 30;
      // voice_url / bg_urls PHẢI là URL công khai (service ở VPS tải qua mạng).
      const voiceUrl = toAbsoluteUrl(audio?.storagePath) || "";

      // B-roll CHUYÊN NGHIỆP: ẢNH AI sinh theo topic (GPT Image), style đồng nhất,
      // 9:16, KHÔNG chữ. Cost-guard RENDER_LIVE + cache + retry trong helper.
      // Không bật / thiếu provider → bgUrls rỗng → template dùng gradient (KHÔNG throw).
      const topic = script.topic || script.script.hook || "";
      const captionSource = script.script.variantPrompts.broll.voiceOver || script.script.caption || "";
      const openaiKey = await getOpenAIKey();

      // Chạy SONG SONG sinh ảnh AI + transcribe Whisper → tiết kiệm thời gian,
      // tránh vượt Vercel maxDuration 60s (nếu nối tiếp dễ timeout → "unexpected response").
      const [imgs, words] = await Promise.all([
        generateBrollImages(input.scriptId, topic, shotList, duration),
        voiceUrl && openaiKey ? transcribeWords(voiceUrl, openaiKey) : Promise.resolve(null),
      ]);
      const bgUrls = imgs.map((c) => c.url);
      const shotDurations = imgs.map((c) => c.durationSec);

      // Caption karaoke ĐỒNG BỘ audio: Whisper word-level → nhóm 3-5 từ.
      // Lỗi/thiếu key → fallback caption_lines chia đều (bên dưới).
      const captionGroups: CaptionGroup[] = words ? groupWords(words) : [];

      const variables: Record<string, unknown> = {
        duration,
        bg_type: "image", // ảnh AI + Ken Burns
        bg_urls: JSON.stringify(bgUrls),
        shot_durations: JSON.stringify(shotDurations),
        voice_url: voiceUrl,
        // caption_groups: karaoke sync (ưu tiên); caption_lines: fallback chia đều.
        caption_groups: JSON.stringify(captionGroups),
        caption_lines: JSON.stringify(buildCaptionLines(captionSource, duration)),
        accent_color: "#e11d2a",
      };

      const job = await renderer.render({ templateId: "broll", modifications: variables });
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
      const renderer = await hub.render();
      const templateId = (provider?.config?.brollTemplateId as string) || "";
      if (!templateId) throw new Error("Chưa cấu hình brollTemplateId trong provider Creatomate");

      const modifications: Record<string, unknown> = {
        voice_track: toAbsoluteUrl(audio?.storagePath),
        caption: script.script.caption,
      };

      // Cost-guard: chỉ sinh ảnh AI (PAID) khi RENDER_LIVE="1" VÀ có image provider.
      const imageProvider = await pickImageProvider();
      const useAI = process.env.RENDER_LIVE === "1" && !!imageProvider;
      let imageCost = 0;

      if (useAI) {
        const imgAdapter = await hub.image();
        if (!imgAdapter) throw new Error("Không khởi tạo được image provider");
        const model = (imageProvider!.config?.modelId as string) || "";
        const cache = await kvRead<Record<string, string>>(IMG_CACHE_KEY, {});
        let cacheDirty = false;

        const shots = shotList.slice(0, MAX_IMAGES);
        for (let i = 0; i < shots.length; i++) {
          const note = shots[i].note?.trim();
          if (!note) continue;
          const prompt = `${note}${STYLE_SUFFIX}`;
          const h = hashImage(input.scriptId, i, prompt, model);
          let url = cache[h];
          if (!url) {
            // sinh thật + retry 1 lần; chỉ chạy khi chưa có trong cache
            const img = await withRetry(() => imgAdapter.generate({ prompt }), 1);
            url = await blobUpload({
              bucket: "broll-images",
              filename: `${input.scriptId}-${i}-${h.slice(0, 8)}${extFromMime(img.mimeType)}`,
              buffer: Buffer.from(img.imageBase64, "base64"),
              contentType: img.mimeType,
            });
            cache[h] = url;
            cacheDirty = true;
            imageCost += img.costUsd;
          }
          modifications[`image_${i + 1}`] = toAbsoluteUrl(url);
        }
        if (cacheDirty) await kvWrite(IMG_CACHE_KEY, cache);
      } else {
        // Fallback: footage upload theo footageTag (giữ nguyên hành vi cũ).
        usedFootage.forEach((f, i) => {
          if (f) modifications[`shot_${i + 1}`] = toAbsoluteUrl(f.storagePath);
        });
      }

      const job = await renderer.render({ templateId, modifications });
      return (await videoStore.update(draft.id, {
        status: "rendering",
        progress: 10,
        providerJobId: job.jobId,
        providerName: useAI ? `creatomate+${imageProvider!.name}` : "creatomate",
        costUsd: imageCost,
      }))!;
    } catch (e) {
      return (await videoStore.update(draft.id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      }))!;
    }
  }

  const seconds = script.script.estimatedDurationSec || 30;
  const buf = generatePlaceholderMp4(seconds, 0xcd);
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
