import { hub } from "@/lib/integration-hub/hub";
import { store, type ProfileRecord, type ContentPillar, type ProfileStrategy } from "@/lib/integration-hub/storage";
import { recordLLMUsage } from "@/lib/agents/usage";

// ── Strategy Agent ──────────────────────────────────────────────────────────
// Profile → brandAngle + channelGoal + 3-5 PILLARS.
// JSON, KHÔNG grounding: pillars là chủ đề chiến lược ổn định, suy từ profile là đủ;
// để dành grounding (Google Search) cho Planner (trend) + Scripter (số liệu).

const SYSTEM = `Bạn là content strategist xây thương hiệu cá nhân tại Việt Nam.
Mục tiêu: thương hiệu BỀN VỮNG, đúng chuyên môn nhưng dễ tiếp cận MỌI tệp khán giả, mọi nội dung bám NỖI ĐAU thật của khách.
Bạn diễn đạt phổ thông, gần gũi, tránh thuật ngữ rối rắm và sáo rỗng.`;

function buildPrompt(profile: ProfileRecord): string {
  return `Profile chuyên gia:
- Tên: ${profile.name}
- Vị trí: ${profile.role || "N/A"}
- Ngành: ${profile.industry}
- Số năm kinh nghiệm: ${profile.expertise?.yearsExp ?? "N/A"}
- Sản phẩm phụ trách: ${(profile.expertise?.products || []).join(", ") || "N/A"}
- Audience: ${profile.audience?.segment || "N/A"}
- Pain points của audience: ${(profile.audience?.painPoints || []).join("; ") || "N/A"}
- Goals của audience: ${(profile.audience?.goals || []).join("; ") || "N/A"}
- Tone voice: ${profile.tone?.voice || "professional"}
- USP: ${profile.usp || "N/A"}

Từ profile trên, hãy rút ra CHIẾN LƯỢC kênh:
1) brandAngle: 1 câu định vị riêng — vì sao khán giả nên theo dõi CHÍNH chuyên gia này (góc nhìn khác biệt, không chung chung).
2) channelGoal: 1 trong "uy tín" | "lead" | "bán" (mục tiêu chính của kênh).
3) pillars: 3-5 TRỤ nội dung, mỗi trụ là một mảng chủ đề lặp lại của kênh. Mỗi trụ gồm:
   - name: tên trụ ≤6 từ, dễ hiểu
   - description: 1 câu mô tả trụ này nói về gì
   - painPoints: 1-3 nỗi đau khách mà trụ giải quyết
   - sampleAngles: 2-3 góc khai thác cụ thể (ý tưởng video gợi ý)

Ràng buộc:
- Các trụ phải PHỦ hết sản phẩm chính + nỗi đau chính của audience.
- Các trụ KHÔNG trùng lặp nội dung nhau.
- Diễn đạt phổ thông, dễ tiếp cận mọi tệp (không hàn lâm).
- Chỉ dùng thông tin từ profile, KHÔNG bịa sản phẩm/dịch vụ không có.

CHỈ trả về JSON hợp lệ, KHÔNG markdown wrapper, KHÔNG giải thích.
Format:
{"brandAngle":"...","channelGoal":"uy tín","pillars":[{"name":"...","description":"...","painPoints":["..."],"sampleAngles":["...","..."]}]}`;
}

type RawStrategy = {
  brandAngle?: unknown;
  channelGoal?: unknown;
  pillars?: unknown;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim())).filter(Boolean);
}

function normalizePillar(raw: unknown): ContentPillar | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return null;
  return {
    name,
    description: typeof r.description === "string" ? r.description.trim() : "",
    painPoints: asStringArray(r.painPoints),
    sampleAngles: asStringArray(r.sampleAngles),
  };
}

// Parse robust: bóc markdown fence, thử JSON.parse, fallback regex object {...}.
function extractStrategy(text: string): Omit<ProfileStrategy, "generatedAt"> | null {
  if (!text) return null;
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (s: string): Omit<ProfileStrategy, "generatedAt"> | null => {
    if (!s) return null;
    let obj: RawStrategy;
    try {
      obj = JSON.parse(s) as RawStrategy;
    } catch {
      return null;
    }
    const pillars = Array.isArray(obj.pillars)
      ? obj.pillars.map(normalizePillar).filter((p): p is ContentPillar => p !== null)
      : [];
    if (pillars.length === 0) return null;
    return {
      brandAngle: typeof obj.brandAngle === "string" ? obj.brandAngle.trim() : "",
      channelGoal: typeof obj.channelGoal === "string" ? obj.channelGoal.trim() : "uy tín",
      pillars,
    };
  };
  return tryParse(cleaned) ?? tryParse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "");
}

/**
 * Sinh strategy (brandAngle + channelGoal + pillars) từ profile.
 * Trả null nếu LLM hỏng/parse rỗng (caller xử lý best-effort, không phá việc tạo profile).
 */
export async function generateStrategy(
  profile: ProfileRecord
): Promise<{ strategy: ProfileStrategy; costUsd: number } | null> {
  const llm = await hub.llm();
  const runOnce = () =>
    llm.complete({
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(profile) }],
      maxTokens: 4096,
      responseFormat: "json",
    });

  let result = await runOnce();
  let parsed = extractStrategy(result.text);
  if (!parsed) {
    console.error("[strategist] parse rỗng, raw:", result.text?.slice(0, 800));
    result = await runOnce(); // retry 1 lần
    parsed = extractStrategy(result.text);
    if (!parsed) console.error("[strategist] retry vẫn rỗng:", result.text?.slice(0, 800));
  }

  await recordLLMUsage(result.costUsd, result.tokensIn, result.tokensOut);
  if (!parsed) return null;

  const strategy: ProfileStrategy = { ...parsed, generatedAt: new Date().toISOString() };
  return { strategy, costUsd: result.costUsd };
}

/**
 * Sinh strategy rồi lưu vào profile (giữ field cũ). Trả strategy đã lưu hoặc null.
 */
export async function generateAndSaveStrategy(profileId: string): Promise<ProfileStrategy | null> {
  const profile = await store.getProfile(profileId);
  if (!profile) return null;
  const out = await generateStrategy(profile);
  if (!out) return null;
  await store.upsertProfile({ ...profile, strategy: out.strategy });
  return out.strategy;
}
