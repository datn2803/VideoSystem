/**
 * EngineAdapter (Phase 3) — MỘT interface render cho mọi engine, soi theo
 * RFC-01 của nexu-io/html-video (EngineAdapter.render/poll — xem THIRD_PARTY.md).
 *
 * Bọc CẢ 2 đường hiện có sau cùng 1 hợp đồng:
 *  - "hyperframes"/"creatomate" (RenderProvider: C2 b-roll + C3 animation)
 *  - "avatar" (AvatarProvider renderTalking: C1 talking head)
 * → builder/orchestrator/studio chỉ biết EngineAdapter; đổi/thêm engine
 *   (Remotion, Lambda…) = thêm 1 entry registry, không đụng phần khác.
 *
 * variables là hợp đồng RIÊNG của từng engine (như inputs.schema của template
 * manifest): avatar đọc {avatarId, audioUrl, text, aspectRatio}; render đọc
 * bộ biến composition.
 */
import { hub } from "@/lib/integration-hub/hub";

export type EngineJob = { jobId: string };
export type EngineStatus = {
  status: "queued" | "rendering" | "done" | "failed";
  outputUrl?: string;
  error?: string;
};

export type EngineRenderInput = {
  /** id template/composition với engine render; với avatar = nhãn tự do */
  templateId: string;
  variables: Record<string, unknown>;
};

export interface EngineAdapter {
  /** id engine trong registry ("render" | "avatar") + tên provider thật khi resolve */
  id: string;
  render(input: EngineRenderInput): Promise<EngineJob>;
  poll(jobId: string): Promise<EngineStatus>;
}

/** Engine render composition (HyperFrames VPS / Creatomate) — bọc hub.render(). */
async function makeRenderEngine(): Promise<EngineAdapter> {
  const provider = await hub.render();
  return {
    id: "render",
    async render(input) {
      return provider.render({ templateId: input.templateId, modifications: input.variables });
    },
    async poll(jobId) {
      const s = await provider.poll(jobId);
      return { status: s.status === "done" ? "done" : s.status === "failed" ? "failed" : "rendering", outputUrl: s.outputUrl, error: s.error };
    },
  };
}

/** Engine avatar (HeyGen/D-ID) — bọc hub.avatar().renderTalking sau cùng interface. */
async function makeAvatarEngine(): Promise<EngineAdapter> {
  const provider = await hub.avatar();
  return {
    id: "avatar",
    async render(input) {
      const v = input.variables;
      return provider.renderTalking({
        avatarId: String(v.avatarId || ""),
        aspectRatio: (v.aspectRatio as "9:16" | "16:9") || "9:16",
        audioUrl: v.audioUrl ? String(v.audioUrl) : undefined,
        text: v.text ? String(v.text) : undefined,
      });
    },
    async poll(jobId) {
      const s = await provider.poll(jobId);
      return {
        status: s.status === "done" ? "done" : s.status === "failed" ? "failed" : s.status === "rendering" ? "rendering" : "queued",
        outputUrl: s.outputUrl,
        error: s.error,
      };
    },
  };
}

const REGISTRY: Record<string, () => Promise<EngineAdapter>> = {
  render: makeRenderEngine,
  avatar: makeAvatarEngine,
};

/** Lấy engine theo id registry. C1 → "avatar"; C2/C3 → "render". */
export async function getEngine(id: "render" | "avatar"): Promise<EngineAdapter> {
  const make = REGISTRY[id];
  if (!make) throw new Error(`Engine không tồn tại: ${id}`);
  return make();
}
