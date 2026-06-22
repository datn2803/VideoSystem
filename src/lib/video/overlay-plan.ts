// C4 AUTO-EDITOR Phase 2 — tính LỚP CHỮ overlay (caption karaoke + keyword IN HOA) từ Whisper words.
// PURE (không import singleton) → unit-test offline như cutaway-plan.ts / captions.ts.

export type CaptionWord = { text: string; start: number; end: number };
export type CaptionGroup = { start: number; end: number; words: CaptionWord[] };
export type Keyword = { text: string; start: number; dur: number };

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * groupWords — gom Whisper words thành cụm caption karaoke (như c2-broll groupWords): ngắt khi
 * ≥maxWords từ / hết câu (dấu kết) / khoảng lặng >gapSec. Mỗi cụm {start,end,words}. PURE.
 */
export function groupWords(
  words: CaptionWord[] | null,
  opts: { maxWords?: number; gapSec?: number } = {}
): CaptionGroup[] {
  const maxWords = opts.maxWords ?? 5;
  const gapSec = opts.gapSec ?? 0.4;
  // Lọc word hợp lệ: timing hữu hạn + ĐÚNG THỨ TỰ (start<=end) + text KHÔNG rỗng (tránh cụm rác /
  // caption trống / timing đảo gây lệch gap). Whisper thường sạch nhưng phòng edge-case upstream.
  const ws = (words || []).filter(
    (w) => w && Number.isFinite(w.start) && Number.isFinite(w.end) && w.start <= w.end && String(w.text || "").trim() !== ""
  );
  const groups: CaptionGroup[] = [];
  let cur: CaptionWord[] = [];
  const flush = () => {
    if (cur.length) {
      groups.push({ start: r2(cur[0].start), end: r2(cur[cur.length - 1].end), words: cur });
      cur = [];
    }
  };
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    cur.push({ text: String(w.text || "").trim(), start: w.start, end: w.end });
    const endsSentence = /[.!?…]$/.test(String(w.text || ""));
    const next = ws[i + 1];
    const gap = next ? next.start - w.end : 0;
    if (cur.length >= maxWords || endsSentence || gap > gapSec) flush();
  }
  flush();
  return mergeShortGroups(groups, maxWords);
}

/**
 * resolveCaptionWindows — CHỐNG 2 cụm caption ĐÈ nhau cùng vị trí: clamp end mỗi cụm ≤ start cụm KẾ
 * trừ 1 margin nhỏ → tại mọi thời điểm chỉ 1 cụm hiện. Giữ thứ tự + words + start; CHỈ co end (không
 * bao giờ < start). Cụm cuối giữ end nguyên. PURE — caller (C4) dùng trước khi gửi /compose. */
export function resolveCaptionWindows(
  groups: CaptionGroup[] | null,
  opts: { margin?: number } = {}
): CaptionGroup[] {
  const margin = opts.margin ?? 0.06;
  const gs = Array.isArray(groups) ? groups : [];
  return gs.map((g, i) => {
    const next = gs[i + 1];
    if (!next) return g;
    const end = Math.max(g.start, Math.min(g.end, next.start - margin)); // không chạm start cụm kế
    return end === g.end ? g : { ...g, end: r2(end) };
  });
}

/**
 * mergeShortGroups — KHÔNG để caption 1 từ trơ (vd "viên" đứng lẻ, "...cũng vừa" cụt). Gộp cụm
 * < minWords từ vào cụm liền kề: ưu tiên hàng xóm CHƯA chạm maxWords (gộp thẳng); nếu cả hai đã đầy
 * → REBALANCE (kéo 1 từ từ hàng xóm sang cụm lẻ) → vẫn tôn trọng maxWords. Còn đúng 1 cụm (tổng ít
 * từ) thì giữ nguyên. PURE — chỉ sắp xếp lại words, không đổi text/timing từng từ.
 */
function mergeShortGroups(groups: CaptionGroup[], maxWords: number, minWords = 2): CaptionGroup[] {
  if (groups.length <= 1) return groups; // 0-1 cụm → không có hàng xóm để gộp
  const arr = groups.map((g) => g.words.slice());
  let guard = 0;
  for (let again = true; again && guard < 2000; ) {
    again = false;
    guard++;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].length >= minWords) continue;
      if (arr.length === 1) break; // còn đúng 1 cụm → đành giữ (tổng quá ít từ)
      const prev = i > 0 ? arr[i - 1] : null;
      const next = i < arr.length - 1 ? arr[i + 1] : null;
      if (prev && prev.length < maxWords) { prev.push(...arr[i]); arr.splice(i, 1); }
      else if (next && next.length < maxWords) { next.unshift(...arr[i]); arr.splice(i, 1); }
      else if (prev) { const m = prev.pop(); if (m) arr[i].unshift(m); } // prev đầy → kéo 1 từ sang
      else if (next) { const m = next.shift(); if (m) arr[i].push(m); }  // chỉ có next, đầy → kéo sang
      again = true;
      break;
    }
  }
  return arr.map((words) => ({ start: r2(words[0].start), end: r2(words[words.length - 1].end), words }));
}

/**
 * extractKeywords — chọn TỪ KHOÁ nhấn (hiện IN HOA to) từ caption groups: ưu tiên SỐ/% (giá trị
 * cao), else từ DÀI (≥minLen chữ). Giãn cách ≥minGapSec để không rối; mỗi keyword ~dur giây, neo
 * vào start THẬT của từ (Whisper) → bám lời. PURE.
 */
export function extractKeywords(
  groups: CaptionGroup[] | null,
  opts: { minGapSec?: number; dur?: number; minLen?: number } = {}
): Keyword[] {
  const minGapSec = opts.minGapSec ?? 2.6;
  const dur = opts.dur ?? 1.3;
  const minLen = opts.minLen ?? 5;
  const clean = (w: string) => w.replace(/[^\p{L}\p{N}%+.]/gu, "");
  const hasNum = (w: string) => /\d/.test(w);
  const out: Keyword[] = [];
  let lastEnd = -99;
  for (const g of groups || []) {
    let best: { text: string; start: number } | null = null;
    let bestScore = 0;
    for (const w of g.words || []) {
      const t = clean(String(w.text || ""));
      if (t.length < 2) continue;
      const score = t.length + (hasNum(t) ? 100 : 0); // SỐ luôn thắng
      if (score > bestScore) {
        bestScore = score;
        best = { text: t, start: Number(w.start) || g.start };
      }
    }
    if (!best) continue;
    if (!(hasNum(best.text) || best.text.length >= minLen)) continue; // chỉ số HOẶC từ đủ dài
    if (best.start - lastEnd < minGapSec) continue; // giãn cách
    out.push({ text: best.text, start: r2(best.start), dur });
    lastEnd = best.start + dur;
  }
  return out;
}
