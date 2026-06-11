/**
 * Catalog design-system — SINH TỰ ĐỘNG từ thư viện vendor (đừng sửa tay; sửa _vendor_gen.mjs rồi chạy lại).
 *
 * Nguồn: nexu-io/open-design (Apache-2.0) — design-systems/<id>/{DESIGN.md,tokens.css}
 * Commit nguồn: 1eac8fcabf20bbc585b8140f1cb6b92bd86f5876 — xem THIRD_PARTY.md.
 * DESIGN.md đầy đủ của từng hệ nằm cạnh file này trong systems/<id>/ (tư liệu cho Design Director).
 */

export type DesignSystemSummary = {
  id: string;
  name: string;
  category: string;
  /** 1 câu mô tả gu (lấy từ DESIGN.md) */
  blurb: string;
  mode: "light" | "dark";
  palette: {
    bg?: string; surface?: string; fg?: string; muted?: string; border?: string;
    accent?: string; accentOn?: string; accent2?: string;
  };
  fontDisplay?: string;
  fontBody?: string;
};

export const DESIGN_SYSTEMS: DesignSystemSummary[] = [
  {
    "id": "stripe",
    "name": "Stripe",
    "category": "Fintech & Crypto",
    "blurb": "Payment infrastructure. Signature purple gradients, weight-300 elegance.",
    "mode": "light",
    "palette": {
      "bg": "#ffffff",
      "surface": "#ffffff",
      "fg": "#061b31",
      "muted": "#64748d",
      "border": "#e5edf5",
      "accent": "#533afd",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "\"sohne-var\", \"Söhne\", \"Sohne\", \"SF Pro Display\", -apple-system, BlinkMacSystemFont, system-ui, \"Helvetica Neue\", Arial, sans-serif",
    "fontBody": "\"sohne-var\", \"Söhne\", \"Sohne\", \"SF Pro Display\", -apple-system, BlinkMacSystemFont, system-ui, \"Helvetica Neue\", Arial, sans-serif"
  },
  {
    "id": "revolut",
    "name": "Revolut",
    "category": "Fintech & Crypto",
    "blurb": "Digital banking. Sleek dark interface, gradient cards, fintech precision.",
    "mode": "light",
    "palette": {
      "bg": "#f7f8fb",
      "surface": "#ffffff",
      "fg": "#111827",
      "muted": "#64748b",
      "border": "#dbe3ef",
      "accent": "#0666eb",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "\"Inter\", system-ui, sans-serif",
    "fontBody": "\"Inter\", system-ui, sans-serif"
  },
  {
    "id": "wise",
    "name": "Wise",
    "category": "Fintech & Crypto",
    "blurb": "Money transfer. Bright green accent, friendly and clear.",
    "mode": "light",
    "palette": {
      "bg": "#ffffff",
      "surface": "#e8ebe6",
      "fg": "#0e0f0c",
      "muted": "#868685",
      "border": "rgba(14, 15, 12, 0.12)",
      "accent": "#9fe870",
      "accentOn": "#163300"
    },
    "fontDisplay": "\"Wise Sans\", Inter, ui-sans-serif, system-ui, sans-serif",
    "fontBody": "Inter, Helvetica, Arial, ui-sans-serif, sans-serif"
  },
  {
    "id": "coinbase",
    "name": "Coinbase",
    "category": "Fintech & Crypto",
    "blurb": "Crypto exchange. Clean blue identity, trust-focused, institutional feel.",
    "mode": "light",
    "palette": {
      "bg": "#ffffff",
      "surface": "#eef0f3",
      "fg": "#0a0b0d",
      "muted": "#5b616e",
      "border": "rgba(91, 97, 110, 0.2)",
      "accent": "#0052ff",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "\"CoinbaseDisplay\", \"Coinbase Display\", \"Inter\", ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Arial, sans-serif",
    "fontBody": "\"CoinbaseText\", \"CoinbaseSans\", \"Coinbase Sans\", \"Inter\", ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Arial, sans-serif"
  },
  {
    "id": "binance",
    "name": "Binance.US",
    "category": "Fintech & Crypto",
    "blurb": "Crypto exchange. Bold yellow accent on monochrome, trading-floor urgency.",
    "mode": "light",
    "palette": {
      "bg": "#ffffff",
      "surface": "#ffffff",
      "fg": "#1e2026",
      "muted": "#848e9c",
      "border": "#e6e8ea",
      "accent": "#f0b90b",
      "accentOn": "#1e2026"
    },
    "fontDisplay": "BinancePlex, Arial, sans-serif",
    "fontBody": "BinancePlex, Arial, sans-serif"
  },
  {
    "id": "mastercard",
    "name": "Mastercard",
    "category": "Fintech & Crypto",
    "blurb": "Global payments network. Warm cream canvas, orbital pill shapes, editorial warmth.",
    "mode": "light",
    "palette": {
      "bg": "#f3f0ee",
      "surface": "#fcfbfa",
      "fg": "#141413",
      "muted": "#696969",
      "border": "#d1cdc7",
      "accent": "#cf4500",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "\"MarkForMC\", \"Sofia Sans\", Arial, sans-serif",
    "fontBody": "\"MarkForMC\", \"Sofia Sans\", Arial, sans-serif"
  },
  {
    "id": "trading-terminal",
    "name": "Trading Terminal Design System",
    "category": "Themed & Unique",
    "blurb": "Bloomberg-style financial trading terminal. Dark-only, data-dense, cyan/coral buy/sell signals. Everything readable at a glance from two meters away.",
    "mode": "dark",
    "palette": {
      "bg": "#070b12",
      "surface": "#101826",
      "fg": "#f8fafc",
      "muted": "#8492a6",
      "border": "#263246",
      "accent": "#38bdf8",
      "accentOn": "#03111a"
    },
    "fontDisplay": "Inter, system-ui, sans-serif",
    "fontBody": "Inter, system-ui, sans-serif"
  },
  {
    "id": "editorial",
    "name": "Editorial",
    "category": "Creative & Artistic",
    "blurb": "Magazine-inspired editorial layout with refined serif typography, structured grids, and elegant reading experiences.",
    "mode": "light",
    "palette": {
      "bg": "#fbf7f0",
      "surface": "#fffdf8",
      "fg": "#1f1a16",
      "muted": "#7d7168",
      "border": "#ded3c5",
      "accent": "#9a5a2f",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "Georgia, \"Times New Roman\", serif",
    "fontBody": "\"Source Serif Pro\", Georgia, serif"
  },
  {
    "id": "warm-editorial",
    "name": "Warm Editorial",
    "category": "Starter",
    "blurb": "A serif-led magazine aesthetic. Terracotta accent on warm off-white paper —",
    "mode": "light",
    "palette": {
      "bg": "#fbf6ee",
      "surface": "#fffdf8",
      "fg": "#201914",
      "muted": "#7a6d63",
      "border": "#ded2c3",
      "accent": "#9b5b32",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "Georgia, \"Times New Roman\", serif",
    "fontBody": "Inter, system-ui, sans-serif"
  },
  {
    "id": "publication",
    "name": "Publication",
    "category": "Creative & Artistic",
    "blurb": "Print-inspired visual language for books, magazines, and reports with editorial grids and expressive typography.",
    "mode": "light",
    "palette": {
      "bg": "#ffffff",
      "surface": "#f6f6f6",
      "fg": "#0b0b0b",
      "muted": "#666666",
      "border": "#d6d6d6",
      "accent": "#c1121f",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "\"Franklin Gothic\", Arial, sans-serif",
    "fontBody": "Georgia, \"Times New Roman\", serif"
  },
  {
    "id": "linear-app",
    "name": "Linear",
    "category": "Productivity & SaaS",
    "blurb": "Project management. Ultra-minimal, precise, purple accent.",
    "mode": "dark",
    "palette": {
      "bg": "#08090a",
      "surface": "#191a1b",
      "fg": "#f7f8f8",
      "muted": "#8a8f98",
      "border": "rgba(255, 255, 255, 0.08)",
      "accent": "#5e6ad2",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "\"Inter Variable\", \"Inter\", \"SF Pro Display\", -apple-system, system-ui, \"Segoe UI\", Roboto, sans-serif",
    "fontBody": "\"Inter Variable\", \"Inter\", \"SF Pro Display\", -apple-system, system-ui, \"Segoe UI\", Roboto, sans-serif"
  },
  {
    "id": "vercel",
    "name": "Vercel",
    "category": "Developer Tools",
    "blurb": "Frontend deployment. Black and white precision, Geist font.",
    "mode": "light",
    "palette": {
      "bg": "#ffffff",
      "surface": "#ffffff",
      "fg": "#171717",
      "muted": "#666666",
      "border": "rgba(0, 0, 0, 0.08)",
      "accent": "#0070f3",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "\"Geist\", \"Geist Sans\", -apple-system, \"Segoe UI\", Arial, sans-serif",
    "fontBody": "\"Geist\", \"Geist Sans\", -apple-system, \"Segoe UI\", Arial, sans-serif"
  },
  {
    "id": "premium",
    "name": "Premium",
    "category": "Professional & Corporate",
    "blurb": "Apple-inspired premium aesthetic with precise spacing, modern typography, and a refined, polished visual language.",
    "mode": "light",
    "palette": {
      "bg": "#faf8f4",
      "surface": "#ffffff",
      "fg": "#1c1b19",
      "muted": "#746d63",
      "border": "#ded6c9",
      "accent": "#a06a3b",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "\"Canela\", Georgia, serif",
    "fontBody": "Inter, system-ui, sans-serif"
  },
  {
    "id": "professional",
    "name": "Professional",
    "category": "Professional & Corporate",
    "blurb": "Polished, business-ready design with modern typography, structured layouts, and a trustworthy visual identity.",
    "mode": "light",
    "palette": {
      "bg": "#f5f8ff",
      "surface": "#ffffff",
      "fg": "#101828",
      "muted": "#667085",
      "border": "#d7e0ef",
      "accent": "#2563eb",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "Inter, system-ui, sans-serif",
    "fontBody": "Inter, system-ui, sans-serif"
  },
  {
    "id": "theverge",
    "name": "The Verge",
    "category": "Media & Consumer",
    "blurb": "Tech editorial media. Acid-mint and ultraviolet accents, Manuka display, rave-flyer story tiles.",
    "mode": "dark",
    "palette": {
      "bg": "#050505",
      "surface": "#111111",
      "fg": "#ffffff",
      "muted": "#9ca3af",
      "border": "#2b2b2b",
      "accent": "#ff00a8",
      "accentOn": "#ffffff"
    },
    "fontDisplay": "\"PolySans\", \"Helvetica Neue\", Arial, sans-serif",
    "fontBody": "\"Inter\", \"Helvetica Neue\", Arial, sans-serif"
  }
];
