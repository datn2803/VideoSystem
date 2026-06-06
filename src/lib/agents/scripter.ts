import { hub } from "@/lib/integration-hub/hub";
import { type ProfileRecord } from "@/lib/integration-hub/storage";
import { recordLLMUsage } from "@/lib/agents/usage";
import { groundedNoSourceWarning } from "@/lib/agents/grounding-util";

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
  sources?: { claim: string; url: string; year?: string }[]; // nguồn số liệu thật (từ Fact Researcher grounded)
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

function buildPrompt(
  profile: ProfileRecord,
  topic: string,
  pain: string,
  persona: string,
  lengthSec: number,
  wordBudget: number,
  factBrief: string
): string {
  const factSection = factBrief.trim()
    ? `\nFACT BRIEF (số liệu nghiên cứu — ƯU TIÊN dùng các số trong đây; số nào KHÔNG có trong brief mà tự suy thì PHẢI ghi "ước tính"/"ví dụ"):\n"""\n${factBrief.trim()}\n"""\n`
    : `\n(Không có fact brief số liệu thật — số nào đưa ra phải gắn nhãn "ước tính"/"ví dụ", TUYỆT ĐỐI không bịa trích dẫn nghiên cứu.)\n`;
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
${factSection}
KHUNG KỊCH BẢN BẮT BUỘC: HOOK (3-5s, số sốc/câu hỏi/phản trực giác) → VẤN ĐỀ (nỗi đau) → GIẢI PHÁP → BẰNG CHỨNG (số THẬT từ fact brief) → CTA loop.
⚠ RÀNG BUỘC ĐỘ DÀI (đòn bẩy chính): tổng read script "hook + body + cta" ≤ ${wordBudget} TỪ (≈${lengthSec}s đọc). Viết SÚC TÍCH, cắt chữ thừa — KHÔNG vượt ngân sách từ.

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

// ── Fact Researcher (GROUNDED → TEXT có nguồn) ──
// Tìm số liệu THẬT cho chủ đề. Best-effort: hỏng/không-grounding → brief rỗng/cảnh báo, KHÔNG phá việc viết script.
async function runFactResearcher(
  profile: ProfileRecord,
  topic: string,
  dataHook: string | undefined,
  pain: string
): Promise<{ brief: string; sources: { title: string; url: string }[]; costUsd: number }> {
  const llm = await hub.llm();
  const system = `Bạn là nhà nghiên cứu số liệu ngành ${profile.industry} tại Việt Nam.
CHỈ nêu số liệu TÌM ĐƯỢC qua tìm kiếm thực tế (kèm năm + nguồn). TUYỆT ĐỐI không bịa số hay trích dẫn nghiên cứu.`;
  const user = `Chủ đề video: "${topic}"
Góc dữ liệu cần làm rõ: ${dataHook || pain || topic}
Audience: ${profile.audience?.segment || "N/A"}

Tìm 5-8 SỐ LIỆU/VÍ DỤ THẬT, mới, ưu tiên nguồn Việt Nam (mỗi ý kèm năm + nguồn). Nêu rõ 1-2 con số gây sốc có thể dùng làm hook.
Trả về TEXT gạch đầu dòng, mỗi ý kèm nguồn. Nếu KHÔNG tìm được số thật, nói rõ (đừng bịa).`;
  try {
    const r = await llm.complete({
      system,
      messages: [{ role: "user", content: user }],
      grounded: true,
      maxTokens: 1536,
    });
    await recordLLMUsage(r.costUsd, r.tokensIn, r.tokensOut);
    const sources = r.citations ?? [];
    let brief = r.text || "";
    const warning = brief ? groundedNoSourceWarning(r) : "";
    if (warning) brief = `${warning}\n\n${brief}`;
    return { brief, sources, costUsd: r.costUsd };
  } catch (e) {
    console.error("[scripter] Fact Researcher lỗi (bỏ qua, viết script không có brief):", e);
    return { brief: "", sources: [], costUsd: 0 };
  }
}

// ~2.5 từ/giây đọc TV → 60s≈150, 90s≈225, 30s≈75 từ (khớp blueprint).
export function wordBudgetFor(lengthSec: number): number {
  return Math.max(60, Math.round(lengthSec * 2.5));
}

export async function generateScript(input: {
  profile: ProfileRecord;
  topic: string;
  painPoint: string;
  targetPersona: string;
  lengthSec?: number;
  dataHook?: string; // góc data từ ContentTopic (Part 3) → định hướng Fact Researcher
}): Promise<ScriptResult> {
  const lengthSec = input.lengthSec || 60;
  const wordBudget = wordBudgetFor(lengthSec);

  // Tầng 1: Fact Researcher (grounded → số liệu thật + nguồn). Best-effort.
  const fact = await runFactResearcher(input.profile, input.topic, input.dataHook, input.painPoint);

  // Tầng 2: Script Writer (JSON, no-grounding) — dùng fact brief + khoá word-budget.
  const llm = await hub.llm();
  const result = await llm.complete({
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: buildPrompt(input.profile, input.topic, input.painPoint, input.targetPersona, lengthSec, wordBudget, fact.brief),
      },
    ],
    maxTokens: 6500, // đủ chỗ cho JSON giàu data-viz (donut/beforeAfter/miniStats/trend...) — KHÔNG làm dài video, chỉ tránh cắt JSON
    responseFormat: "json",
  });

  await recordLLMUsage(result.costUsd, result.tokensIn, result.tokensOut);

  // Nguồn số liệu = citations THẬT từ Fact Researcher (không nhờ Writer tự đẻ URL → tránh bịa link).
  const sources = fact.sources.map((s) => ({ claim: s.title, url: s.url }));
  const totalCost = fact.costUsd + result.costUsd;

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
      sources: sources.length ? sources : undefined,
      raw: result.text,
      costUsd: totalCost,
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
    sources: sources.length ? sources : undefined,
    costUsd: totalCost,
  };
}
