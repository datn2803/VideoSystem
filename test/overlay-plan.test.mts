/**
 * Unit-test overlay-plan (C4 phase 2 — caption groups + keyword) — PURE, offline.
 */
import { groupWords, extractKeywords } from "../src/lib/video/overlay-plan.ts";
import { eq, ok, done } from "./assert.mjs";

// ── 1) groupWords: ngắt theo ≥5 từ / hết câu / khoảng lặng >0.4s ──
{
  const words = [
    { text: "Báo", start: 0.0, end: 0.3 },
    { text: "cáo", start: 0.3, end: 0.6 },
    { text: "tài.", start: 0.6, end: 1.0 }, // hết câu → flush
    { text: "Nhập", start: 1.1, end: 1.4 },
    { text: "liệu", start: 1.4, end: 1.7 },
    { text: "tay", start: 3.0, end: 3.3 }, // gap 1.3s > 0.4 → "tay" mở cụm mới? (flush TRƯỚC khi push? logic: push rồi check gap-to-next)
  ];
  const g = groupWords(words);
  ok(g.length >= 2, "tách >= 2 cụm (theo dấu câu + khoảng lặng)");
  eq(g[0].words.map((w) => w.text).join(" "), "Báo cáo tài.", "cụm 1 = tới hết câu");
  ok(g.every((x) => x.end >= x.start && Array.isArray(x.words) && x.words.length), "mỗi cụm có start<=end + words");
  // ≥5 từ → ngắt
  const many = Array.from({ length: 12 }, (_, i) => ({ text: "w" + i, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const gm = groupWords(many);
  ok(gm.every((x) => x.words.length <= 5), "không cụm nào > 5 từ");
  ok(gm.length >= 2, "12 từ → >= 2 cụm");
}

// ── 2) groupWords: rỗng / null → [] ; lọc word thiếu timing ──
{
  eq(groupWords(null).length, 0, "null → []");
  eq(groupWords([]).length, 0, "[] → []");
  const g = groupWords([{ text: "x", start: NaN, end: 1 }, { text: "y", start: 1, end: 1.3 }]);
  ok(g.length === 1 && g[0].words.length === 1, "lọc word thiếu timing (start NaN)");
}

// ── 3) extractKeywords: ưu tiên SỐ/%, rồi từ DÀI; giãn cách; neo start word ──
{
  const groups = [
    { start: 0, end: 2, words: [{ text: "tiết", start: 0.2, end: 0.5 }, { text: "kiệm", start: 0.6, end: 0.9 }, { text: "30%", start: 1.0, end: 1.4 }] },
    { start: 5, end: 7, words: [{ text: "tự", start: 5.0, end: 5.2 }, { text: "động", start: 5.3, end: 5.6 }, { text: "hoá", start: 5.7, end: 6.0 }] },
  ];
  const kw = extractKeywords(groups);
  ok(kw.length >= 1, "có ít nhất 1 keyword");
  ok(kw.some((k) => k.text === "30%"), "chọn SỐ/% (30%) làm keyword cụm 1");
  ok(kw.every((k) => k.dur > 0 && Number.isFinite(k.start)), "keyword có dur>0 + start hợp lệ");
  // giãn cách: keyword sau cách keyword trước >= minGap mặc định (2.6)
  for (let i = 1; i < kw.length; i++) ok(kw[i].start - kw[i - 1].start >= 2.6 - 1e-6, "keyword giãn cách >= minGap");
}

// ── 4) extractKeywords: cụm toàn từ NGẮN (<minLen, không số) → bỏ ──
{
  const groups = [{ start: 0, end: 2, words: [{ text: "à", start: 0.1, end: 0.3 }, { text: "ừ", start: 0.4, end: 0.6 }, { text: "nhé", start: 0.7, end: 0.9 }] }];
  eq(extractKeywords(groups).length, 0, "toàn từ ngắn + không số → 0 keyword");
  eq(extractKeywords(null).length, 0, "null → []");
}

// ── 5) groupWords: KHÔNG để cụm 1 từ lẻ trơ (gộp vào cụm liền kề), trừ khi tổng chỉ 1 từ ──
{
  // 6 từ đều → groupWords cũ cho [5]+[1] ("w5" trơ). Sau fix: không cụm nào < 2 từ.
  const six = Array.from({ length: 6 }, (_, i) => ({ text: "w" + i, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const g6 = groupWords(six);
  ok(g6.every((x) => x.words.length >= 2), "6 từ → không cụm 1 từ lẻ");
  ok(g6.every((x) => x.words.length <= 5), "6 từ → vẫn tôn trọng maxWords=5");
  eq(g6.reduce((n, x) => n + x.words.length, 0), 6, "6 từ → không mất/nhân từ");

  // Từ KẾT CÂU đứng lẻ ("Một." flush ngay) → phải gộp với cụm sau, không trơ.
  const sent = [
    { text: "Một.", start: 0.0, end: 0.4 },
    { text: "viên", start: 0.5, end: 0.8 },
    { text: "thuốc", start: 0.9, end: 1.2 },
  ];
  ok(groupWords(sent).every((x) => x.words.length >= 2), "từ kết câu lẻ → được gộp");

  // Từ cuối sau khoảng lặng (giống bug 'tay' trong test 1) → gộp, không trơ.
  const gapLast = [
    { text: "Nhập", start: 1.1, end: 1.4 },
    { text: "liệu", start: 1.4, end: 1.7 },
    { text: "tay", start: 3.0, end: 3.3 }, // gap 1.3s → cũ tách 'tay' trơ
  ];
  ok(groupWords(gapLast).every((x) => x.words.length >= 2), "từ cuối sau khoảng lặng → gộp, không trơ");

  // Tổng CHỈ 1 từ → giữ nguyên (không có gì để gộp).
  eq(groupWords([{ text: "Rồi.", start: 0, end: 0.5 }])[0].words.length, 1, "tổng 1 từ → giữ nguyên");
}

// ── 6) groupWords maxWords:4 — C4 dùng cụm 2–4 từ (chuẩn editor pro) ──
{
  const many = Array.from({ length: 11 }, (_, i) => ({ text: "w" + i, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const g = groupWords(many, { maxWords: 4 });
  ok(g.every((x) => x.words.length >= 2 && x.words.length <= 4), "maxWords:4 → mọi cụm 2–4 từ");
  eq(g.reduce((n, x) => n + x.words.length, 0), 11, "maxWords:4 → không mất từ");
}

done("overlay-plan");
