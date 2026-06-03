import type { AvatarProvider, JobResult, JobStatus } from "../types";

export function makeDIDAdapter(opts: { apiKey: string }): AvatarProvider {
  // D-ID Studio key có dạng thô "username:password". Basic auth cần base64(username:password).
  // - Nếu đã có tiền tố "Basic " → dùng nguyên.
  // - Nếu chứa ":" → coi là key thô, tự base64-encode.
  // - Ngược lại → coi như đã là base64, chỉ thêm tiền tố.
  const auth = (() => {
    const k = opts.apiKey.trim();
    if (k.startsWith("Basic ")) return k;
    const token = k.includes(":") ? Buffer.from(k).toString("base64") : k;
    return `Basic ${token}`;
  })();
  return {
    async renderTalking({ audioUrl, text, avatarId, aspectRatio: _aspectRatio }): Promise<JobResult> {
      const body = {
        source_url: avatarId, // D-ID expects image URL for presenter
        script: audioUrl
          ? { type: "audio", audio_url: audioUrl }
          : { type: "text", input: text || "", provider: { type: "microsoft", voice_id: "vi-VN-NamMinhNeural" } },
        config: {
          stitch: true,
          result_format: "mp4",
        },
      };
      const res = await fetch("https://api.d-id.com/talks", {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`D-ID error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { id: string };
      return { jobId: data.id };
    },
    async poll(jobId): Promise<JobStatus> {
      const res = await fetch(`https://api.d-id.com/talks/${jobId}`, { headers: { authorization: auth } });
      if (!res.ok) return { status: "failed", error: `HTTP ${res.status}` };
      const data = (await res.json()) as { status: string; result_url?: string; error?: string };
      const map: Record<string, JobStatus["status"]> = {
        created: "queued",
        started: "rendering",
        done: "done",
        error: "failed",
      };
      return { status: map[data.status] || "queued", outputUrl: data.result_url, error: data.error };
    },
    async listAvatars() {
      return [];
    },
    async testConnection() {
      const t0 = Date.now();
      try {
        const res = await fetch("https://api.d-id.com/credits", { headers: { authorization: auth } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
      }
    },
  };
}
