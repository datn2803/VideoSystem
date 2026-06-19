export type ProviderKind = "llm" | "tts" | "avatar" | "render" | "image" | "publish" | "storage";

export type ProviderName =
  | "claude"
  | "gemini"
  | "openai"
  | "deepseek"
  | "elevenlabs"
  | "heygen"
  | "d-id"
  | "creatomate"
  | "hyperframes"
  | "gemini-image"
  | "openai-image"
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
  // Nguồn trích dẫn khi gọi grounded (Google Search). Chỉ Gemini grounded mới set.
  citations?: { title: string; url: string }[];
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
    // grounded=true → bật Google Search grounding (chỉ Gemini hỗ trợ). Trả TEXT + citations.
    // ⚠ Gemini 2.5: grounding KHÔNG đi chung responseMimeType JSON → grounded sẽ bỏ qua responseFormat=json.
    grounded?: boolean;
  }): Promise<LLMResult>;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
}

export interface TTSProvider {
  // speed: hệ số chuẩn hoá tốc độ đọc (1.0 = chuẩn, 1.1 = nhanh hơn ~10%). Clamp [0.7, 1.2].
  synthesize(input: { text: string; voiceId?: string; lang?: string; speed?: number }): Promise<TTSResult>;
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
  /** C4 AUTO-EDITOR (additive, optional): ghép C1 nền + cutaway b-roll C2 qua endpoint /compose
   *  của render-service. Provider không hỗ trợ (mock/creatomate) → undefined → caller fallback. */
  compose?(input: {
    c1Url: string;
    c2Url: string;
    cutawaySegments: { start: number; dur: number }[];
    durationSec?: number;
    /** PHASE 2: lớp chữ chạy suốt — caption karaoke (Whisper groups) + keyword IN HOA + màu nhấn. */
    captionGroups?: { start: number; end: number; words: { text: string; start: number; end: number }[] }[];
    keywords?: { text: string; start: number; dur: number }[];
    accentColor?: string;
  }): Promise<JobResult>;
}

export interface ImageResult {
  imageBase64: string;
  mimeType: string;
  costUsd: number;
}

export interface ImageProvider {
  generate(input: { prompt: string; transparent?: boolean; quality?: string }): Promise<ImageResult>;
  /** Sinh ảnh DÙNG 1 ảnh tham chiếu (vd logo brand thật) qua /v1/images/edits — C2 ACCURATE.
   *  Optional (additive): adapter cũ không có → caller fallback generate() thường. */
  generateFromReference?(input: { prompt: string; referencePng: Buffer; referenceMime?: string; quality?: string }): Promise<ImageResult>;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
}

export interface ProviderMeta {
  name: ProviderName;
  kind: ProviderKind;
  label: string;
  homepage: string;
  authType: "api_key" | "oauth";
  fields: { key: string; label: string; type: "text" | "password" | "select" | "number" | "toggle"; required: boolean; placeholder?: string; options?: { value: string; label: string }[] }[];
  defaultConfig?: Record<string, unknown>;
}
