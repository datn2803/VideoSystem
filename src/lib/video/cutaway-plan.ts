// C4 AUTO-EDITOR — tính điểm chèn cutaway b-roll. TÁCH RIÊNG (PURE, không import singleton) → unit-test
// offline như captions.ts. Chỉ phụ thuộc shape {text,start,end} (Whisper word) — erased lúc chạy.

export type Cutaway = { start: number; dur: number };
type WordLike = { text?: string; start: number; end: number };

/**
 * planCutaways — từ Whisper words → cutaway {start,dur} chèn vào timeline C1.
 * Đặt cutaway ~cutDur tại RANH GIỚI CÂU (gap >0.4s hoặc dấu kết câu), GIÃN cách (minGapSec) để mặt
 * C1 vẫn hiện GIỮA các cutaway → jump-cut kiểu Submagic. Cap tổng cutaway ≤ maxFrac timeline. Không
 * Whisper (null/rỗng) → chia ĐỀU. Luôn chừa đầu (establish) + cuối (outro). PURE.
 */
export function planCutaways(
  words: WordLike[] | null,
  totalDur: number,
  opts: { startAfter?: number; cutDur?: number; minGapSec?: number; maxFrac?: number; endBuffer?: number } = {}
): Cutaway[] {
  const startAfter = opts.startAfter ?? 1.5; // chừa đầu cho mặt C1 establish
  const cutDur = opts.cutDur ?? 1.8;
  const minGapSec = opts.minGapSec ?? 3.0; // khoảng mặt C1 GIỮA 2 cutaway
  const maxFrac = opts.maxFrac ?? 0.45; // tổng cutaway tối đa 45% timeline
  const endBuffer = opts.endBuffer ?? 0.6; // chừa cuối
  const usableEnd = totalDur - endBuffer;
  if (!(Number.isFinite(totalDur) && usableEnd > startAfter + cutDur)) return [];

  // Ranh giới câu từ Whisper (else fallback chia đều).
  const boundaries: number[] = [];
  if (words && words.length) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const next = words[i + 1];
      const gap = next ? next.start - w.end : 99;
      const endsSentence = /[.!?…,]$/.test(w.text || "");
      if (gap > 0.4 || endsSentence) boundaries.push(next ? next.start : w.end);
    }
  }
  if (!boundaries.length) {
    for (let t = startAfter + minGapSec; t + cutDur < usableEnd; t += cutDur + minGapSec) boundaries.push(t);
  }

  const r2 = (x: number) => Math.round(x * 100) / 100;
  const segs: Cutaway[] = [];
  let lastEnd = startAfter;
  let coverage = 0;
  for (const b of boundaries) {
    if (!(b >= startAfter)) continue;
    if (b - lastEnd < minGapSec) continue; // đảm bảo mặt C1 hiện giữa các cutaway
    if (b + cutDur > usableEnd) break;
    segs.push({ start: r2(b), dur: cutDur });
    lastEnd = b + cutDur;
    coverage += cutDur;
    if (coverage >= totalDur * maxFrac) break;
  }
  return segs;
}
