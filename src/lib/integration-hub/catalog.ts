import type { ProviderMeta } from "./types";

export const PROVIDER_CATALOG: ProviderMeta[] = [
  // ── LLM ──
  {
    name: "claude",
    kind: "llm",
    label: "Claude (Anthropic)",
    homepage: "https://console.anthropic.com",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "sk-ant-..." },
      {
        key: "model",
        label: "Model",
        type: "select",
        required: false,
        options: [
          { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (đề xuất)" },
          { value: "claude-opus-4-7", label: "Claude Opus 4.7 (mạnh, đắt)" },
          { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (rẻ, nhanh)" },
        ],
      },
    ],
    defaultConfig: { model: "claude-sonnet-4-6" },
  },
  {
    name: "gemini",
    kind: "llm",
    label: "Google Gemini",
    homepage: "https://aistudio.google.com/apikey",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "AIza..." },
      {
        key: "model",
        label: "Model",
        type: "select",
        required: false,
        options: [
          { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (free, đề xuất)" },
          { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (free, nhanh nhất)" },
          { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (free, nhanh)" },
          { value: "gemini-2.0-flash-thinking-exp", label: "Gemini 2.0 Flash Thinking" },
          { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
        ],
      },
    ],
    defaultConfig: { model: "gemini-2.5-flash" },
  },
  {
    name: "deepseek",
    kind: "llm",
    label: "DeepSeek",
    homepage: "https://platform.deepseek.com",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "sk-..." },
      {
        key: "model",
        label: "Model",
        type: "select",
        required: false,
        options: [
          { value: "deepseek-chat", label: "DeepSeek Chat (đề xuất, rẻ ~$0.27/1M in)" },
          { value: "deepseek-reasoner", label: "DeepSeek Reasoner (R1, suy luận sâu)" },
        ],
      },
    ],
    defaultConfig: { model: "deepseek-chat" },
  },

  // ── TTS ──
  {
    name: "elevenlabs",
    kind: "tts",
    label: "ElevenLabs",
    homepage: "https://elevenlabs.io/app/settings/api-keys",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "sk_..." },
      { key: "voiceId", label: "Voice ID (dùng voice NGƯỜI VIỆT từ Voice Library)", type: "text", required: false, placeholder: "vd: voice_id giọng Việt bản địa" },
      {
        key: "modelId",
        label: "Model",
        type: "select",
        required: false,
        options: [
          { value: "eleven_turbo_v2_5", label: "Turbo v2.5 — hỗ trợ tiếng Việt (ĐỀ XUẤT)" },
          { value: "eleven_flash_v2_5", label: "Flash v2.5 — hỗ trợ VN, nhanh & rẻ nhất" },
          { value: "eleven_v3", label: "Eleven v3 — biểu cảm nhất (không ép language_code)" },
          { value: "eleven_multilingual_v2", label: "Multilingual v2 — KHÔNG hỗ trợ tiếng Việt" },
        ],
      },
      { key: "languageCode", label: "Mã ngôn ngữ (ISO 639-1, vi = tiếng Việt)", type: "text", required: false, placeholder: "vi" },
      { key: "stability", label: "Stability (0–1, cao = ổn định thanh điệu)", type: "number", required: false, placeholder: "0.5" },
      { key: "similarityBoost", label: "Similarity boost (0–1)", type: "number", required: false, placeholder: "0.85" },
      { key: "style", label: "Style (0–1, cao dễ méo dấu thanh tiếng Việt)", type: "number", required: false, placeholder: "0.0" },
      { key: "useSpeakerBoost", label: "Speaker boost", type: "toggle", required: false, placeholder: "Tăng độ giống giọng gốc" },
    ],
    defaultConfig: {
      modelId: "eleven_turbo_v2_5",
      languageCode: "vi",
      stability: 0.5,
      similarityBoost: 0.85,
      style: 0.0,
      useSpeakerBoost: true,
    },
  },
  {
    name: "fpt-tts",
    kind: "tts",
    label: "FPT.AI TTS (Vietnamese)",
    homepage: "https://fpt.ai/vi/text-to-speech",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      {
        key: "voiceId",
        label: "Giọng",
        type: "select",
        required: false,
        options: [
          { value: "banmai", label: "Ban Mai (nữ Bắc)" },
          { value: "leminh", label: "Lê Minh (nam Bắc)" },
          { value: "minhquang", label: "Minh Quang (nam trung)" },
          { value: "thuminh", label: "Thu Minh (nữ Bắc)" },
          { value: "linhsan", label: "Linh San (nữ Nam)" },
        ],
      },
    ],
    defaultConfig: { voiceId: "leminh" },
  },

  // ── Avatar ──
  {
    name: "heygen",
    kind: "avatar",
    label: "HeyGen",
    homepage: "https://app.heygen.com/settings?nav=API",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "avatarId", label: "Default Avatar ID", type: "text", required: false, placeholder: "Daisy-inskirt-20220818" },
    ],
  },
  {
    name: "d-id",
    kind: "avatar",
    label: "D-ID",
    homepage: "https://studio.d-id.com",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "Basic ..." },
      { key: "avatarId", label: "Ảnh presenter (URL công khai)", type: "text", required: false, placeholder: "https://.../face.jpg" },
    ],
  },

  // ── Render ──
  {
    name: "creatomate",
    kind: "render",
    label: "Creatomate",
    homepage: "https://creatomate.com/dashboard/api",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "brollTemplateId", label: "B-roll Template ID", type: "text", required: false },
      { key: "animationTemplateId", label: "Animation Template ID", type: "text", required: false },
    ],
  },
];

export function getProviderMeta(name: string): ProviderMeta | undefined {
  return PROVIDER_CATALOG.find((p) => p.name === name);
}

export function catalogByKind(kind: string): ProviderMeta[] {
  return PROVIDER_CATALOG.filter((p) => p.kind === kind);
}
