export type ProviderKind = "llm" | "tts" | "avatar" | "render" | "publish" | "storage";

export type ProviderName =
  | "claude"
  | "gemini"
  | "openai"
  | "deepseek"
  | "elevenlabs"
  | "fpt-tts"
  | "heygen"
  | "d-id"
  | "creatomate"
  | "mock";

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  name: ProviderName;
  label: string;
  enabled: boolean;
  isDefault: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  rotatedAt?: string;
}

export interface ProviderUsage {
  providerId: string;
  date: string;
  unitsUsed: number;
  costEstimateUsd: number;
  requestCount: number;
}

export interface ProviderHealth {
  providerId: string;
  checkedAt: string;
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

// ─── Adapter result types ───
export interface LLMResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  raw?: unknown;
}

export interface TTSResult {
  audioBase64: string;
  mimeType: string;
  durationMs: number;
  costUsd: number;
}

export interface JobResult {
  jobId: string;
}

export interface JobStatus {
  status: "queued" | "rendering" | "done" | "failed";
  outputUrl?: string;
  error?: string;
  progress?: number;
}

// ─── Adapter interfaces ───
export interface LLMProvider {
  complete(input: {
    system?: string;
    messages: { role: "user" | "assistant"; content: string }[];
    model?: string;
    maxTokens?: number;
    responseFormat?: "text" | "json";
  }): Promise<LLMResult>;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
}

export interface TTSProvider {
  synthesize(input: { text: string; voiceId?: string; lang?: string }): Promise<TTSResult>;
  listVoices(): Promise<{ id: string; name: string; lang: string; gender?: string }[]>;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
}

export interface AvatarProvider {
  renderTalking(input: {
    audioBase64?: string;
    audioUrl?: string;
    text?: string;
    avatarId: string;
    aspectRatio: "9:16" | "16:9" | "1:1";
  }): Promise<JobResult>;
  poll(jobId: string): Promise<JobStatus>;
  listAvatars(): Promise<{ id: string; name: string; gender?: string; previewUrl?: string }[]>;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
}

export interface RenderProvider {
  render(input: {
    templateId: string;
    modifications: Record<string, unknown>;
  }): Promise<JobResult>;
  poll(jobId: string): Promise<JobStatus>;
  listTemplates(): Promise<{ id: string; name: string; thumbnail?: string }[]>;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
}

export type AnyProvider = LLMProvider | TTSProvider | AvatarProvider | RenderProvider;

export interface ProviderMeta {
  name: ProviderName;
  kind: ProviderKind;
  label: string;
  homepage: string;
  authType: "api_key" | "oauth";
  fields: { key: string; label: string; type: "text" | "password" | "select"; required: boolean; placeholder?: string; options?: { value: string; label: string }[] }[];
  defaultConfig?: Record<string, unknown>;
}
