import type { ProviderMeta } from "./types";

// Danh sách model Gemini (dùng chung cho dropdown `model` việc-nhẹ + `writerModel` khâu-viết).
// 3.x ở trên (đề xuất); 2.x/1.5 giữ để không vỡ config cũ. Giá /1M token (in/out).
const GEMINI_MODELS = [
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (mạnh nhất, viết tốt — $2/$12)" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash (nhanh + thông minh — $1.5/$9)" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (rẻ nhất — $0.25/$1.5)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (free, cũ)" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (free)" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (free)" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro (cũ)" },
];

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
        label: "Model (việc nhẹ: chiến lược/biên tập/sanitize)",
        type: "select",
        required: false,
        options: GEMINI_MODELS,
      },
      {
        key: "writerModel",
        label: "Writer model (khâu VIẾT + nghiên cứu — để trống = Gemini 3.5 Flash, GA ổn định; chọn 3.1 Pro nếu cần mạnh hơn, có retry+fallback)",
        type: "select",
        required: false,
        options: GEMINI_MODELS,
      },
    ],
    defaultConfig: { model: "gemini-3.5-flash", writerModel: "gemini-3.5-flash" },
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
      { key: "speed", label: "Tốc độ đọc mặc định (0.7–2.0 · ≤1.2 native ElevenLabs · >1.2 tăng tốc qua VPS)", type: "number", required: false, placeholder: "1.5" },
      { key: "useSpeakerBoost", label: "Speaker boost", type: "toggle", required: false, placeholder: "Tăng độ giống giọng gốc" },
    ],
    defaultConfig: {
      modelId: "eleven_turbo_v2_5",
      languageCode: "vi",
      stability: 0.5,
      similarityBoost: 0.85,
      style: 0.0,
      speed: 1.5,
      useSpeakerBoost: true,
    },
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
  {
    name: "hyperframes",
    kind: "render",
    label: "HyperFrames (VPS self-host)",
    homepage: "https://github.com/heygen-com/hyperframes",
    authType: "api_key",
    fields: [
      { key: "serviceUrl", label: "Service URL (vd http://<vps-ip>:8080)", type: "text", required: true, placeholder: "http://<vps-ip>:8080" },
      { key: "apiKey", label: "Render token (Bearer)", type: "password", required: true },
    ],
    defaultConfig: {},
  },

  // ── Image (sinh ảnh AI cho C2 b-roll) ──
  {
    name: "gemini-image",
    kind: "image",
    label: "Gemini Image (Nano Banana)",
    homepage: "https://aistudio.google.com/apikey",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key (có thể dùng chung key Gemini)", type: "password", required: true, placeholder: "AIza..." },
      {
        key: "modelId",
        label: "Model",
        type: "select",
        required: false,
        options: [{ value: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image (Nano Banana)" }],
      },
    ],
    defaultConfig: { modelId: "gemini-2.5-flash-image" },
  },
  {
    name: "openai-image",
    kind: "image",
    label: "OpenAI GPT Image",
    homepage: "https://platform.openai.com/api-keys",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "sk-..." },
      {
        key: "modelId",
        label: "Model",
        type: "select",
        required: false,
        options: [
          { value: "gpt-image-1", label: "GPT Image 1 (ổn định · hỗ trợ nền trong)" },
          { value: "gpt-image-2", label: "GPT Image 2 (mới nhất · KHÔNG nền trong)" },
          { value: "gpt-image-1-mini", label: "GPT Image 1 Mini (rẻ nhất · KHÔNG nền trong)" },
        ],
      },
      {
        key: "size",
        label: "Kích thước",
        type: "select",
        required: false,
        options: [
          { value: "1024x1536", label: "Dọc 1024x1536 (9:16, đề xuất)" },
          { value: "1024x1024", label: "Vuông 1024x1024" },
        ],
      },
    ],
    defaultConfig: { modelId: "gpt-image-1", size: "1024x1536" },
  },
];

export function getProviderMeta(name: string): ProviderMeta | undefined {
  return PROVIDER_CATALOG.find((p) => p.name === name);
}
