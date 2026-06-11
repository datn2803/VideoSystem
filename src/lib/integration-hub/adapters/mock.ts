import type { LLMProvider, TTSProvider, AvatarProvider, RenderProvider } from "../types";

/**
 * Mock LLM that produces realistic-looking JSON outputs based on prompt intent.
 * Detection heuristics: keywords in prompt → return matching mock structure.
 */
function detectIntent(prompt: string): "planner" | "scripter" | "auditor" | "sample" | "generic" {
  const p = prompt.toLowerCase();
  if (p.includes("compliance officer") || p.includes("kiểm duyệt")) return "auditor";
  if (p.includes("variantprompts") || (p.includes("hook") && p.includes("shotlist"))) return "scripter";
  if (p.includes("đề xuất") && p.includes("chủ đề")) return "planner";
  if (p.includes("[hook 5s]") || p.includes("script ngắn")) return "sample";
  return "generic";
}

const MOCK_PLAN = [
  {
    topic: "5 sai lầm khi gửi tiết kiệm năm 2026",
    hook: "80% người Việt đang mất tiền vì 1 sai lầm này",
    target_persona: "Người đi làm 28-40 tuổi mới có tiền tiết kiệm",
    pain_point: "Gửi tiết kiệm sai cách, lãi suất kém, mất cơ hội sinh lời",
    format_hint: "educate",
    priority: 5,
  },
  {
    topic: "Cách chọn thẻ tín dụng cho người mới đi làm",
    hook: "Đừng mở thẻ tín dụng trước khi xem video này",
    target_persona: "Người mới đi làm, chưa có thẻ tín dụng",
    pain_point: "Bị bẫy phí ẩn, lãi suất quá hạn cao",
    format_hint: "educate",
    priority: 5,
  },
  {
    topic: "Lãi suất tháng này nên gửi ngân hàng nào",
    hook: "Lãi suất tháng này có gì hot? So sánh nhanh top 5",
    target_persona: "Khách hàng có 100-500 triệu nhàn rỗi",
    pain_point: "Không biết ngân hàng nào lãi suất tốt nhất",
    format_hint: "educate",
    priority: 4,
  },
  {
    topic: "Vay mua nhà 2026: hồ sơ cần chuẩn bị gì",
    hook: "10 phút chuẩn bị, tiết kiệm 2 tuần chờ duyệt",
    target_persona: "Vợ chồng trẻ chuẩn bị mua nhà",
    pain_point: "Hồ sơ vay mua nhà phức tạp, không biết bắt đầu từ đâu",
    format_hint: "educate",
    priority: 5,
  },
  {
    topic: "Câu chuyện khách hàng: từ 0 đồng đến mua nhà 2 tỷ",
    hook: "Cô Lan, 35 tuổi, lương 12 triệu — cô làm thế nào?",
    target_persona: "Phụ nữ độc thân hoặc gia đình trẻ",
    pain_point: "Không có động lực tiết kiệm dài hạn",
    format_hint: "story",
    priority: 4,
  },
  {
    topic: "3 sản phẩm đầu tư an toàn cho người mới",
    hook: "Bạn không cần là chuyên gia tài chính để bắt đầu",
    target_persona: "Người mới muốn đầu tư",
    pain_point: "Sợ rủi ro, không biết bắt đầu từ đâu",
    format_hint: "educate",
    priority: 4,
  },
  {
    topic: "Cảnh báo: 5 dấu hiệu tin nhắn lừa đảo ngân hàng",
    hook: "Tin nhắn này có thể khiến bạn mất sạch tiền",
    target_persona: "Tất cả khách hàng ngân hàng",
    pain_point: "Lo sợ bị lừa qua SMS/email giả mạo",
    format_hint: "educate",
    priority: 5,
  },
  {
    topic: "Mở sổ tiết kiệm online trong 5 phút",
    hook: "Không cần ra ngân hàng nữa — làm tại nhà",
    target_persona: "Người bận rộn",
    pain_point: "Ngại đi ngân hàng, mất thời gian",
    format_hint: "cta",
    priority: 4,
  },
  {
    topic: "Gói vay tiêu dùng — nên hay không?",
    hook: "Trước khi vay tiêu dùng, hãy hỏi bản thân 3 câu này",
    target_persona: "Người đang cân nhắc vay",
    pain_point: "Sợ bẫy nợ, lãi cao",
    format_hint: "educate",
    priority: 3,
  },
  {
    topic: "Lập kế hoạch tài chính 2026 cho gia đình trẻ",
    hook: "1 tờ giấy, 5 mục — đủ cho cả năm",
    target_persona: "Gia đình trẻ mới có con",
    pain_point: "Không biết phân bổ thu nhập thế nào",
    format_hint: "educate",
    priority: 4,
  },
  {
    topic: "FOMO crypto — đừng làm điều này",
    hook: "Trước khi bỏ tiền vào crypto, xem video này đã",
    target_persona: "Người trẻ FOMO theo bạn bè",
    pain_point: "Mất tiền do quyết định cảm xúc",
    format_hint: "story",
    priority: 3,
  },
  {
    topic: "Q&A: 10 câu hỏi thường gặp về thẻ tín dụng",
    hook: "Bạn đang dùng thẻ tín dụng sai cách?",
    target_persona: "Người mới dùng thẻ TD",
    pain_point: "Hiểu sai về cơ chế thẻ tín dụng",
    format_hint: "educate",
    priority: 3,
  },
];

function mockScript(topic: string, lengthSec: number) {
  return {
    hook: `Bạn có biết: ${topic.toLowerCase()} là vấn đề mà 70% khách hàng của tôi đều gặp phải?`,
    body: `Trong 5 năm tư vấn cá nhân hóa, tôi đã thấy rất nhiều khách hàng băn khoăn về "${topic}". Câu trả lời ngắn gọn: cần hiểu 3 yếu tố cốt lõi. Thứ nhất là mục tiêu tài chính dài hạn của bạn. Thứ hai là khả năng chấp nhận rủi ro. Thứ ba là dòng tiền thực tế hàng tháng. Khi bạn cân bằng được 3 yếu tố này, quyết định sẽ tự nhiên rõ ràng. Đừng nghe theo người khác — hãy chọn theo hoàn cảnh của mình.`,
    cta: `Nếu bạn còn câu hỏi, để lại bình luận bên dưới — tôi sẽ trả lời cá nhân hóa cho từng người. Follow để xem video chuyên môn mỗi tuần nhé!`,
    caption: `Chia sẻ kinh nghiệm 5 năm tư vấn về: ${topic} 💼\n\n3 yếu tố cốt lõi mà ai cũng cần hiểu trước khi quyết định.\n\n💬 Câu hỏi tài chính nào bạn quan tâm? Comment để mình tư vấn nhé!`,
    hashtags: ["#taichinh", "#tietkiem", "#personalbanker", "#tuvantaichinh", "#vpbank", "#fyp", "#xuhuong"],
    variantPrompts: {
      talking: `[Cận mặt, nhìn camera, tự nhiên]\n\nHook: Bạn có biết: ${topic.toLowerCase()}? ...`,
      broll: {
        shotList: [
          { footageTag: "intro", durationSec: 5, note: "Mở đầu với cận mặt" },
          { footageTag: "broll", durationSec: 15, note: "Cảnh văn phòng, làm việc với khách" },
          { footageTag: "talking", durationSec: 30, note: "Giải thích 3 yếu tố" },
          { footageTag: "cta", durationSec: 10, note: "Mời comment" },
        ],
        voiceOver: "Voice-over cho video b-roll...",
      },
      animation: {
        keyMessages: ["3 yếu tố cốt lõi", "Mục tiêu - Rủi ro - Dòng tiền", "Quyết định cá nhân hóa"],
        dataPoints: ["70% khách hàng gặp vấn đề này", "5 năm kinh nghiệm tư vấn"],
        visualCues: ["Icon ngân hàng", "Biểu đồ 3 yếu tố", "Animation số liệu"],
        voiceOver: "Voice-over cho animation video...",
      },
    },
    estimatedDurationSec: lengthSec,
    // Phase 1: storyboard content-graph mock — e2e local test trọn đường graph mới
    // (số 70% là MINH HOẠ → label ghi 'ví dụ' đúng anti-fab; mock không có nguồn thật).
    storyboard: {
      schemaVersion: 1,
      intent: "explainer",
      synopsis: `Giải thích ngắn: ${topic}`,
      nodes: [
        { id: "hook", kind: "text", text: `Bạn có biết: ${topic.toLowerCase()}?`, frameIntent: "hook", durationSec: 4 },
        { id: "diem_1", kind: "text", text: "Yếu tố 1: mục tiêu tài chính dài hạn", frameIntent: "point", durationSec: 6 },
        { id: "so_lieu_1", kind: "data", data: { value: "70", unit: "%", label: "khách hàng gặp vấn đề (ví dụ)" }, frameIntent: "data-big", durationSec: 5 },
        { id: "diem_2", kind: "text", text: "Yếu tố 2: khả năng chấp nhận rủi ro", frameIntent: "point", durationSec: 6 },
        { id: "diem_3", kind: "text", text: "Yếu tố 3: dòng tiền thực tế hàng tháng", frameIntent: "point", durationSec: 6 },
        { id: "cta", kind: "text", text: "Comment câu hỏi — tôi trả lời từng người", frameIntent: "outro", durationSec: 4 },
      ],
      edges: [
        { from: "hook", to: "diem_1", kind: "sequence" },
        { from: "diem_1", to: "so_lieu_1", kind: "sequence" },
        { from: "so_lieu_1", to: "diem_2", kind: "sequence" },
        { from: "diem_2", to: "diem_3", kind: "sequence" },
        { from: "diem_3", to: "cta", kind: "sequence" },
      ],
    },
  };
}

function mockAudit() {
  return {
    status: "pass" as const,
    score: 92,
    issues: [
      {
        severity: "low" as const,
        rule: "tone_review",
        excerpt: "Một số đoạn có thể chỉnh để gần gũi hơn",
        suggestion: "Thử dùng câu hỏi mở ở đầu thay vì statement",
      },
    ],
    summary: "Script tuân thủ đầy đủ quy định compliance ngành banking. Không vi phạm rule nào nghiêm trọng.",
  };
}

export function makeMockLLM(): LLMProvider {
  return {
    async complete({ messages, system, responseFormat }) {
      const userMsg = messages[messages.length - 1]?.content || "";
      const fullPrompt = (system || "") + "\n" + userMsg;
      const intent = detectIntent(fullPrompt);

      let text = "";
      if (responseFormat === "json") {
        if (intent === "planner") {
          const n = parseInt(userMsg.match(/(\d+)\s+chủ đề/)?.[1] || "12");
          text = JSON.stringify(MOCK_PLAN.slice(0, n));
        } else if (intent === "scripter") {
          const topic = userMsg.match(/Chủ đề video:\s*([^\n]+)/)?.[1] || "Tài chính cá nhân";
          const len = parseInt(userMsg.match(/(\d+)\s*giây/)?.[1] || "60");
          text = JSON.stringify(mockScript(topic, len));
        } else if (intent === "auditor") {
          text = JSON.stringify(mockAudit());
        } else {
          text = JSON.stringify({ mock: true, note: "Mock LLM — kết nối Claude/Gemini để có output thật" });
        }
      } else if (intent === "sample") {
        text = `[HOOK 5s]\nBạn có biết: 80% người Việt đang gửi tiết kiệm sai cách? Trong 30 giây tiếp theo mình sẽ chỉ bạn 3 lỗi phổ biến nhất.\n\n[BODY 30s]\nLỗi đầu tiên là không so sánh lãi suất giữa các ngân hàng. Lỗi thứ hai là chọn kỳ hạn quá dài khi chưa có nhu cầu rõ. Lỗi thứ ba là không tận dụng các gói tiết kiệm linh hoạt — vừa có lãi cao vừa rút được khi cần.\n\n[CTA 10s]\nComment "TIET KIEM" để mình gửi bạn checklist 5 phút tự kiểm tra. Follow để xem thêm video tài chính cá nhân hàng tuần.\n\n— [Mock output] Kết nối Claude hoặc Gemini để có script chất lượng thật.`;
      } else {
        text = `[MOCK LLM] Phản hồi mẫu cho: "${userMsg.slice(0, 80)}..."\n\nĐây là output mock vì chưa có LLM provider thật. Vào /settings/integrations thêm Claude hoặc Gemini (free) để dùng AI thật.`;
      }

      return { text, tokensIn: 200, tokensOut: 800, costUsd: 0 };
    },
    async testConnection() {
      return { ok: true, latencyMs: 1 };
    },
  };
}

// Generate a silent MP3 of approximately N seconds.
// MP3 frame: 44.1kHz, mono, 32kbps = 144 byte per frame (~26ms each).
function buildSilentMp3(seconds: number): Buffer {
  const FRAME = Buffer.from([
    0xff, 0xfb, 0x10, 0x64, 0x00, 0x0f, 0xf0, 0x00, 0x00, 0x69, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00,
    0x0d, 0x20, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0xa4, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x34,
    0x80, 0x00, 0x00, 0x04, 0x4c, 0x41, 0x4d, 0x45, 0x33, 0x2e, 0x31, 0x30, 0x30, 0x55, 0x55, 0x55,
    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
  ]);
  // ~26ms per frame at this bitrate
  const frameCount = Math.max(1, Math.ceil((seconds * 1000) / 26));
  return Buffer.concat(Array(frameCount).fill(FRAME));
}

export function makeMockTTS(): TTSProvider {
  return {
    async synthesize({ text }) {
      const seconds = Math.max(1, text.length / 15);
      const mp3 = buildSilentMp3(seconds);
      return {
        audioBase64: mp3.toString("base64"),
        mimeType: "audio/mpeg",
        durationMs: Math.round(seconds * 1000),
        costUsd: 0,
      };
    },
    async listVoices() {
      return [
        { id: "mock-vi-male", name: "Mock VN Male", lang: "vi", gender: "male" },
        { id: "mock-vi-female", name: "Mock VN Female", lang: "vi", gender: "female" },
      ];
    },
    async testConnection() {
      return { ok: true, latencyMs: 1 };
    },
  };
}

export function makeMockAvatar(): AvatarProvider {
  return {
    async renderTalking() {
      return { jobId: `mock-${Date.now()}` };
    },
    async poll() {
      return { status: "done", outputUrl: "https://example.com/mock-video.mp4" };
    },
    async listAvatars() {
      return [{ id: "mock-1", name: "Mock Avatar VN", gender: "male" }];
    },
    async testConnection() {
      return { ok: true, latencyMs: 1 };
    },
  };
}

export function makeMockRender(): RenderProvider {
  return {
    async render() {
      return { jobId: `mock-${Date.now()}` };
    },
    async poll() {
      return { status: "done", outputUrl: "https://example.com/mock-render.mp4" };
    },
    async listTemplates() {
      return [
        { id: "mock-broll", name: "Mock B-roll Template" },
        { id: "mock-anim", name: "Mock Animation Template" },
      ];
    },
    async testConnection() {
      return { ok: true, latencyMs: 1 };
    },
  };
}
