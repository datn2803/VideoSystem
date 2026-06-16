import { store } from "./storage";
import { decryptSecret } from "./vault";
import type {
  LLMProvider,
  TTSProvider,
  AvatarProvider,
  RenderProvider,
  ImageProvider,
  ProviderKind,
  ProviderConfig,
} from "./types";
import { makeClaudeAdapter } from "./adapters/claude";
import { makeGeminiAdapter } from "./adapters/gemini";
import { makeDeepseekAdapter } from "./adapters/deepseek";
import { makeElevenLabsAdapter } from "./adapters/elevenlabs";
import { makeHeyGenAdapter } from "./adapters/heygen";
import { makeDIDAdapter } from "./adapters/d-id";
import { makeCreatomateAdapter } from "./adapters/creatomate";
import { makeHyperframesAdapter } from "./adapters/hyperframes";
import { makeGeminiImageAdapter } from "./adapters/gemini-image";
import { makeOpenAIImageAdapter } from "./adapters/openai-image";
import { makeMockLLM, makeMockTTS, makeMockAvatar, makeMockRender } from "./adapters/mock";

// Không có mock image (sinh ảnh là PAID) — stub để Test báo lỗi rõ khi thiếu key.
function makeStubImage(): ImageProvider {
  return {
    async generate() {
      throw new Error("Image provider chưa có API key");
    },
    async testConnection() {
      return { ok: false, error: "Chưa có API key", latencyMs: 0 };
    },
  };
}

async function getDefaultProvider(kind: ProviderKind): Promise<ProviderConfig | undefined> {
  const providers = (await store.listProviders()).filter((p) => p.kind === kind && p.enabled);
  return providers.find((p) => p.isDefault) || providers[0];
}

async function loadSecret(p: ProviderConfig): Promise<string | undefined> {
  const enc = await store.getCredential(p.id);
  if (!enc) return undefined;
  try {
    return decryptSecret(enc);
  } catch {
    return undefined;
  }
}

async function buildLLM(p: ProviderConfig): Promise<LLMProvider> {
  const apiKey = await loadSecret(p);
  if (!apiKey) return makeMockLLM();
  const model = (p.config?.model as string) || undefined;
  if (p.name === "claude") return makeClaudeAdapter({ apiKey, model });
  if (p.name === "gemini") return makeGeminiAdapter({ apiKey, model });
  if (p.name === "deepseek") return makeDeepseekAdapter({ apiKey, model });
  return makeMockLLM();
}

function numOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function boolOrUndef(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  return v === "true" || v === "1" || v === "on";
}

async function buildTTS(p: ProviderConfig): Promise<TTSProvider> {
  const apiKey = await loadSecret(p);
  if (!apiKey) return makeMockTTS();
  if (p.name === "elevenlabs")
    return makeElevenLabsAdapter({
      apiKey,
      voiceId: p.config?.voiceId as string,
      modelId: p.config?.modelId as string,
      languageCode: p.config?.languageCode as string,
      stability: numOrUndef(p.config?.stability),
      similarityBoost: numOrUndef(p.config?.similarityBoost),
      style: numOrUndef(p.config?.style),
      useSpeakerBoost: boolOrUndef(p.config?.useSpeakerBoost),
      speed: numOrUndef(p.config?.speed),
    });
  return makeMockTTS();
}

async function buildAvatar(p: ProviderConfig): Promise<AvatarProvider> {
  const apiKey = await loadSecret(p);
  if (!apiKey) return makeMockAvatar();
  if (p.name === "heygen") return makeHeyGenAdapter({ apiKey, avatarId: p.config?.avatarId as string });
  if (p.name === "d-id") return makeDIDAdapter({ apiKey });
  return makeMockAvatar();
}

async function buildRender(p: ProviderConfig): Promise<RenderProvider> {
  const apiKey = await loadSecret(p);
  if (p.name === "hyperframes") {
    // KHÁC provider khác: serviceUrl từ config, token từ credential.
    return makeHyperframesAdapter({ serviceUrl: (p.config?.serviceUrl as string) || "", apiKey: apiKey || "" });
  }
  if (!apiKey) return makeMockRender();
  if (p.name === "creatomate")
    return makeCreatomateAdapter({
      apiKey,
      brollTemplateId: p.config?.brollTemplateId as string,
      animationTemplateId: p.config?.animationTemplateId as string,
    });
  return makeMockRender();
}

async function buildImage(p: ProviderConfig): Promise<ImageProvider> {
  const apiKey = await loadSecret(p);
  if (!apiKey) return makeStubImage();
  if (p.name === "gemini-image") return makeGeminiImageAdapter({ apiKey, modelId: p.config?.modelId as string });
  if (p.name === "openai-image")
    return makeOpenAIImageAdapter({
      apiKey,
      modelId: p.config?.modelId as string,
      size: p.config?.size as string,
      quality: p.config?.quality as string, // mặc định "low" trong adapter (nhanh, hợp ảnh nền)
    });
  return makeStubImage();
}

export const hub = {
  async llm(): Promise<LLMProvider> {
    const p = await getDefaultProvider("llm");
    return p ? await buildLLM(p) : makeMockLLM();
  },
  /** Model "pro" cho khâu QUYẾT ĐỊNH chất lượng (Script Writer + Fact Researcher) — B2.
   *  Lấy từ config Integration Hub (provider llm, key `writerModel`); KHÔNG set → mặc định
   *  Gemini 3.1 Pro. Việc nhẹ (strategist/auditor/sanitize) vẫn dùng model mặc định `config.model`
   *  (vd gemini-3.5-flash). Override per-call qua llm.complete({ model }). */
  async llmWriterModel(): Promise<string> {
    const p = await getDefaultProvider("llm");
    const m = (p?.config?.writerModel as string | undefined)?.trim();
    return m || "gemini-3.1-pro-preview";
  },
  async tts(): Promise<TTSProvider> {
    const p = await getDefaultProvider("tts");
    return p ? await buildTTS(p) : makeMockTTS();
  },
  async avatar(): Promise<AvatarProvider> {
    const p = await getDefaultProvider("avatar");
    return p ? await buildAvatar(p) : makeMockAvatar();
  },
  async render(): Promise<RenderProvider> {
    const p = await getDefaultProvider("render");
    return p ? await buildRender(p) : makeMockRender();
  },
  async image(): Promise<ImageProvider | null> {
    const p = await getDefaultProvider("image");
    return p ? await buildImage(p) : null;
  },
  async testConnection(id: string): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const p = await store.getProvider(id);
    if (!p) return { ok: false, error: "Provider not found" };
    try {
      const builders: Record<string, ((p: ProviderConfig) => Promise<{ testConnection: () => Promise<{ ok: boolean; latencyMs?: number; error?: string }> }>) | undefined> = {
        llm: buildLLM,
        tts: buildTTS,
        avatar: buildAvatar,
        render: buildRender,
        image: buildImage,
      };
      const builder = builders[p.kind];
      if (!builder) return { ok: true };
      const adapter = await builder(p);
      return await adapter.testConnection();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
  async status(): Promise<{ byKind: Record<string, ProviderConfig | undefined>; defaultsConfigured: number; total: number }> {
    const kinds: ProviderKind[] = ["llm", "tts", "avatar", "render"];
    const entries = await Promise.all(kinds.map(async (k) => [k, await getDefaultProvider(k)] as const));
    const byKind = Object.fromEntries(entries) as Record<string, ProviderConfig | undefined>;
    const total = (await store.listProviders()).length;
    const defaultsConfigured = kinds.filter((k) => byKind[k]).length;
    return { byKind, defaultsConfigured, total };
  },
};
