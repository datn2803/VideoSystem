/**
 * Tiện ích màu cho Design Director — thuần hàm, $0, không phụ thuộc browser.
 *
 * Gồm OKLch→sRGB hex (công thức OKLab chuẩn của Björn Ottosson — cùng phương
 * pháp open-design dùng "kỷ luật palette OKLch") + chỉnh sáng/tối/xoay hue qua HSL.
 */

// ── hex ↔ rgb ──
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

// ── rgb ↔ hsl (h 0-360, s/l 0-1) ──
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/** Tăng/giảm lightness HSL theo delta tuyệt đối (vd +0.04). Trả hex. */
export function adjustL(hex: string, delta: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const { r, g, b } = hslToRgb(h, s, Math.max(0, Math.min(1, l + delta)));
  return rgbToHex(r, g, b);
}

/** Xoay hue (độ) — dùng đẻ accent2 hài hoà từ accent. */
export function hueShift(hex: string, deg: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const { r, g, b } = hslToRgb(h + deg, s, l);
  return rgbToHex(r, g, b);
}

/** hex → chuỗi rgba(r,g,b,a) — cho glow/border mờ. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${alpha})`;
}

// ── OKLch → sRGB hex (OKLab, Björn Ottosson) ──
function gamma(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function oklchToHex(l: number, c: number, h: number): string {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ ** 3, m3 = m_ ** 3, s3 = s_ ** 3;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  return rgbToHex(gamma(clamp01(r)) * 255, gamma(clamp01(g)) * 255, gamma(clamp01(bb)) * 255);
}

/** Parse chuỗi CSS "oklch(58% 0.18 255)" → hex (sai cú pháp → null). */
export function parseOklchToHex(s: string): string | null {
  const m = String(s).trim().match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\s*\)$/i);
  if (!m) return null;
  let l = parseFloat(m[1]);
  if (/%/.test(s)) l /= 100;
  return oklchToHex(l, parseFloat(m[2]), parseFloat(m[3]));
}
