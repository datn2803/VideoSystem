// Parse/normalize THUẦN cho Topic Strategist (không import server/hub) → unit-test độc lập.

export type TopicScores = { demand: number; virality: number; relevance: number; total: number };

export type ContentTopic = {
  topic: string;
  hook: string;
  target_persona: string;
  pain_point: string;
  format_hint: "educate" | "story" | "cta" | "mythbust" | "listicle" | "news";
  pillar?: string; // thuộc trụ nào (Part 1 strategy)
  contentType?: "evergreen" | "trend"; // giữ tỉ lệ ~70/30
  whyNow?: string; // vì sao nên làm bây giờ
  dataHook?: string; // số liệu/góc data định dùng (điểm tựa cho Scripter)
  scores?: TopicScores; // demand×virality×relevance (1-5 mỗi cái, total = tổng)
  sources?: { title: string; url: string }[]; // dẫn nguồn (nếu trend)
  priority?: 1 | 2 | 3 | 4 | 5; // deprecated: data cũ + map sang ScriptRecord; mới = suy từ scores
};

const FORMAT_HINTS = ["educate", "story", "cta", "mythbust", "listicle", "news"] as const;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function normalizeSources(v: unknown): { title: string; url: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const s of v) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const url = str(r.url ?? r.uri);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: str(r.title) || url, url });
  }
  return out;
}

// Canonical hoá tên pillar về đúng chuỗi trong strategy (khớp lỏng, không phân biệt hoa thường).
function canonPillar(raw: string, pillarNames: string[]): string {
  if (!raw) return "";
  const low = raw.toLowerCase();
  const hit = pillarNames.find((p) => p.toLowerCase() === low) || pillarNames.find((p) => p.toLowerCase().includes(low) || low.includes(p.toLowerCase()));
  return hit || raw;
}

export function normalizeTopic(raw: unknown, pillarNames: string[] = []): ContentTopic | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const topic = str(r.topic);
  if (!topic) return null;

  const fh = str(r.format_hint).toLowerCase();
  const format_hint = (FORMAT_HINTS as readonly string[]).includes(fh)
    ? (fh as ContentTopic["format_hint"])
    : "educate";

  const ct = str(r.contentType).toLowerCase();
  const contentType: ContentTopic["contentType"] = ct === "trend" ? "trend" : "evergreen";

  const rawScores = (r.scores && typeof r.scores === "object" ? r.scores : {}) as Record<string, unknown>;
  const demand = clampScore(rawScores.demand);
  const virality = clampScore(rawScores.virality);
  const relevance = clampScore(rawScores.relevance);
  const total = demand + virality + relevance; // 3..15 — luôn tự tính cho nhất quán
  const priority = Math.min(5, Math.max(1, Math.round(total / 3))) as 1 | 2 | 3 | 4 | 5;

  return {
    topic,
    hook: str(r.hook),
    target_persona: str(r.target_persona),
    pain_point: str(r.pain_point),
    format_hint,
    pillar: canonPillar(str(r.pillar), pillarNames),
    contentType,
    whyNow: str(r.whyNow),
    dataHook: str(r.dataHook),
    scores: { demand, virality, relevance, total },
    sources: normalizeSources(r.sources),
    priority,
  };
}

// Bóc mảng topic từ text (fence ```json, {topics:[]}, hoặc regex [..]).
export function parseTopicsArray(text: string): unknown[] {
  if (!text) return [];
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (s: string): unknown[] | null => {
    if (!s) return null;
    try {
      const p = JSON.parse(s);
      if (Array.isArray(p)) return p;
      if (p && typeof p === "object" && Array.isArray((p as { topics?: unknown }).topics)) {
        return (p as { topics: unknown[] }).topics;
      }
    } catch {
      /* ignore */
    }
    return null;
  };
  return tryParse(cleaned) ?? tryParse(cleaned.match(/\[[\s\S]*\]/)?.[0] ?? "") ?? [];
}

// Parse + normalize + sort theo scores.total giảm dần.
export function extractTopics(text: string, pillarNames: string[] = []): ContentTopic[] {
  return parseTopicsArray(text)
    .map((t) => normalizeTopic(t, pillarNames))
    .filter((t): t is ContentTopic => t !== null)
    .sort((a, b) => (b.scores?.total ?? 0) - (a.scores?.total ?? 0));
}
