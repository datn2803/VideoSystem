/**
 * Whisper word-level transcription + alignment cho C3 animation (đồng bộ cảnh với giọng đọc).
 *
 * Chạy TRONG APP (Vercel): có sẵn audio bytes + key OpenAI, và Vercel gọi được api.openai.com
 * (VPS bị Cloudflare chặn IP datacenter → KHÔNG transcribe trên VPS).
 *
 * LƯU Ý: C2 (c2-broll.ts) có bản copy riêng các hàm này — CỐ Ý không refactor C2 để tránh đổi
 * hành vi C2. File này CHỈ phục vụ C3.
 */
import { store } from "@/lib/integration-hub/storage";
import { decryptSecret } from "@/lib/integration-hub/vault";

export type Word = { text: string; start: number; end: number };

async function pickImageProvider() {
  const providers = (await store.listProviders()).filter((p) => p.kind === "image" && p.enabled);
  return providers.find((p) => p.isDefault) || providers[0];
}

/** Key OpenAI từ provider image "openai-image" (tái dùng cho Whisper). null nếu thiếu. */
export async function getOpenAIKey(): Promise<string | null> {
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

/** Whisper word-level timestamps. null nếu lỗi/thiếu key → caller fallback chia đều. */
export async function transcribeWords(audioUrl: string, openaiKey: string): Promise<Word[] | null> {
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
    const words: Word[] = data.words
      .map((w) => ({ text: String(w.word || "").trim(), start: Number(w.start) || 0, end: Number(w.end) || 0 }))
      .filter((w) => w.text && !/^[♪�♪-♯]+$/.test(w.text));
    return words.length ? words : null;
  } catch {
    return null;
  }
}

/**
 * Căn N cảnh (theo thứ tự) vào dòng thời gian → [{start,dur}], lấp kín [0,total].
 * `weights` = trọng số mỗi cảnh (vd số chữ on-screen) → cảnh nội dung nhiều giữ lâu hơn.
 *
 * - Có `words` (Whisper): ranh giới cảnh snap vào timestamp THẬT của từ tại vị trí tỉ lệ
 *   tích luỹ trọng số → cảnh đổi gần đúng lúc giọng đọc sang ý kế. (Giả định: thứ tự cảnh =
 *   thứ tự nội dung giọng đọc — đúng với hook→điểm→cta.)
 * - Không có `words`: chia theo TỈ LỆ trọng số trên `total` (vẫn tốt hơn chia đều cứng).
 */
export function alignByWeights(
  weights: number[],
  words: Word[] | null,
  total: number
): { start: number; dur: number }[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [{ start: 0, dur: Math.max(0.5, total) }];

  const w = weights.map((x) => Math.max(1, x || 1));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const frac = [0];
  let acc = 0;
  for (const x of w) {
    acc += x;
    frac.push(acc / sum);
  }

  const B: number[] = new Array(n + 1);
  if (words && words.length >= 2) {
    const M = words.length;
    for (let k = 0; k <= n; k++) {
      if (k === 0) B[k] = 0;
      else if (k === n) B[k] = total;
      else {
        const wi = Math.min(M - 1, Math.max(0, Math.round(frac[k] * M)));
        B[k] = words[wi].start;
      }
    }
  } else {
    for (let k = 0; k <= n; k++) B[k] = frac[k] * total;
    B[0] = 0;
    B[n] = total;
  }

  const MIN = 1.2; // mỗi cảnh tối thiểu ~1.2s (đủ đọc)
  for (let k = 1; k <= n; k++) if (B[k] < B[k - 1] + MIN) B[k] = B[k - 1] + MIN;
  if (B[n] > total) {
    const scale = total / B[n];
    for (let k = 0; k <= n; k++) B[k] *= scale;
  }
  B[n] = total;

  const out: { start: number; dur: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ start: +B[i].toFixed(3), dur: +Math.max(0.3, B[i + 1] - B[i]).toFixed(3) });
  }
  return out;
}
