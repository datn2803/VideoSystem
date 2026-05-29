import type { RenderProvider, JobResult, JobStatus } from "../types";

export function makeCreatomateAdapter(opts: {
  apiKey: string;
  brollTemplateId?: string;
  animationTemplateId?: string;
}): RenderProvider {
  return {
    async render({ templateId, modifications }): Promise<JobResult> {
      const res = await fetch("https://api.creatomate.com/v1/renders", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ template_id: templateId, modifications }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Creatomate error ${res.status}: ${t}`);
      }
      const data = (await res.json()) as Array<{ id: string }>;
      return { jobId: Array.isArray(data) ? data[0].id : (data as any).id };
    },
    async poll(jobId: string): Promise<JobStatus> {
      const res = await fetch(`https://api.creatomate.com/v1/renders/${jobId}`, {
        headers: { authorization: `Bearer ${opts.apiKey}` },
      });
      if (!res.ok) return { status: "failed", error: `HTTP ${res.status}` };
      const data = (await res.json()) as { status: string; url?: string; error_message?: string };
      const map: Record<string, JobStatus["status"]> = {
        planned: "queued",
        waiting: "queued",
        transcribing: "rendering",
        rendering: "rendering",
        succeeded: "done",
        failed: "failed",
      };
      return { status: map[data.status] || "queued", outputUrl: data.url, error: data.error_message };
    },
    async listTemplates() {
      const res = await fetch("https://api.creatomate.com/v1/templates", {
        headers: { authorization: `Bearer ${opts.apiKey}` },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { id: string; name: string; preview_image_url?: string }[];
      return data.map((t) => ({ id: t.id, name: t.name, thumbnail: t.preview_image_url }));
    },
    async testConnection() {
      const t0 = Date.now();
      try {
        const res = await fetch("https://api.creatomate.com/v1/templates?limit=1", {
          headers: { authorization: `Bearer ${opts.apiKey}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
      }
    },
  };
}
