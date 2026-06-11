/**
 * Mix nhạc nền vào voice (Phase 5) — gọi VPS /audio/mix (ffmpeg duck -18dB).
 * Cùng pattern speed-service. Có CACHE KV theo (voiceId, musicId) → build lại
 * không mix lại + URL mixed ổn định → renderHash ổn định (cache render sống).
 */
import { store } from "@/lib/integration-hub/storage";
import { decryptSecret } from "@/lib/integration-hub/vault";
import { blobUpload } from "@/lib/backend/blob-store";
import { kvRead, kvWrite } from "@/lib/backend/kv-store";

const MIX_CACHE_KEY = "voice-music-mix-cache"; // "voiceId::musicId" → public URL

async function hyperframesBase(): Promise<{ base: string; token: string } | null> {
  const hf = (await store.listProviders())
    .filter((p) => p.kind === "render" && p.name === "hyperframes" && p.enabled)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0];
  if (!hf) return null;
  const base = String(hf.config?.serviceUrl || "").replace(/\/+$/, "");
  if (!base) return null;
  const enc = await store.getCredential(hf.id);
  return { base, token: enc ? decryptSecret(enc) : "" };
}

/**
 * Trộn voiceUrl + musicUrl → upload bản mixed → trả PUBLIC URL.
 * Best-effort: lỗi bất kỳ → null (caller dùng voice gốc, KHÔNG fail render).
 */
export async function mixVoiceWithMusic(
  voice: { id: string; url: string },
  music: { id: string; url: string }
): Promise<string | null> {
  try {
    const cacheKey = `${voice.id}::${music.id}`;
    const cache = await kvRead<Record<string, string>>(MIX_CACHE_KEY, {});
    if (cache[cacheKey]) return cache[cacheKey];

    const svc = await hyperframesBase();
    if (!svc) return null;
    const [vRes, mRes] = await Promise.all([fetch(voice.url), fetch(music.url)]);
    if (!vRes.ok || !mRes.ok) return null;
    const [vBuf, mBuf] = await Promise.all([vRes.arrayBuffer(), mRes.arrayBuffer()]);

    const res = await fetch(`${svc.base}/audio/mix`, {
      method: "POST",
      headers: { authorization: `Bearer ${svc.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        voiceBase64: Buffer.from(vBuf).toString("base64"),
        musicBase64: Buffer.from(mBuf).toString("base64"),
        duckDb: Number(process.env.MUSIC_DUCK_DB) || -18,
      }),
    });
    if (!res.ok) {
      console.error("[mix] /audio/mix", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const d = (await res.json()) as { audioBase64?: string };
    if (!d.audioBase64) return null;
    const url = await blobUpload({
      bucket: "audio",
      filename: `mixed-${voice.id.slice(0, 8)}-${music.id.slice(0, 8)}.mp3`,
      buffer: Buffer.from(d.audioBase64, "base64"),
      contentType: "audio/mpeg",
    });
    cache[cacheKey] = url;
    await kvWrite(MIX_CACHE_KEY, cache);
    return url;
  } catch (e) {
    console.error("[mix] lỗi (dùng voice gốc):", e instanceof Error ? e.message : e);
    return null;
  }
}
