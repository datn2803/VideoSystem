/**
 * Design Director (Tầng 2 — bộ não thiết kế).
 *
 * Input: profile (brand/kênh) → chọn 1 design system (từ thư viện vendor
 * src/design/library) + 1 hướng thẩm mỹ → ĐẺ BrandKit token (palette/elevation/
 * style) cho Tầng 3 render. DETERMINISTIC + $0 (không LLM): cùng profile → cùng
 * kit (re-render ổn định); muốn đổi gu → regenerate với seed mới / override tay.
 *
 * Nguyên tắc màu: lấy anchor từ design system thật (catalog vendor), phái sinh
 * phần còn lại bằng tiện ích màu (color.ts) — KHÔNG bịa hex tuỳ hứng (kỷ luật
 * open-design). Token light/dark theo đúng công thức elevation 2 lớp hiện có
 * của composition (giữ chất lượng look đã verify).
 */
import { DESIGN_SYSTEMS, type DesignSystemSummary } from "@/design/library";
import { brandKitStore, type BrandKit, type BrandTokens, type StyleVariant } from "./brandkit";
import { store } from "@/lib/integration-hub/storage";
import { adjustL, hexToRgb, hueShift, rgbToHsl, withAlpha } from "./color";

// ── Nhóm hệ theo ngành (id phải tồn tại trong catalog) ──
const FINANCE_RE = /bank|financ|tài chính|ngân hàng|fintech|chứng khoán|securit|invest|đầu tư|bảo hiểm|insur|tín dụng|\bvay\b|\bloan/i;
const EDITORIAL_RE = /editorial|báo|tin tức|truyền thông|media|content|xuất bản|publish|giáo dục|education/i;
const TECH_RE = /tech|công nghệ|software|phần mềm|\bai\b|startup|saas|dev/i;
const LUXURY_RE = /luxury|cao cấp|bất động sản|real estate|premium|du lịch|travel|spa|khách sạn|hotel/i;

// ── PHASE 0 — COLOR SYSTEM (palette CHỐT 21/06/2026): tông SÁNG/CAM theo gu clip
//    mẫu creator. NỀN luôn SÁNG/ấm cố định; chỉ ACCENT đổi theo ngành để mỗi chủ đề
//    có chất riêng mà vẫn cùng 1 ngôn ngữ hình ảnh (hết "C1 sáng, C2/C3 tối trầm").
//    BrandKit là NGUỒN MÀU DUY NHẤT — mọi composition đọc token từ đây. ──
const BRIGHT = {
  bg1: "#faf7f2",   // nền sáng chủ đạo
  bg2: "#f4ede1",   // nền ấm phụ (deriveTokens cũng tự phái sinh ~khít từ bg1)
  card: "#ffffff",  // paper
  ink: "#1a1612",   // mực chữ
  sub: "#4a4540",   // mực phụ (đọc rõ trên nền sáng)
  line: "#e6ddd0",  // đường kẻ
};
const ACCENT_ORANGE = "#ff5a1f";  // cam brand — DEFAULT
const ACCENT_ORANGE2 = "#d63e0a"; // cam đậm

// Accent phụ LINH HOẠT theo content (nền vẫn sáng). Default = cam brand.
const ACCENT_BY_INDUSTRY: { test: RegExp; accent: string; accent2: string }[] = [
  { test: FINANCE_RE, accent: ACCENT_ORANGE, accent2: ACCENT_ORANGE2 }, // tài chính = cam brand (gu mẫu)
  { test: TECH_RE, accent: "#2563eb", accent2: "#7c3aed" },             // công nghệ = dương → tím
  { test: EDITORIAL_RE, accent: "#d97706", accent2: ACCENT_ORANGE },    // editorial = hổ phách → cam
  { test: LUXURY_RE, accent: "#7c3aed", accent2: "#2563eb" },           // cao cấp = tím → dương
];

// "House" design system tông sáng/cam — anchor để deriveTokens phái sinh nguyên bộ
// (tái dùng công thức elevation/glow LIGHT đã verify). Dark vẫn là VARIANT chọn được
// qua UI (rebuildFromSystem với hệ dark trong catalog, vd trading-terminal/linear-app) —
// Phase 0 chỉ BỎ ÉP finance=dark, KHÔNG xoá khả năng dùng dark.
function houseSystem(accent: string, accent2: string): DesignSystemSummary {
  return {
    id: "bright-orange",
    name: "Bright Orange (house)",
    category: "House",
    blurb: "Tông sáng/ấm + cam brand theo gu creator mẫu — nền sáng cố định, accent theo ngành.",
    mode: "light",
    palette: {
      // bg2 (#f4ede1) do deriveTokens tự phái sinh từ bg (~#f3ede2, khít palette chốt)
      // → giữ DesignSystemSummary.palette nguyên (không đụng type catalog auto-gen).
      bg: BRIGHT.bg1, surface: BRIGHT.card,
      fg: BRIGHT.ink, muted: BRIGHT.sub, border: BRIGHT.line,
      accent, accent2, accentOn: "#ffffff",
    },
  };
}

// Skin bố cục theo hệ — editorial serif-vibe, poster đậm, classic như hiện tại.
const STYLE_BY_SYSTEM: Record<string, StyleVariant> = {
  editorial: "editorial",
  "warm-editorial": "editorial",
  publication: "editorial",
  premium: "editorial",
  theverge: "poster",
  binance: "poster",
  wise: "poster",
  mastercard: "poster",
};

/** Accent quá nhạt trên nền sáng (vd neon #9fe870) → kéo tối lại cho đủ tương phản chữ. */
function ensureAccentContrast(accent: string, mode: "light" | "dark"): string {
  const rgb = hexToRgb(accent);
  if (!rgb) return accent;
  const { l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (mode === "light" && l > 0.62) return adjustL(accent, 0.48 - l); // kéo về ~0.48 (neon wise/binance đọc rõ trên card sáng)
  if (mode === "dark" && l < 0.35) return adjustL(accent, 0.55 - l); // nhạt quá tối trên dark
  return accent;
}

/** Phái sinh trọn bộ BrandTokens từ 1 design system. */
export function deriveTokens(sys: DesignSystemSummary, styleVariant: StyleVariant): BrandTokens {
  const mode = sys.mode;
  const bg = sys.palette.bg || (mode === "dark" ? "#0f0d17" : "#f4f0fc");
  const accent = ensureAccentContrast(sys.palette.accent || "#7c3aed", mode);
  const accent2 = sys.palette.accent2 || adjustL(hueShift(accent, 35), 0.06);
  const ink = sys.palette.fg || (mode === "dark" ? "#f4f2fb" : "#1e1b2e");
  const sub = sys.palette.muted || (mode === "dark" ? "#a39db8" : "#6b6480");

  if (mode === "dark") {
    const glow = withAlpha(accent, 0.3);
    return {
      mode,
      bg1: bg,
      bg2: adjustL(bg, 0.035),
      accent,
      accent2,
      ink,
      sub,
      card: adjustL(bg, 0.055),
      glow,
      cardBorder: "rgba(255,255,255,0.09)",
      gridDot: "rgba(255,255,255,0.05)",
      elev1: "0 2px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
      elev2: `0 10px 34px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06), 0 0 46px ${glow}`,
      good: "#34d399",
      bad: "#f87171",
      warn: "#fbbf24",
      styleVariant,
      fontDisplay: sys.fontDisplay,
      fontBody: sys.fontBody,
    };
  }
  const glow = withAlpha(accent, 0.16);
  return {
    mode,
    bg1: bg,
    bg2: adjustL(bg, -0.045),
    accent,
    accent2,
    ink,
    sub,
    card: sys.palette.surface || "#ffffff",
    glow,
    cardBorder: withAlpha(accent, 0.1),
    gridDot: withAlpha(accent, 0.06),
    elev1: `0 2px 6px ${withAlpha(ink, 0.05)}, 0 16px 42px ${withAlpha(ink, 0.13)}`,
    elev2: `0 4px 12px ${withAlpha(ink, 0.1)}, 0 24px 58px ${glow}`,
    good: "#16a34a",
    bad: "#dc2626",
    warn: "#d97706",
    styleVariant,
    fontDisplay: sys.fontDisplay,
    fontBody: sys.fontBody,
  };
}

/** Chọn design system + direction cho 1 profile (deterministic theo industry).
 *  Phase 0: default tông SÁNG/CAM (house) — nền sáng cố định, accent đổi theo ngành.
 *  Cùng ngành → cùng kit (re-render ổn định). Dark = variant qua rebuildFromSystem. */
export function chooseSystem(profile: { id: string; industry?: string }): {
  sys: DesignSystemSummary;
  directionId: string;
} {
  const industry = profile.industry || "";
  const pick = ACCENT_BY_INDUSTRY.find((a) => a.test.test(industry));
  return {
    sys: houseSystem(pick?.accent || ACCENT_ORANGE, pick?.accent2 || ACCENT_ORANGE2),
    directionId: "human-approachable",
  };
}

/** Sinh BrandKit cho profile (không lưu — caller quyết). */
export function generateBrandKit(profile: { id: string; name?: string; industry?: string }): BrandKit {
  const { sys, directionId } = chooseSystem(profile);
  const styleVariant = STYLE_BY_SYSTEM[sys.id] || "classic";
  const tokens = deriveTokens(sys, styleVariant);
  return {
    profileId: profile.id,
    systemId: sys.id,
    directionId,
    tokens,
    rationale: `Ngành "${profile.industry || "chung"}" → hệ ${sys.name} (${sys.mode}, ${sys.category}): ${sys.blurb || "gu đồng bộ thương hiệu"}. Skin: ${styleVariant}.`,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Lấy BrandKit của profile — chưa có thì Director tự sinh + lưu (idempotent).
 * Kit overridden (Tommy sửa tay) được giữ nguyên.
 */
export async function getOrCreateBrandKit(profileId: string): Promise<BrandKit | null> {
  const existing = await brandKitStore.get(profileId);
  if (existing) return existing;
  const profile = await store.getProfile(profileId);
  if (!profile) return null;
  const kit = generateBrandKit(profile);
  await brandKitStore.set(kit);
  return kit;
}

/** Sinh lại kit từ 1 hệ CHỈ ĐỊNH (override chọn tay trong UI) + giữ cờ overridden. */
export function rebuildFromSystem(profileId: string, systemId: string): BrandKit | null {
  const sys = DESIGN_SYSTEMS.find((s) => s.id === systemId);
  if (!sys) return null;
  const styleVariant = STYLE_BY_SYSTEM[sys.id] || "classic";
  return {
    profileId,
    systemId: sys.id,
    tokens: deriveTokens(sys, styleVariant),
    rationale: `Chọn tay hệ ${sys.name} (${sys.mode}, ${sys.category}).`,
    overridden: true,
    generatedAt: new Date().toISOString(),
  };
}
