// Script vendor 1 lần (Phase 0): copy design-systems từ open-design + sinh catalog.ts.
// Chạy: node scripts/vendor-design-catalog.mjs  (file _* đã gitignore — không commit script này)
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/Admin/VideoSystem/_vendor_src/open-design/design-systems";
const DST = path.resolve("src/design/library/systems");
const IDS = [
  "stripe", "revolut", "wise", "coinbase", "binance", "mastercard", "trading-terminal",
  "editorial", "warm-editorial", "publication", "linear-app", "vercel", "premium",
  "professional", "theverge",
];

// Trích biến --x: value; đầu tiên trong tokens.css
function cssVar(css, name) {
  const m = css.match(new RegExp(`^\\s*${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`, "m"));
  return m ? m[1].replace(/\s+/g, " ").trim() : undefined;
}

// Mô tả ngắn từ DESIGN.md: dòng "> Category:" + dòng mô tả ngay sau
function summarize(md) {
  const lines = md.split(/\r?\n/);
  let category = "", blurb = "";
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const l = lines[i].trim();
    if (l.startsWith("> Category:")) category = l.replace("> Category:", "").trim();
    else if (l.startsWith(">") && l.length > 4 && !blurb) blurb = l.replace(/^>\s*/, "").trim();
  }
  return { category, blurb };
}

fs.mkdirSync(DST, { recursive: true });
const entries = [];
for (const id of IDS) {
  const sdir = path.join(SRC, id);
  const css = fs.readFileSync(path.join(sdir, "tokens.css"), "utf8");
  const md = fs.readFileSync(path.join(sdir, "DESIGN.md"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(sdir, "manifest.json"), "utf8"));
  const ddir = path.join(DST, id);
  fs.mkdirSync(ddir, { recursive: true });
  fs.copyFileSync(path.join(sdir, "DESIGN.md"), path.join(ddir, "DESIGN.md"));
  fs.copyFileSync(path.join(sdir, "tokens.css"), path.join(ddir, "tokens.css"));

  const { category, blurb } = summarize(md);
  const pal = {
    bg: cssVar(css, "--bg"),
    surface: cssVar(css, "--surface"),
    fg: cssVar(css, "--fg"),
    muted: cssVar(css, "--muted"),
    border: cssVar(css, "--border"),
    accent: cssVar(css, "--accent"),
    accentOn: cssVar(css, "--accent-on"),
    accent2: cssVar(css, "--accent-2") || cssVar(css, "--accent-soft") || cssVar(css, "--accent-2-soft"),
  };
  const fontDisplay = cssVar(css, "--font-display") || cssVar(css, "--display");
  const fontBody = cssVar(css, "--font-body") || cssVar(css, "--font-sans") || cssVar(css, "--body");
  // Mode: nền tối nếu độ sáng kênh R của bg thấp (hex) — đủ tốt cho catalog
  const hex = (pal.bg || "#ffffff").replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) || 255;
  const mode = r < 100 ? "dark" : "light";
  entries.push({ id, name: manifest.name || id, category: category || manifest.category || "", blurb, mode, palette: pal, fontDisplay, fontBody });
}

const header = `/**
 * Catalog design-system — SINH TỰ ĐỘNG từ thư viện vendor (đừng sửa tay; sửa scripts/vendor-design-catalog.mjs rồi chạy lại).
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

export const DESIGN_SYSTEMS: DesignSystemSummary[] = `;

fs.writeFileSync(
  path.resolve("src/design/library/catalog.ts"),
  header + JSON.stringify(entries, null, 2) + ";\n",
  "utf8"
);
console.log("OK — vendored", entries.length, "systems; catalog.ts written");
