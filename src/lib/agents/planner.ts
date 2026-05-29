import { hub } from "@/lib/integration-hub/hub";
import { store, type ProfileRecord } from "@/lib/integration-hub/storage";

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

export type ContentTopic = {
  topic: string;
  hook: string;
  target_persona: string;
  pain_point: string;
  format_hint: "educate" | "story" | "cta";
  priority: 1 | 2 | 3 | 4 | 5;
};

const SYSTEM = `Bạn là content strategist chuyên về marketing cá nhân cho ngành tài chính ngân hàng tại Việt Nam.
Bạn hiểu sâu hành vi người dùng Việt, tâm lý khách hàng cá nhân, và các trend trên TikTok/Facebook.
Bạn viết theo phong cách tự nhiên, gần gũi, có insight, tránh sáo rỗng.`;

function buildPrompt(profile: ProfileRecord, n: number, frequency: string): string {
  return `Profile chuyên gia:
- Tên: ${profile.name}
- Vị trí: ${profile.role || "Personal Banker"}
- Ngành: ${profile.industry}
- Số năm kinh nghiệm: ${profile.expertise?.yearsExp || "N/A"}
- Sản phẩm phụ trách: ${(profile.expertise?.products || []).join(", ") || "N/A"}
- Audience: ${profile.audience?.segment || "N/A"}
- Pain points của audience: ${(profile.audience?.painPoints || []).join("; ") || "N/A"}
- Goals của audience: ${(profile.audience?.goals || []).join("; ") || "N/A"}
- Tone voice: ${profile.tone?.voice || "professional"}
- USP: ${profile.usp || "N/A"}

Đề xuất ${n} chủ đề video ngắn cho 30 ngày tới (tần suất ${frequency}).
Mỗi chủ đề cần:
- topic: tên chủ đề ≤ 15 từ, cụ thể, có hook value
- hook: 1 câu mở đầu thu hút (≤ 20 từ) — phải khiến người ta dừng lướt
- target_persona: ai sẽ xem video này (mô tả ngắn)
- pain_point: vấn đề cụ thể video giải quyết
- format_hint: "educate" | "story" | "cta"
- priority: 1-5 (5 = ưu tiên cao nhất, có khả năng viral)

CHỈ trả về JSON array hợp lệ, không có markdown wrapper, không có giải thích.
Ví dụ format:
[{"topic":"...","hook":"...","target_persona":"...","pain_point":"...","format_hint":"educate","priority":5}]`;
}

function extractTopics(text: string): ContentTopic[] {
  if (!text) return [];
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (s: string): ContentTopic[] | null => {
    try {
      const p = JSON.parse(s);
      if (Array.isArray(p)) return p as ContentTopic[];
      if (Array.isArray(p?.topics)) return p.topics as ContentTopic[];
    } catch {
      /* ignore */
    }
    return null;
  };
  return tryParse(cleaned) ?? tryParse(cleaned.match(/\[[\s\S]*\]/)?.[0] ?? "") ?? [];
}

export async function generateContentPlan(
  profile: ProfileRecord,
  n: number = 12,
  frequency: string = "3 video/tuần"
): Promise<{ topics: ContentTopic[]; costUsd: number; model: string }> {
  const llm = await hub.llm();
  const runOnce = () =>
    llm.complete({
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(profile, n, frequency) }],
      maxTokens: 8192,
      responseFormat: "json",
    });

  let result = await runOnce();
  let topics = extractTopics(result.text);
  if (topics.length === 0) {
    console.error("[planner] parse rỗng, raw:", result.text?.slice(0, 1000));
    result = await runOnce(); // retry 1 lần
    topics = extractTopics(result.text);
    if (topics.length === 0) console.error("[planner] retry vẫn rỗng:", result.text?.slice(0, 1000));
  }

  await recordLLMUsage(result.costUsd, result.tokensIn, result.tokensOut);
  return { topics, costUsd: result.costUsd, model: "default" };
}

export async function generateSampleScript(profile: ProfileRecord): Promise<{ text: string; costUsd: number }> {
  const llm = await hub.llm();
  const prompt = `Profile: ${profile.name} (${profile.role || "Personal Banker"})
Audience: ${profile.audience?.segment || "khách hàng cá nhân"}
Pain: ${(profile.audience?.painPoints || []).join(", ") || "tài chính cá nhân"}
Tone: ${profile.tone?.voice || "professional, trustworthy"}

Viết 1 script ngắn (~45 giây, ~120 từ) demo phong cách video của profile này cho TikTok/Reels.
Format:
[HOOK 5s] ...
[BODY 30s] ...
[CTA 10s] ...`;
  const result = await llm.complete({
    messages: [{ role: "user", content: prompt }],
    maxTokens: 600,
  });
  await recordLLMUsage(result.costUsd, result.tokensIn, result.tokensOut);
  return { text: result.text, costUsd: result.costUsd };
}
