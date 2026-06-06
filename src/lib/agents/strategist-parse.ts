import type { ContentPillar, ProfileStrategy } from "@/lib/integration-hub/storage";

// Phần parse/normalize THUẦN (không import server/hub) → unit-test được độc lập.

type RawStrategy = {
  brandAngle?: unknown;
  channelGoal?: unknown;
  pillars?: unknown;
};

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim())).filter(Boolean);
}

export function normalizePillar(raw: unknown): ContentPillar | null {
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
export function extractStrategy(text: string): Omit<ProfileStrategy, "generatedAt"> | null {
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
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const pillars = Array.isArray(obj.pillars)
      ? obj.pillars.map(normalizePillar).filter((p): p is ContentPillar => p !== null)
      : [];
    if (pillars.length === 0) return null;
    return {
      brandAngle: typeof obj.brandAngle === "string" ? obj.brandAngle.trim() : "",
      channelGoal: typeof obj.channelGoal === "string" && obj.channelGoal.trim() ? obj.channelGoal.trim() : "uy tín",
      pillars,
    };
  };
  return tryParse(cleaned) ?? tryParse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "");
}
