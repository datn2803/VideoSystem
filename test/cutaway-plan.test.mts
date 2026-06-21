/**
 * Unit-test planCutaways (C4 auto-editor — PHASE 2 nhịp dày) — PURE, offline.
 * Chạy qua test/run.mjs (auto-discover *.test.mts).
 */
import { planCutaways } from "../src/lib/video/cutaway-plan.ts";
import { eq, ok, done } from "./assert.mjs";

// helper: kiểm biên + không chồng + giãn cách + không có khoảng mặt C1 quá dài
function checkValid(segs: { start: number; dur: number }[], totalDur: number, minGap: number, startAfter: number, endBuffer: number, maxFaceGap: number) {
  for (const s of segs) {
    ok(s.start >= startAfter - 1e-6, `start ${s.start} >= startAfter`);
    ok(s.start + s.dur <= totalDur - endBuffer + 1e-6, `end ${s.start + s.dur} <= usableEnd`);
  }
  for (let i = 1; i < segs.length; i++) {
    ok(segs[i].start >= segs[i - 1].start + segs[i - 1].dur - 1e-6, "cutaway KHÔNG chồng nhau");
    ok(segs[i].start - (segs[i - 1].start + segs[i - 1].dur) >= minGap - 0.05, "giãn cách >= minGap (mặt C1 hiện giữa)");
  }
  // khoảng mặt C1 (đầu→cutaway1, giữa các cutaway, cutaway cuối→cuối) KHÔNG quá maxFaceGap
  let prevEnd = startAfter;
  for (let i = 0; i <= segs.length; i++) {
    const nextStart = i < segs.length ? segs[i].start : totalDur - endBuffer;
    ok(nextStart - prevEnd <= maxFaceGap + 0.6, `mặt C1 không đứng > maxFaceGap (gap ${(nextStart - prevEnd).toFixed(1)}s)`);
    prevEnd = i < segs.length ? segs[i].start + segs[i].dur : prevEnd;
  }
}

// ── 1) Không Whisper (dur 30) → grid đều + fill; biên/chồng/giãn/maxFaceGap OK ──
{
  const segs = planCutaways(null, 30);
  ok(segs.length >= 5, `không words → nhịp dày (${segs.length} cutaway cho 30s)`);
  checkValid(segs, 30, 1.8, 1.2, 0.5, 6.0);
  const coverage = segs.reduce((s, x) => s + x.dur, 0);
  ok(coverage <= 30 * 0.7 + 1e-6, "tổng cutaway <= hardCap (mặt C1 vẫn là chính)");
}

// ── 2) Video quá ngắn → KHÔNG cutaway ──
{
  eq(planCutaways(null, 2).length, 0, "duration quá ngắn → 0 cutaway");
  eq(planCutaways(null, 0).length, 0, "duration 0 → 0 cutaway");
  eq(planCutaways(null, NaN).length, 0, "duration NaN → 0 cutaway");
}

// ── 3) PHASE 2 DÀY hơn phase 1 (cùng video) ──
{
  const p2 = planCutaways(null, 60); // defaults phase 2
  const p1 = planCutaways(null, 60, { cutDur: 1.8, minGapSec: 3.0, maxFrac: 0.45, startAfter: 1.5, endBuffer: 0.6, maxFaceGapSec: 999 });
  ok(p2.length > p1.length, `phase2 (${p2.length}) DÀY hơn phase1 (${p1.length}) cho 60s`);
  checkValid(p2, 60, 1.8, 1.2, 0.5, 6.0);
}

// ── 4) maxFaceGap GUARANTEE: video dài, câu thưa → vẫn không để mặt C1 đứng > ~6s ──
{
  // chỉ 2 ranh giới câu trong 40s (rất thưa) → grid + fill phải bù.
  const words = [
    { text: "Mở", start: 0.2, end: 0.5 },
    { text: "đầu.", start: 0.6, end: 1.0 },
    { text: "Giữa", start: 20.0, end: 20.4 },
    { text: "bài.", start: 20.5, end: 21.0 },
  ];
  const segs = planCutaways(words, 40);
  checkValid(segs, 40, 1.8, 1.2, 0.5, 6.0);
  ok(segs.length >= 6, `câu thưa nhưng fill vẫn dày (${segs.length} cutaway/40s)`);
}

// ── 5) Whisper words dày → cutaway bám ranh giới câu, hợp lệ ──
{
  const words = [];
  for (let i = 0; i < 30; i++) words.push({ text: i % 4 === 3 ? "câu." : "từ", start: i * 0.6, end: i * 0.6 + 0.5 });
  const segs = planCutaways(words, 18);
  ok(segs.length >= 3, "Whisper dày → nhiều cutaway");
  checkValid(segs, 18, 1.8, 1.2, 0.5, 6.0);
}

done("cutaway-plan");
