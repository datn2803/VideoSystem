// C4 AUTO-EDITOR — tính điểm chèn cutaway b-roll. TÁCH RIÊNG (PURE, không import singleton) → unit-test
// offline như captions.ts. Chỉ phụ thuộc shape {text,start,end} (Whisper word) — erased lúc chạy.

export type Cutaway = { start: number; dur: number };
type WordLike = { text?: string; start: number; end: number };

/**
 * planCutaways — từ Whisper words → cutaway {start,dur} chèn vào timeline C1.
 *
 * PHASE 2 — NHỊP DÀY (bám mẫu Submagic ~cắt 1.3-2s): cutaway NGẮN (cutDur) tại RANH GIỚI CÂU
 * (Whisper: gap >0.4s / dấu kết) ƯU TIÊN, bù thêm GRID đều; giãn tối thiểu minGapSec (mặt C1 hiện
 * giữa); cap tổng ≤ maxFrac. Sau đó FILL khoảng lặng: KHÔNG để mặt C1 đứng yên > maxFaceGapSec
 * (chèn thêm cutaway giữa khoảng trống) → năng lượng như mẫu. Không Whisper → grid đều. PURE.
 */
export function planCutaways(
  words: WordLike[] | null,
  totalDur: number,
  opts: {
    startAfter?: number;
    cutDur?: number;
    minGapSec?: number;
    maxFrac?: number;
    endBuffer?: number;
    maxFaceGapSec?: number;
  } = {}
): Cutaway[] {
  const startAfter = opts.startAfter ?? 1.2; // chừa đầu cho mặt C1 establish
  const cutDur = opts.cutDur ?? 1.5; // cutaway NGẮN (phase2: 1.8 → 1.5)
  const minGapSec = opts.minGapSec ?? 1.8; // mặt C1 GIỮA 2 cutaway (phase2: 3.0 → 1.8 → nhịp dày)
  const maxFrac = opts.maxFrac ?? 0.58; // tổng cutaway tối đa (phase2: 0.45 → 0.58)
  const endBuffer = opts.endBuffer ?? 0.5; // chừa cuối
  const maxFaceGapSec = opts.maxFaceGapSec ?? 6.0; // mặt C1 KHÔNG đứng yên lâu hơn ngần này
  const usableEnd = totalDur - endBuffer;
  if (!(Number.isFinite(totalDur) && usableEnd > startAfter + cutDur)) return [];

  const r2 = (x: number) => Math.round(x * 100) / 100;
  const maxCoverage = totalDur * maxFrac;
  const hardCap = totalDur * Math.min(0.7, maxFrac + 0.12); // trần cứng cho FILL (mặt C1 vẫn là chính)

  // Candidate starts: ranh giới câu Whisper (ưu tiên) ∪ grid đều (lấp khi câu thưa), sort tăng dần.
  const cands: number[] = [];
  if (words && words.length) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const next = words[i + 1];
      const gap = next ? next.start - w.end : 99;
      const endsSentence = /[.!?…,]$/.test(w.text || "");
      if (gap > 0.4 || endsSentence) cands.push(next ? next.start : w.end);
    }
  }
  for (let t = startAfter + minGapSec; t + cutDur < usableEnd; t += cutDur + minGapSec) cands.push(t);
  cands.sort((a, b) => a - b);

  const segs: { start: number; end: number }[] = []; // sorted theo start
  let coverage = 0;
  const lastEnd = () => (segs.length ? segs[segs.length - 1].end : startAfter);
  // Greedy: chọn candidate nếu vừa khít + giãn cách + chưa quá maxFrac.
  for (const c of cands) {
    if (coverage + cutDur > maxCoverage) break;
    const start = c;
    if (start < startAfter || start + cutDur > usableEnd) continue;
    if (start - lastEnd() < minGapSec) continue;
    segs.push({ start: r2(start), end: r2(start + cutDur) });
    coverage += cutDur;
  }

  // FILL khoảng lặng: nếu mặt C1 đứng > maxFaceGapSec (kể cả đầu/cuối) → chèn cutaway giữa khoảng,
  // tới khi hết khoảng dài hoặc chạm hardCap. (Guard chống vòng lặp vô hạn.)
  for (let guard = 0; guard < 300; guard++) {
    if (coverage + cutDur > hardCap) break;
    segs.sort((a, b) => a.start - b.start);
    let inserted = false;
    let prevEnd = startAfter;
    for (let i = 0; i <= segs.length; i++) {
      const nextStart = i < segs.length ? segs[i].start : usableEnd;
      const faceGap = nextStart - prevEnd;
      if (faceGap > maxFaceGapSec) {
        // đặt vào giữa khoảng, kẹp trong [prevEnd+minGap, nextStart-cutDur-(minGap nếu còn seg sau)].
        const tailGap = i < segs.length ? minGapSec : 0;
        const lo = prevEnd + minGapSec;
        const hi = nextStart - cutDur - tailGap;
        if (hi >= lo && lo >= startAfter && lo + cutDur <= usableEnd) {
          const start = r2((lo + hi) / 2);
          segs.push({ start, end: r2(start + cutDur) });
          coverage += cutDur;
          inserted = true;
          break;
        }
      }
      prevEnd = i < segs.length ? segs[i].end : prevEnd;
    }
    if (!inserted) break;
  }

  segs.sort((a, b) => a.start - b.start);
  return segs.map((s) => ({ start: s.start, dur: r2(s.end - s.start) }));
}
