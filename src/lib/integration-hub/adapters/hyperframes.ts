import type { RenderProvider, JobResult, JobStatus } from "../types";

/**
 * HyperFrames render service (self-host trên VPS) — implements RenderProvider.
 *
 * KHÁC các provider khác: serviceUrl lấy từ config (provider.config.serviceUrl),
 * token Bearer lấy từ credential (apiKey). Service chạy ASYNC:
 *   render() → POST /render → 202 { jobId }
 *   poll(jobId) → GET /jobs/:jobId → { status, url?, error? }
 *
 * templateId = "animation" | "broll"; modifications = object biến template
 * (khớp data-composition-variables trong compositions/<template>.html).
 */
export function makeHyperframesAdapter(opts: { serviceUrl: string; apiKey: string }): RenderProvider {
  const base = (opts.serviceUrl || "").replace(/\/+$/, "");
  const headers = { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" };

  return {
    async render({ templateId, modifications }): Promise<JobResult> {
      if (!base) throw new Error("HyperFrames: thiếu Service URL (config.serviceUrl)");
      const res = await fetch(`${base}/render`, {
        method: "POST",
        headers,
        body: JSON.stringify({ template: templateId, variables: modifications, quality: "standard" }),
      });
      if (!res.ok) throw new Error(`HyperFrames render ${res.status}: ${await res.text()}`);
      const d = (await res.json()) as { jobId?: string };
      if (!d.jobId) throw new Error("HyperFrames render: response thiếu jobId");
      return { jobId: d.jobId };
    },

    async poll(jobId: string): Promise<JobStatus> {
      if (!base) return { status: "failed", error: "HyperFrames: thiếu Service URL" };
      const res = await fetch(`${base}/jobs/${jobId}`, { headers });
      if (!res.ok) return { status: "failed", error: `HTTP ${res.status}` };
      const d = (await res.json()) as { status?: string; url?: string; error?: string };
      const status: JobStatus["status"] =
        d.status === "done" ? "done" : d.status === "failed" ? "failed" : "rendering";
      return { status, outputUrl: d.url, error: d.error };
    },

    // C4 AUTO-EDITOR: POST /compose → 202 { jobId }; poll dùng CHUNG /jobs/:jobId ở trên.
    async compose({ c1Url, c2Url, cutawaySegments, durationSec, captionGroups, keywords, accentColor }): Promise<JobResult> {
      if (!base) throw new Error("HyperFrames: thiếu Service URL (config.serviceUrl)");
      const res = await fetch(`${base}/compose`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          c1_url: c1Url,
          c2_url: c2Url,
          cutaway_segments: cutawaySegments,
          duration: durationSec,
          caption_groups: captionGroups, // PHASE 2: lớp chữ karaoke + keyword IN HOA chạy suốt
          keywords,
          accent_color: accentColor,
        }),
      });
      if (!res.ok) throw new Error(`HyperFrames compose ${res.status}: ${await res.text()}`);
      const d = (await res.json()) as { jobId?: string };
      if (!d.jobId) throw new Error("HyperFrames compose: response thiếu jobId");
      return { jobId: d.jobId };
    },

    async listTemplates() {
      return [
        { id: "animation", name: "Animation (motion graphics)" },
        { id: "broll", name: "B-roll" },
      ];
    },

    async testConnection() {
      const t0 = Date.now();
      try {
        if (!base) throw new Error("Thiếu Service URL");
        const r = await fetch(`${base}/health`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
      }
    },
  };
}
