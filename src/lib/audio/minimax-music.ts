/**
 * Nhạc nền MiniMax (Phase 5) — sinh nhạc instrumental theo mood chủ đề.
 *
 * Pattern gọi API PORT từ nexu-io/html-video packages/core/src/minimax.ts
 * (Apache-2.0 — THIRD_PARTY.md): POST Bearer → check base_resp.status_code
 * (HTTP 200 vẫn có thể fail logic) → decode hex → MP3 bytes. Model music-1.5
 * (2.6 sync không trả về — đã verify upstream); 1.5 BẮT BUỘC lyrics → nhạc
 * không lời dùng placeholder humming.
 *
 * Key: env MINIMAX_API_KEY (+ MINIMAX_BASE_URL nếu region China api.minimaxi.com).
 * GATE: caller phải qua cost-guard (isLive + assertDailyCap) TRƯỚC khi gọi.
 */

const DEFAULT_BASE = "https://api.minimax.io/v1";
const MUSIC_MODEL = "music-1.5";
const TIMEOUT_MS = 120_000;

export function minimaxCreds(): { apiKey: string; baseUrl: string } | null {
  const apiKey = (process.env.MINIMAX_API_KEY || "").trim();
  if (!apiKey) return null;
  const baseUrl = (process.env.MINIMAX_BASE_URL || DEFAULT_BASE).trim().replace(/\/$/, "");
  return { apiKey, baseUrl };
}

/** Sinh nhạc nền instrumental. Trả MP3 bytes. Throw message rõ khi lỗi. */
export async function generateMusic(prompt: string): Promise<Buffer> {
  const creds = minimaxCreds();
  if (!creds) throw new Error("Chưa cấu hình MINIMAX_API_KEY (env Vercel) — nhạc nền cần key MiniMax");
  const p = prompt.trim();
  if (!p) throw new Error("Prompt nhạc rỗng");

  const body = {
    model: MUSIC_MODEL,
    prompt: p,
    // music-1.5 bắt buộc lyrics; instrumental → humming placeholder (theo upstream)
    lyrics: "[Intro]\nooh ooh\n[Hook]\nla la la",
    audio_setting: { sample_rate: 44100, bitrate: 256000, format: "mp3" },
    output_format: "hex",
  };

  let res: Response;
  try {
    res = await fetch(`${creds.baseUrl}/music_generation`, {
      method: "POST",
      headers: { authorization: `Bearer ${creds.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new Error(
      isTimeout
        ? `MiniMax music timeout sau ${TIMEOUT_MS / 1000}s — thử lại / kiểm tra region (quốc tế api.minimax.io, TQ api.minimaxi.com)`
        : `MiniMax music request lỗi: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`MiniMax music ${res.status}: ${text.slice(0, 240)}`);

  let data: { base_resp?: { status_code?: number; status_msg?: string }; data?: { audio?: unknown } };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`MiniMax music trả non-JSON: ${text.slice(0, 200)}`);
  }
  if (data.base_resp && data.base_resp.status_code !== 0) {
    const code = data.base_resp.status_code;
    const hint = code === 1004 || code === 1008 ? " (key sai / hết số dư)" : "";
    throw new Error(`MiniMax music lỗi API ${code}: ${data.base_resp.status_msg || "unknown"}${hint}`);
  }
  const hex = data.data?.audio;
  if (typeof hex !== "string" || !hex) throw new Error("MiniMax music: response thiếu data.audio");
  const bytes = Buffer.from(hex, "hex");
  if (bytes.length === 0) throw new Error("MiniMax music: decode 0 byte");
  return bytes;
}

/** Prompt nhạc theo chủ đề + tone (instrumental, hợp video ngắn tài chính/giáo dục). */
export function musicPromptFor(topic: string, tone?: string): string {
  return (
    `Instrumental background music for a short vertical explainer video about "${topic}". ` +
    `Mood: ${tone || "confident, modern, professional"}, light electronic + soft percussion, ` +
    `steady mid-tempo, NO vocals in the foreground, loopable, suitable as bed under Vietnamese voice-over.`
  );
}
