import { hub } from "@/lib/integration-hub/hub";
import { type ProfileRecord, type ContentPillar } from "@/lib/integration-hub/storage";
import { recordLLMUsage } from "@/lib/agents/usage";
import { extractTopics, type ContentTopic } from "@/lib/agents/planner-parse";
import { groundedNoSourceWarning } from "@/lib/agents/grounding-util";

export type { ContentTopic, TopicScores } from "@/lib/agents/planner-parse";

// ── PLANNER (2 tầng) ──────────────────────────────────────────────────────────
// Trend Researcher (GROUNDED → TEXT có nguồn)  →  Topic Strategist (JSON chấm điểm).
// Vì Gemini 2.5 không gộp grounding + JSON nên phải tách 2 bước.

function pillarsBlock(pillars: ContentPillar[]): string {
  if (pillars.length === 0) return "(Chưa có trụ định sẵn — tự rải chủ đề theo sản phẩm + nỗi đau của profile.)";
  return pillars
    .map((p, i) => `  ${i + 1}. ${p.name}${p.description ? ` — ${p.description}` : ""}${p.painPoints?.length ? ` [nỗi đau: ${p.painPoints.join("; ")}]` : ""}`)
    .join("\n");
}

// ── 5a. Trend Researcher (grounded) ──
async function runTrendResearcher(
  profile: ProfileRecord,
  pillars: ContentPillar[]
): Promise<{ brief: string; citations: { title: string; url: string }[]; costUsd: number }> {
  const llm = await hub.llm();
  const today = new Date().toLocaleDateString("vi-VN");
  const system = `Bạn là nhà nghiên cứu xu hướng nội dung ngành ${profile.industry} tại Việt Nam.
CHỈ dùng thông tin TÌM ĐƯỢC qua tìm kiếm thực tế, ghi rõ nguồn. TUYỆT ĐỐI không bịa số liệu/sự kiện.`;
  const user = `Hôm nay là ${today}.
Lĩnh vực: ${profile.industry}
Audience: ${profile.audience?.segment || "N/A"}
Nỗi đau audience: ${(profile.audience?.painPoints || []).join("; ") || "N/A"}
Các trụ nội dung của kênh:
${pillarsBlock(pillars)}

Hãy nghiên cứu (ưu tiên nguồn Việt Nam: báo lớn, cơ quan nhà nước/hiệp hội, diễn đàn uy tín):
- Xu hướng / tin tức MỚI trong ~30 ngày qua liên quan tới các trụ trên.
- Yếu tố mùa vụ / thời điểm hiện tại đáng khai thác.
- Câu hỏi / nỗi đau audience đang bàn luận nhiều.
- 5-8 SỐ LIỆU THẬT (kèm năm + nguồn) có thể dùng làm điểm tựa nội dung.

Trả về TEXT, gạch đầu dòng rõ ràng, mỗi ý kèm nguồn dạng (nguồn: tên báo, năm) hoặc URL nếu có.
KHÔNG trả JSON. Nếu không tìm được dữ liệu mới, nói rõ và liệt kê các góc evergreen bền vững.`;
  try {
    const r = await llm.complete({
      system,
      messages: [{ role: "user", content: user }],
      grounded: true,
      maxTokens: 2048,
    });
    await recordLLMUsage(r.costUsd, r.tokensIn, r.tokensOut);
    const citations = r.citations ?? [];
    let brief = r.text || "";
    // Minh bạch: nếu KHÔNG có nguồn grounding thật → cảnh báo (đừng ngầm tưởng là dữ liệu real-time).
    const warning = brief ? groundedNoSourceWarning(r) : "";
    if (warning) brief = `${warning}\n\n${brief}`;
    return { brief, citations, costUsd: r.costUsd };
  } catch (e) {
    console.error("[planner] Trend Researcher lỗi (bỏ qua, dùng brief rỗng):", e);
    return { brief: "", citations: [], costUsd: 0 };
  }
}

// ── 5b. Topic Strategist (JSON, no-grounding) ──
const STRATEGIST_SYSTEM = `Bạn là content strategist xây thương hiệu cá nhân BỀN VỮNG tại Việt Nam.
Mọi chủ đề bám NỖI ĐAU thật của khách, đúng chuyên môn nhưng dễ tiếp cận MỌI tệp, tránh sáo rỗng.
Bạn ưu tiên giá trị bền vững hơn viral nhất thời.`;

function buildStrategistPrompt(
  profile: ProfileRecord,
  pillars: ContentPillar[],
  trendBrief: string,
  n: number
): string {
  const pillarNames = pillars.map((p) => p.name);
  const trendSection = trendBrief.trim()
    ? `BẢN TIN XU HƯỚNG (dữ liệu nghiên cứu thực tế — dùng cho các chủ đề "trend", trích nguồn khi dùng số):
"""
${trendBrief.trim()}
"""`
    : `(Không có bản tin xu hướng mới — ưu tiên chủ đề evergreen bền vững.)`;

  return `Profile chuyên gia:
- Tên: ${profile.name}
- Vị trí: ${profile.role || "N/A"}
- Ngành: ${profile.industry}
- Sản phẩm: ${(profile.expertise?.products || []).join(", ") || "N/A"}
- Audience: ${profile.audience?.segment || "N/A"}
- Nỗi đau audience: ${(profile.audience?.painPoints || []).join("; ") || "N/A"}
- Định vị: ${profile.strategy?.brandAngle || "N/A"}

Các trụ nội dung:
${pillarsBlock(pillars)}

${trendSection}

Hãy đề xuất ${n} chủ đề video ngắn (TikTok/Reels), RẢI ĐỀU theo các trụ${pillarNames.length ? ` (${pillarNames.join(", ")})` : ""}, theo TỈ LỆ ~70% "evergreen" / ~30% "trend".
Mỗi chủ đề là 1 object:
- topic: tên chủ đề ≤15 từ, cụ thể, có sức hút
- hook: 1 câu mở đầu ≤20 từ khiến người ta dừng lướt
- target_persona: ai sẽ xem (mô tả ngắn)
- pain_point: nỗi đau cụ thể chủ đề giải quyết
- pillar: tên trụ chủ đề thuộc về${pillarNames.length ? ` (chọn đúng 1 trong: ${pillarNames.join(" | ")})` : " (để trống nếu chưa có trụ)"}
- contentType: "evergreen" hoặc "trend"
- format_hint: 1 trong "educate" | "story" | "cta" | "mythbust" | "listicle" | "news"
- whyNow: vì sao nên làm bây giờ (mùa vụ/trend/nỗi đau nóng) — 1 câu
- dataHook: số liệu/góc data sẽ dùng làm điểm tựa (lấy từ bản tin nếu là trend)
- sources: mảng {title, url} dẫn nguồn (CHỈ khi là trend và có nguồn trong bản tin; evergreen để [])
- scores: { demand, virality, relevance } — mỗi tiêu chí chấm 1-5:
    demand = mức độ nỗi đau/nhu cầu tìm kiếm thật;
    virality = độ gây tò mò/chia sẻ;
    relevance = hợp trụ + định vị thương hiệu.

Chấm điểm THẬT (không cào bằng). CHỈ trả về JSON array hợp lệ, KHÔNG markdown, KHÔNG giải thích.
Sắp xếp theo tổng điểm giảm dần.`;
}

export async function generateContentPlan(
  profile: ProfileRecord,
  n: number = 12,
  _frequency: string = "3 video/tuần"
): Promise<{
  topics: ContentTopic[];
  costUsd: number;
  model: string;
  trendBrief?: string;
  citations?: { title: string; url: string }[];
}> {
  const pillars = profile.strategy?.pillars ?? [];
  const pillarNames = pillars.map((p) => p.name);

  // Tầng 1: Trend Researcher (grounded) — best-effort, không phá plan nếu hỏng.
  const trend = await runTrendResearcher(profile, pillars);

  // Tầng 2: Topic Strategist (JSON).
  const llm = await hub.llm();
  const runOnce = () =>
    llm.complete({
      system: STRATEGIST_SYSTEM,
      messages: [{ role: "user", content: buildStrategistPrompt(profile, pillars, trend.brief, n) }],
      maxTokens: 8192,
      responseFormat: "json",
    });

  let result = await runOnce();
  let topics = extractTopics(result.text, pillarNames);
  if (topics.length === 0) {
    console.error("[planner] Topic Strategist parse rỗng, raw:", result.text?.slice(0, 1000));
    result = await runOnce(); // retry 1 lần
    topics = extractTopics(result.text, pillarNames);
    if (topics.length === 0) console.error("[planner] retry vẫn rỗng:", result.text?.slice(0, 1000));
  }

  await recordLLMUsage(result.costUsd, result.tokensIn, result.tokensOut);
  return {
    topics,
    costUsd: trend.costUsd + result.costUsd,
    model: "default",
    trendBrief: trend.brief || undefined,
    citations: trend.citations.length ? trend.citations : undefined,
  };
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
