import { hub } from "@/lib/integration-hub/hub";
import { store, type ProfileRecord } from "@/lib/integration-hub/storage";

export type ScriptResult = {
  hook: string;
  body: string;
  cta: string;
  caption: string;
  hashtags: string[];
  variantPrompts: {
    talking: string;
    broll: { shotList: { footageTag: string; durationSec: number; note: string }[]; voiceOver: string };
    animation: {
      keyMessages: string[];
      dataPoints: string[];
      visualCues: string[];
      voiceOver: string;
      // C3 v4.1 — nội dung RIÊNG cho từng archetype bento (tuỳ chọn → backward-compat).
      heroSubject?: string;
      bigStat?: { value: string; unit: string; label: string };
      bars?: { label: string; value: string; unit: string }[];
      pills?: { text: string }[];
      compare?: { leftTitle: string; leftItems: string[]; rightTitle: string; rightItems: string[] };
      principle?: string;
      callout?: string;
      // C3 v5 — data-viz đa dạng (số chạy, NON-READ minh hoạ body). Tuỳ chọn → backward-compat.
      donut?: { value: string; unit: string; label: string };
      beforeAfter?: { fromValue: string; fromLabel: string; toValue: string; toLabel: string; unit: string };
      miniStats?: { value: string; unit: string; label: string }[];
      trend?: { label: string; points: string[] };
    };
  };
  estimatedDurationSec: number;
  raw?: string;
  costUsd: number;
};

const SYSTEM = `Bạn là content writer chuyên ngành tài chính ngân hàng tại Việt Nam, viết content cho TikTok/Reels.
Đặc trưng phong cách:
- Tự nhiên, gần gũi, không sáo rỗng
- Hook 3-5 giây thật mạnh, dùng số liệu cụ thể hoặc câu hỏi gây tò mò
- Body có data, có ví dụ thực tế, có insight chuyên môn
- CTA rõ ràng, mời tương tác chứ không spam quảng cáo
- Tone: chuyên nghiệp + đáng tin + tôn trọng người xem
- TUYỆT ĐỐI không hứa lợi nhuận cụ thể, không nói "an toàn 100%", không so sánh tiêu cực với ngân hàng khác`;

function buildPrompt(profile: ProfileRecord, topic: string, pain: string, persona: string, lengthSec: number): string {
  return `Profile chuyên gia:
- Tên: ${profile.name}
- Vị trí: ${profile.role || "Personal Banker"}
- Năm kinh nghiệm: ${profile.expertise?.yearsExp || "N/A"}
- Sản phẩm phụ trách: ${(profile.expertise?.products || []).join(", ") || "N/A"}
- USP: ${profile.usp || "N/A"}
- Tone: ${profile.tone?.voice || "professional"}

Chủ đề video: ${topic}
Pain point cần giải quyết: ${pain}
Target persona: ${persona}
Độ dài mục tiêu: ${lengthSec} giây

Hãy viết script chi tiết cho video này, đồng thời cung cấp prompt cho 3 phong cách dựng video khác nhau.

CHỈ trả về JSON object hợp lệ (không markdown wrapper), theo schema sau:
{
  "hook": "câu mở 3-5s (≤25 từ, phải gây stop scroll)",
  "body": "nội dung chính, dạng đoạn văn, ${Math.round(lengthSec * 0.7)} giây",
  "cta": "call-to-action 5-10s (mời comment/follow, không spam)",
  "caption": "caption post social, có line break, có emoji vừa phải",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "variantPrompts": {
    "talking": "script đầy đủ cho AI avatar (hoặc người thật) đọc trực tiếp camera",
    "broll": {
      "shotList": [
        {"footageTag": "intro|talking|broll|cta|outro", "durationSec": 3, "note": "mô tả shot"}
      ],
      "voiceOver": "voice-over text cho video b-roll"
    },
    "animation": {
      "keyMessages": ["4-5 ý cốt lõi của BODY theo ĐÚNG THỨ TỰ giọng đọc (mỗi ý = 1 cảnh; tóm tắt NGẮN ý đó trong body)"],
      "dataPoints": ["3-5 số liệu MINH HOẠ có ngữ cảnh, GHI RÕ tính ví dụ (vd 'ví dụ tiết kiệm ~8 tiếng/tuần', 'thường giảm ~30% chi phí')"],
      "visualCues": ["gợi ý icon"],
      "voiceOver": "(KHÔNG dùng để đọc — C3 đọc CHUNG read script hook+body+cta. Để '' )",
      "heroSubject": "1 cụm NGẮN mô tả nhân vật/chủ thể minh hoạ 3D (vd 'trợ lý AI cho founder')",
      "bigStat": {"value": "80", "unit": "%", "label": "NHÃN NGẮN (vd 'ƯỚC TÍNH TIẾT KIỆM')"},
      "bars": [{"label": "Cách cũ", "value": "30", "unit": "%"}, {"label": "Với AI", "value": "75", "unit": "%"}, {"label": "Tối ưu", "value": "90", "unit": "%"}],
      "pills": [{"text": ".."}, {"text": ".."}, {"text": ".."}, {"text": ".."}],
      "compare": {"leftTitle": "Cách cũ", "leftItems": ["..", ".."], "rightTitle": "Với AI", "rightItems": ["..", ".."]},
      "principle": "1 câu nguyên tắc cốt lõi đắt giá (≤12 từ)",
      "callout": "1 insight nhấn mạnh (≤16 từ)",
      "donut": {"value": "70", "unit": "%", "label": "NHÃN NGẮN (số % KHÁC bigStat)"},
      "beforeAfter": {"fromValue": "8", "fromLabel": "Cách cũ", "toValue": "1", "toLabel": "Với AI", "unit": "giờ"},
      "miniStats": [{"value": "3", "unit": "x", "label": "Nhanh hơn"}, {"value": "60", "unit": "%", "label": "Tiết kiệm"}, {"value": "24", "unit": "/7", "label": "Hoạt động"}, {"value": "5", "unit": "phút", "label": "Cài đặt"}],
      "trend": {"label": "Tăng trưởng", "points": ["20", "45", "70", "95"]}
    }
  },
  "estimatedDurationSec": ${lengthSec}
}

QUY TẮC trường animation (QUYẾT ĐỊNH SỐ CẢNH + data motion — làm ĐẦY ĐỦ):
- ⚠ HÌNH C3 chạy KHỚP GIỌNG ĐỌC (đọc hook+body+cta). keyMessages PHẢI là các ý của BODY theo
  ĐÚNG THỨ TỰ giọng đọc (keyMessage i hiện đúng lúc giọng đọc tới ý đó). dataPoints/bars MINH HOẠ
  cho chính các ý đó — KHÔNG lạc đề, không thêm ý không có trong lời đọc.
- keyMessages: 4-5 ý RIÊNG BIỆT (mỗi ý thành 1 cảnh) → đủ cảnh, video không bị ít cảnh.
- bigStat + bars + dataPoints: LUÔN ĐIỀN bằng số liệu MINH HOẠ HỢP LÝ theo chủ đề (đây là phần "data motion" chạy số). Ghi rõ tính ví dụ/ước tính ở nhãn/dataPoints. TUYỆT ĐỐI KHÔNG bịa trích dẫn nghiên cứu (không "theo Gartner/McKinsey...").
- bars: 2-4 mục CÙNG ĐƠN VỊ để so sánh được (vd cùng "%"), giá trị KHÁC nhau.
- compare: 2 cột cụ thể (cũ vs mới); pills: 4 điểm NGẮN (≤8 từ) khác nhau.
- pills/compare/principle/callout RIÊNG BIỆT, không lặp keyMessages.
- ĐA DẠNG data-viz (số chạy): điền donut (1 vòng % khác bigStat), beforeAfter (số trước→sau, vd '8 giờ→1 giờ'),
  miniStats (3-4 chỉ số nhỏ khác nhau), trend (4-5 số tăng dần). TẤT CẢ là MINH HOẠ (ví dụ/ước tính), bám
  CHỦ ĐỀ + các ý trong body, KHÔNG lạc đề, KHÔNG bịa trích dẫn. Cái nào không hợp chủ đề thì để rỗng/bỏ.
- ⚠ hook/body/cta/voiceOver GIỮ NGẮN GỌN như cũ — KHÔNG vì thêm data mà viết dài ra (tránh video bị dài).`;
}

async function recordLLMUsage(costUsd: number, tokensIn: number, tokensOut: number) {
  const providers = (await store.listProviders()).filter((p) => p.kind === "llm" && p.enabled);
  const def = providers.find((p) => p.isDefault) || providers[0];
  if (!def) return;
  await store.recordUsage({
    providerId: def.id,
    date: new Date().toISOString().slice(0, 10),
    unitsUsed: tokensIn + tokensOut,
    costEstimateUsd: costUsd,
    requestCount: 1,
  });
}

export async function generateScript(input: {
  profile: ProfileRecord;
  topic: string;
  painPoint: string;
  targetPersona: string;
  lengthSec?: number;
}): Promise<ScriptResult> {
  const lengthSec = input.lengthSec || 60;
  const llm = await hub.llm();
  const result = await llm.complete({
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(input.profile, input.topic, input.painPoint, input.targetPersona, lengthSec) }],
    maxTokens: 6500, // đủ chỗ cho JSON giàu data-viz (donut/beforeAfter/miniStats/trend...) — KHÔNG làm dài video, chỉ tránh cắt JSON
    responseFormat: "json",
  });

  await recordLLMUsage(result.costUsd, result.tokensIn, result.tokensOut);

  let parsed: Partial<ScriptResult> = {};
  try {
    const cleaned = result.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned);
    }
  } catch {
    // Fallback: trả raw text
    return {
      hook: "",
      body: result.text,
      cta: "",
      caption: "",
      hashtags: [],
      variantPrompts: {
        talking: result.text,
        broll: { shotList: [], voiceOver: result.text },
        animation: { keyMessages: [], dataPoints: [], visualCues: [], voiceOver: result.text },
      },
      estimatedDurationSec: lengthSec,
      raw: result.text,
      costUsd: result.costUsd,
    };
  }

  return {
    hook: parsed.hook || "",
    body: parsed.body || "",
    cta: parsed.cta || "",
    caption: parsed.caption || "",
    hashtags: parsed.hashtags || [],
    variantPrompts: parsed.variantPrompts || {
      talking: "",
      broll: { shotList: [], voiceOver: "" },
      animation: { keyMessages: [], dataPoints: [], visualCues: [], voiceOver: "" },
    },
    estimatedDurationSec: parsed.estimatedDurationSec || lengthSec,
    costUsd: result.costUsd,
  };
}
