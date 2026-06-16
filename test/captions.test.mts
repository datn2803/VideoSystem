/**
 * Unit-test buildCaptions FORCED ALIGNMENT (A1). buildCaptions import type-only → KHÔNG cần alias.
 * Chạy: node test/captions.test.mts
 */
import { buildCaptions } from "../src/lib/video/captions.ts";
import { eq, ok, done } from "./assert.mjs";

type W = { text: string; start: number; end: number };
const mkW = (arr: [string, number][]): W[] => arr.map(([text, start]) => ({ text, start, end: start + 0.3 }));
const allX = (json: string): string[] => JSON.parse(json).flatMap((p: { w: { x: string }[] }) => p.w.map((w) => w.x));
const allT = (json: string): number[] => JSON.parse(json).flatMap((p: { w: { t: number }[] }) => p.w.map((w) => w.t));

// 1) Forced alignment: chữ = SCRIPT (đúng chính tả + '%'), KHÔNG phải Whisper phiên âm sai
{
  const script = "Giảm 70% thời gian";
  // Whisper nghe TTS tiếng Việt: tách "phần trăm", mất ký hiệu '%' — caption PHẢI hiện chữ SCRIPT.
  const words = mkW([["Giảm", 0.5], ["70", 1.0], ["phần", 1.4], ["trăm", 1.7], ["thời", 2.1], ["gian", 2.5]]);
  const out = buildCaptions(words, 5, script);
  eq(allX(out), ["Giảm", "70%", "thời", "gian"], "chữ = SCRIPT (giữ '70%'), KHÔNG dùng Whisper text");
  ok(allX(out).includes("70%"), "'%' được giữ (Whisper mất → forced alignment cứu)");
  ok(allT(out)[0] >= 0.5 && allT(out)[0] <= 1.1, "timestamp token đầu lấy từ Whisper (sync)");
}

// 2) Sai dấu: Whisper nghe 'tối' nhưng script 'tới' → caption hiện 'tới' (đúng)
{
  const out = buildCaptions(mkW([["6", 0.4], ["năm", 0.8], ["tối", 1.2]]), 4, "6 năm tới");
  eq(allX(out), ["6", "năm", "tới"], "hiện 'tới' (script) không phải 'tối' (Whisper nghe sai)");
}

// 3) Whisper null (dryrun/lỗi) → fallback chia đều, vẫn dùng chữ SCRIPT
{
  eq(allX(buildCaptions(null, 6, "Một hai ba bốn")), ["Một", "hai", "ba", "bốn"], "fallback null dùng chữ script");
}

// 4) Script rỗng → caption rỗng
{
  eq(buildCaptions(mkW([["x", 1]]), 5, ""), "", "script rỗng → ''");
  eq(buildCaptions(null, 5, ""), "", "null + script rỗng → ''");
}

// 5) timestamps KHÔNG giảm dần (forced alignment monotonic — karaoke không nhảy lùi)
{
  const out = buildCaptions(mkW([["a", 0.5], ["b", 1.0], ["c", 1.5], ["d", 2.0], ["e", 2.5]]), 6, "một hai ba bốn năm sáu bảy tám");
  const ts = allT(out);
  let mono = true;
  for (let i = 1; i < ts.length; i++) if (ts[i] < ts[i - 1]) mono = false;
  ok(mono, "timestamps không giảm (token script nhiều hơn Whisper → vẫn monotonic)");
  eq(allX(out).length, 8, "đủ 8 token script");
}

// 6) lệch: script ÍT hơn Whisper (Whisper tách nhỏ) → vẫn map đủ token script
{
  const out = buildCaptions(mkW([["Bo", 0.3], ["t", 0.5], ["chăm", 0.9], ["sóc", 1.2]]), 4, "Bot chăm-sóc");
  eq(allX(out), ["Bot", "chăm-sóc"], "2 token script map lên 4 Whisper word");
}

done("buildCaptions forced-alignment");
