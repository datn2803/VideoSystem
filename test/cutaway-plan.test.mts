/**
 * Unit-test planCutaways (C4 auto-editor) — PURE, offline (không import singleton).
 * Chạy qua test/run.mjs (auto-discover *.test.mts).
 */
import { planCutaways } from "../src/lib/video/cutaway-plan.ts";
import { eq, ok, done } from "./assert.mjs";

// ── 1) Không Whisper → chia ĐỀU, đoạn nằm trong biên, giãn cách, không chồng ──
{
  const segs = planCutaways(null, 30);
  ok(segs.length > 0, "không words → vẫn có cutaway (chia đều)");
  ok(segs.every((s) => s.start >= 1.5), "mọi cutaway bắt đầu sau startAfter (chừa đầu cho mặt C1)");
  ok(segs.every((s) => s.start + s.dur <= 30 - 0.6 + 1e-9), "mọi cutaway kết thúc trước endBuffer (chừa cuối)");
  // không chồng + giãn cách >= minGap giữa end trước và start sau
  let okGap = true;
  for (let i = 1; i < segs.length; i++) if (segs[i].start - (segs[i - 1].start + segs[i - 1].dur) < 3.0 - 1e-9) okGap = false;
  ok(okGap, "các cutaway giãn cách >= minGap (mặt C1 hiện giữa)");
  const coverage = segs.reduce((s, x) => s + x.dur, 0);
  ok(coverage <= 30 * 0.45 + 1.8, "tổng cutaway không vượt ~maxFrac timeline");
}

// ── 2) Video quá ngắn → KHÔNG cutaway (chỉ nền C1) ──
{
  eq(planCutaways(null, 2).length, 0, "duration quá ngắn → 0 cutaway");
  eq(planCutaways(null, 0).length, 0, "duration 0 → 0 cutaway");
  eq(planCutaways(null, NaN).length, 0, "duration NaN → 0 cutaway");
}

// ── 3) Có Whisper words → cutaway bám RANH GIỚI CÂU (gap >0.4s hoặc dấu kết câu) ──
{
  // 3 câu, mỗi câu vài từ; gap lớn giữa câu → ranh giới rõ.
  const words = [
    { text: "Báo", start: 0.0, end: 0.4 },
    { text: "cáo", start: 0.4, end: 0.8 },
    { text: "tài.", start: 0.9, end: 1.4 }, // hết câu 1 (~1.4)
    { text: "Nhập", start: 5.0, end: 5.4 }, // gap lớn → ranh giới ~5.0
    { text: "liệu", start: 5.4, end: 5.8 },
    { text: "tay.", start: 5.9, end: 6.4 },
    { text: "Sai", start: 10.0, end: 10.4 }, // ranh giới ~10.0
    { text: "số", start: 10.4, end: 10.8 },
    { text: "tiền.", start: 10.9, end: 11.6 },
  ];
  const segs = planCutaways(words, 18);
  ok(segs.length >= 2, "Whisper boundaries → ít nhất 2 cutaway");
  ok(segs.every((s) => s.start >= 1.5 && s.start + s.dur <= 18 - 0.6 + 1e-9), "cutaway trong biên");
  // cutaway start phải gần 1 ranh giới câu (5.0 hoặc 10.0) — KHÔNG đặt giữa câu lung tung
  const boundaries = [5.0, 10.0];
  ok(segs.every((s) => boundaries.some((b) => Math.abs(s.start - b) < 0.6)), "cutaway snap vào ranh giới câu");
}

// ── 4) maxFrac giới hạn số cutaway (timeline dài cũng không phủ kín mặt C1) ──
{
  const segs = planCutaways(null, 60, { maxFrac: 0.2, cutDur: 1.5, minGapSec: 2 });
  const coverage = segs.reduce((s, x) => s + x.dur, 0);
  ok(coverage <= 60 * 0.2 + 1.5, "maxFrac=0.2 → tổng cutaway <= ~12s");
}

done("cutaway-plan");
