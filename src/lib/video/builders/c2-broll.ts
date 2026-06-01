import crypto from "node:crypto";
import { store } from "@/lib/integration-hub/storage";
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

// ── Pexels stock footage (free, hotlinkable) ──────────────────────────────────
const MAX_SHOTS = 5; // cap số shot → số clip Pexels (giới hạn thời gian render)

/**
 * 1 call LLM: danh sách mô tả cảnh tiếng Việt → mảng từ khoá TIẾNG ANH để search
 * stock footage. Fallback: dùng chính note nếu LLM lỗi/parse fail.
 */
async function shotNotesToQueries(notes: string[]): Promise<string[]> {
  const clean = notes.map((n) => (n || "").trim()).filter(Boolean);
  if (clean.length === 0) return [];
  try {
    const llm = await hub.llm();
    const list = clean.map((n, i) => `${i + 1}. ${n}`).join("\n");
    const res = await llm.complete({
      system:
        "Bạn giúp tìm stock footage. Cho danh sách mô tả cảnh (tiếng Việt), trả JSON mảng từ khoá TIẾNG ANH để tìm video minh hoạ, mỗi phần tử 1-3 từ, cụ thể, hợp video. CHỈ trả JSON mảng string, KHÔNG giải thích.",
      messages: [{ role: "user", content: `${list}\n\nTrả về JSON mảng ${clean.length} từ khoá tiếng Anh, đúng thứ tự.` }],
      maxTokens: 400,
      responseFormat: "json",
    });
    const txt = res.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const arr = JSON.parse(txt.match(/\[[\s\S]*\]/)?.[0] ?? txt) as unknown[];
    const queries = clean.map((note, i) => {
      const kw = arr[i];
      return typeof kw === "string" && kw.trim() ? kw.trim() : note;
    });
    return queries;
  } catch {
    return clean; // fallback: note làm query
  }
}

/**
 * Tìm 1 video Pexels DỌC (portrait) cho 1 từ khoá. Trả link hotlink ~1080p hoặc
 * gần nhất. null nếu không có key / không ra clip dọc (→ bỏ shot, không bịa).
 */
async function pexelsPortraitVideo(query: string, apiKey: string): Promise<string | null> {
  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=3&size=medium`;
    const res = await fetch(url, { headers: { authorization: apiKey } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      videos?: { video_files?: { link: string; width: number; height: number; quality?: string }[] }[];
    };
    for (const video of data.videos || []) {
      const portrait = (video.video_files || []).filter((f) => f.width && f.height && f.width < f.height);
      if (portrait.length === 0) continue;
      // chọn file có height gần 1920 nhất (≈1080p dọc)
      portrait.sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
      return portrait[0].link;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * shotList → clips Pexels [{ url, durationSec }]. Phân bổ durationSec theo shot
 * (hoặc chia đều totalDur). Bỏ shot không tìm được clip (không chèn clip lạc đề).
 * Thiếu PEXELS_API_KEY → trả [] (template tự dùng gradient).
 */
async function fetchPexelsClips(
  shotList: { note: string; durationSec: number }[],
  totalDur: number
): Promise<{ url: string; durationSec: number }[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return []; // không có key → fallback gradient (KHÔNG throw)
  const shots = shotList.slice(0, MAX_SHOTS);
  if (shots.length === 0) return [];

  const queries = await shotNotesToQueries(shots.map((s) => s.note));
  const found = await Promise.all(queries.map((q) => pexelsPortraitVideo(q, apiKey)));

  // Giữ shot tìm được clip; phân bổ lại thời lượng đều trên các clip hợp lệ.
  const valid = shots.map((s, i) => ({ shot: s, url: found[i] })).filter((x) => x.url);
  if (valid.length === 0) return [];
  const even = totalDur / valid.length;
  return valid.map((x) => ({
    url: x.url as string,
    durationSec: Math.round((x.shot.durationSec && x.shot.durationSec > 0 ? x.shot.durationSec : even) * 100) / 100,
  }));
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
      // Độ dài: ưu tiên độ dài voice-over thật để footage phủ hết lời nói.
      const duration =
        audio?.durationMs && audio.durationMs > 0
          ? Math.round(audio.durationMs / 1000)
          : script.script.estimatedDurationSec || 30;
      // voice_url / bg_urls PHẢI là URL công khai (service ở VPS tải qua mạng).
      const voiceUrl = toAbsoluteUrl(audio?.storagePath) || "";

      // B-roll THẬT: footage stock Pexels khớp từng shot (free, hotlink được).
      // shotList note (VN) → từ khoá EN (1 call LLM) → Pexels video dọc → clips.
      // Thiếu PEXELS_API_KEY hoặc không ra clip → bgUrls rỗng → template dùng gradient.
      const clips = await fetchPexelsClips(shotList, duration);
      const bgUrls = clips.map((c) => c.url);
      const shotDurations = clips.map((c) => c.durationSec);
      const bgType: "image" | "video" = bgUrls.length ? "video" : "image";

      const captionSource = script.script.variantPrompts.broll.voiceOver || script.script.caption || "";
      const variables: Record<string, unknown> = {
        duration,
        bg_type: bgType,
        bg_urls: JSON.stringify(bgUrls),
        shot_durations: JSON.stringify(shotDurations),
        voice_url: voiceUrl,
        caption_lines: JSON.stringify(buildCaptionLines(captionSource, duration)),
        accent_color: "#e11d2a",
      };

      const job = await renderer.render({ templateId: "broll", modifications: variables });
      return (await videoStore.update(draft.id, {
        status: "rendering",
        progress: 10,
        providerJobId: job.jobId,
        providerName: bgUrls.length ? "hyperframes+pexels" : "hyperframes",
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
