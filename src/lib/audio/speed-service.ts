import { store } from "@/lib/integration-hub/storage";
import { decryptSecret } from "@/lib/integration-hub/vault";

/**
 * Tăng tốc audio (giữ cao độ) qua endpoint /audio/speed của VPS HyperFrames.
 * factor ≤ 1 → trả null (no-op, caller giữ audio gốc).
 * Lỗi/thiếu cấu hình → throw (caller tự fallback về audio native 1.2).
 */
export async function speedUpAudioViaService(
  audioBase64: string,
  factor: number
): Promise<{ audioBase64: string; durationMs: number | null } | null> {
  if (factor <= 1.0001) return null;
  const hf = (await store.listProviders())
    .filter((p) => p.kind === "render" && p.name === "hyperframes" && p.enabled)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0];
  if (!hf) throw new Error("Cần cấu hình HyperFrames (render) để tăng tốc giọng > 1.2");
  const base = String(hf.config?.serviceUrl || "").replace(/\/+$/, "");
  if (!base) throw new Error("HyperFrames thiếu serviceUrl");
  const enc = await store.getCredential(hf.id);
  const token = enc ? decryptSecret(enc) : "";

  const res = await fetch(`${base}/audio/speed`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ audioBase64, factor }),
  });
  if (!res.ok) throw new Error(`/audio/speed ${res.status}: ${await res.text()}`);
  return (await res.json()) as { audioBase64: string; durationMs: number | null };
}
