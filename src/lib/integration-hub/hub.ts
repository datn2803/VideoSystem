import { store } from "./storage";
import { decryptSecret } from "./vault";
import type {
  LLMProvider,
  TTSProvider,
  AvatarProvider,
  RenderProvider,
  ProviderKind,
  ProviderConfig,
} from "./types";
import { makeClaudeAdapter } from "./adapters/claude";
import { makeGeminiAdapter } from "./adapters/gemini";
import { makeDeepseekAdapter } from "./adapters/deepseek";
import { makeElevenLabsAdapter } from "./adapters/elevenlabs";
import { makeFptTtsAdapter } from "./adapters/fpt-tts";
import { makeHeyGenAdapter } from "./adapters/heygen";
import { makeDIDAdapter } from "./adapters/d-id";
import { makeCreatomateAdapter } from "./adapters/creatomate";
import { makeMockLLM, makeMockTTS, makeMockAvatar, makeMockRender } from "./adapters/mock";

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

async function buildTTS(p: ProviderConfig): Promise<TTSProvider> {
  const apiKey = await loadSecret(p);
  if (!apiKey) return makeMockTTS();
  if (p.name === "elevenlabs")
    return makeElevenLabsAdapter({ apiKey, voiceId: p.config?.voiceId as string, modelId: p.config?.modelId as string });
  if (p.name === "fpt-tts") return makeFptTtsAdapter({ apiKey, voiceId: p.config?.voiceId as string });
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
  if (!apiKey) return makeMockRender();
  if (p.name === "creatomate")
    return makeCreatomateAdapter({
      apiKey,
      brollTemplateId: p.config?.brollTemplateId as string,
      animationTemplateId: p.config?.animationTemplateId as string,
    });
  return makeMockRender();
}

export const hub = {
  async llm(): Promise<LLMProvider> {
    const p = await getDefaultProvider("llm");
    return p ? await buildLLM(p) : makeMockLLM();
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
  async testConnection(id: string): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const p = await store.getProvider(id);
    if (!p) return { ok: false, error: "Provider not found" };
    try {
      const builders: Record<string, ((p: ProviderConfig) => Promise<{ testConnection: () => Promise<{ ok: boolean; latencyMs?: number; error?: string }> }>) | undefined> = {
        llm: buildLLM,
        tts: buildTTS,
        avatar: buildAvatar,
        render: buildRender,
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
