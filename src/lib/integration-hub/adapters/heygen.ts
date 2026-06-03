import type { AvatarProvider, JobResult, JobStatus } from "../types";

export function makeHeyGenAdapter(opts: { apiKey: string; avatarId?: string }): AvatarProvider {
  return {
    async renderTalking({ audioUrl, text, avatarId, aspectRatio }): Promise<JobResult> {
      const dims = aspectRatio === "9:16" ? { width: 720, height: 1280 } : aspectRatio === "1:1" ? { width: 720, height: 720 } : { width: 1280, height: 720 };
      const voice = audioUrl
        ? { type: "audio" as const, audio_url: audioUrl }
        : { type: "text" as const, input_text: text || "", voice_id: "1bd001e7e50f421d891986aad5158bc8" };
      const body = {
        video_inputs: [
          {
            character: { type: "avatar", avatar_id: avatarId || opts.avatarId || "Daisy-inskirt-20220818", scale: 1 },
            voice,
          },
        ],
        dimension: dims,
      };
      const res = await fetch("https://api.heygen.com/v2/video/generate", {
        method: "POST",
        headers: { "X-Api-Key": opts.apiKey, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HeyGen error ${res.status}: ${t}`);
      }
      const data = (await res.json()) as { data: { video_id: string } };
      return { jobId: data.data.video_id };
    },
    async poll(jobId: string): Promise<JobStatus> {
      const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${jobId}`, {
        headers: { "X-Api-Key": opts.apiKey },
      });
      if (!res.ok) return { status: "failed", error: `HTTP ${res.status}` };
      const data = (await res.json()) as {
        data: { status: string; video_url?: string; error?: { detail?: string } };
      };
      const map: Record<string, JobStatus["status"]> = {
        pending: "queued",
        processing: "rendering",
        completed: "done",
        failed: "failed",
      };
      return {
        status: map[data.data.status] || "queued",
        outputUrl: data.data.video_url,
        error: data.data.error?.detail,
      };
    },
    async listAvatars() {
      const res = await fetch("https://api.heygen.com/v2/avatars", {
        headers: { "X-Api-Key": opts.apiKey },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data: { avatars: { avatar_id: string; avatar_name: string; gender?: string; preview_image_url?: string }[] } };
      return data.data.avatars.slice(0, 50).map((a) => ({
        id: a.avatar_id,
        name: a.avatar_name,
        gender: a.gender,
        previewUrl: a.preview_image_url,
      }));
    },
    async testConnection() {
      const t0 = Date.now();
      try {
        const res = await fetch("https://api.heygen.com/v2/user/remaining_quota", {
          headers: { "X-Api-Key": opts.apiKey },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
      }
    },
  };
}
