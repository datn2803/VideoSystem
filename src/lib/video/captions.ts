/**
 * Caption karaoke C3 — FORCED ALIGNMENT (A1). Tách khỏi c3-animation (deps nặng) → unit-test được.
 * Chỉ phụ thuộc `type Word` (erased lúc chạy) → THUẦN.
 */
import type { Word } from "@/lib/audio/whisper";

/** Gom thành phụ đề SYNC karaoke cho C3: JSON [{s,e,w:[{t,x}]}]. Ngắt câu theo dấu kết câu /
 *  ~7 từ / ~42 ký tự / khoảng lặng >0.55s. e câu = s câu sau (liền mạch).
 *
 *  FORCED ALIGNMENT (A1 — sửa lỗi caption sai chính tả): CHỮ luôn lấy từ READ-SCRIPT
 *  (`scriptText` — đúng dấu, có '%'); Whisper CHỈ dùng để CĂN GIỜ. Trước đây hiển thị thẳng
 *  `w.text` (Whisper phiên âm TTS tiếng Việt) → sai dấu ('tới'→'tối') + mất '%'. Nay:
 *  - Tokenize read-script (chữ chuẩn).
 *  - Có Whisper words → khớp token script ↔ Whisper word theo TỈ LỆ vị trí (nội suy khi lệch số
 *    lượng); hiển thị token SCRIPT, timestamp lấy từ Whisper word khớp. → karaoke vẫn sync, chữ ĐÚNG.
 *  - Whisper null (dryrun/lỗi) → chia đều read-script theo thời lượng (như cũ). */
export function buildCaptions(words: Word[] | null, total: number, scriptText?: string): string {
  type WT = { t: number; x: string; gap: number };
  const toks = (scriptText || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (toks.length === 0) return "";
  const W = (words || []).map((w) => ({ start: w.start, end: w.end })).filter((w) => Number.isFinite(w.start));
  let wlist: WT[];
  if (W.length > 0) {
    const M = W.length;
    const denom = Math.max(1, toks.length - 1);
    wlist = toks.map((x, i) => {
      const wi = M <= 1 ? 0 : Math.min(M - 1, Math.max(0, Math.round((i / denom) * (M - 1))));
      return { t: +W[wi].start.toFixed(2), x, gap: 0 };
    });
    for (let i = 0; i < wlist.length; i++) wlist[i].gap = i + 1 < wlist.length ? wlist[i + 1].t - wlist[i].t : 99;
  } else {
    const t0 = 0.3, t1 = Math.max(t0 + 1, total - 0.8);
    wlist = toks.map((x, i) => ({ t: +(t0 + (t1 - t0) * (i / Math.max(1, toks.length - 1))).toFixed(2), x, gap: 0 }));
  }
  if (wlist.length === 0) return "";
  type Ph = { s: number; e: number; w: { t: number; x: string }[] };
  const phrases: Ph[] = [];
  let cur: { t: number; x: string }[] = [];
  let chars = 0;
  const flush = () => { if (cur.length) { phrases.push({ s: cur[0].t, e: 0, w: cur }); cur = []; chars = 0; } };
  for (const wd of wlist) {
    cur.push({ t: wd.t, x: wd.x });
    chars += wd.x.length + 1;
    if (cur.length >= 7 || chars >= 42 || /[.!?…]$/.test(wd.x) || wd.gap > 0.55) flush();
  }
  flush();
  for (let i = 0; i < phrases.length; i++) phrases[i].e = i + 1 < phrases.length ? phrases[i + 1].s : Math.max(total, phrases[i].s + 1);
  return JSON.stringify(phrases);
}
