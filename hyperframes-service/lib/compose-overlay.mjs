// C4 AUTO-EDITOR — dựng filter_complex + kế hoạch input ffmpeg cho cutaway C2. PURE (không fs/ffmpeg)
// → test offline.
//
// CHỐNG LẶP HÌNH (fix): cũ = 1 overlay C2 chạy theo thời gian OUTPUT (-stream_loop + enable=between) →
// cutaway tại giây t hé "C2 ở giây t"; 2 cutaway gần nhau rơi cùng 1 CẢNH C2 (mỗi cảnh ~4s) → trùng
// hình; C1 dài hơn C2 → cutaway cuối thấy C2 loop về CẢNH ĐẦU. Mới = mỗi cutaway lấy 1 ĐOẠN C2 RIÊNG
// ở 1 CẢNH khác nhau (round-robin coprime trải khắp C2): 2 cutaway liền kề KHÁC cảnh, dùng hết các
// cảnh, KHÔNG loop về đầu. Không probe được c2Dur → fallback overlay loop cũ (không sập).

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Bước nhảy nhỏ nhất ≥2 nguyên tố cùng nhau với s → xoay qua HẾT các cảnh, cụm liền kề KHÁC cảnh.
 *  s≤2 → 1 (1 hoặc 2 cảnh thì cứ +1 là đã khác). */
export function coprimeStride(s) {
  if (!Number.isFinite(s) || s <= 2) return 1;
  for (let p = 2; p < s; p++) if (gcd(p, s) === 1) return p;
  return 1;
}

/** Ước số CẢNH C2 từ thời lượng — ~khớp count C2-broll = clamp(round(dur/4.2),4,5); nới [2,6] an toàn. */
export function estimateC2Scenes(c2Dur) {
  return Math.max(2, Math.min(6, Math.round((Number(c2Dur) || 0) / 4.2)));
}

/** Mỗi cutaway → 1 đoạn C2 ở 1 cảnh khác (round-robin coprime). Trả [{offset, readDur}] (giây). */
export function planC2Offsets(segs, c2Dur) {
  const scenes = estimateC2Scenes(c2Dur);
  const stride = coprimeStride(scenes);
  const sceneLen = c2Dur / scenes;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return segs.map((s, k) => {
    const dur = s.end - s.start;
    const sceneIdx = (k * stride) % scenes;
    const margin = Math.min(0.2, sceneLen * 0.08); // chừa mép đầu cảnh (crossfade nội bộ C2)
    let offset = sceneIdx * sceneLen + margin;
    const sceneEnd = (sceneIdx + 1) * sceneLen;
    if (offset + dur > sceneEnd) offset = Math.max(sceneIdx * sceneLen, sceneEnd - dur); // gọn trong 1 cảnh
    offset = Math.max(0, Math.min(offset, c2Dur - dur - 0.05)); // luôn trong [0, c2Dur)
    return { offset: r3(offset), readDur: r3(dur + 0.25) }; // đọc dư 0.25s để phủ trọn cửa sổ overlay
  });
}

/**
 * Dựng filter_complex + kế hoạch input. input 0 = C1.
 *  - mode "split"   : cutaway = SPLIT 2 tầng — nửa TRÊN b-roll C2 (mỗi cutaway 1 cảnh khác) + nửa DƯỚI
 *                     MẶT C1 (crop, lip-sync). input 1..N = N đoạn C2; caption (nếu có) = input N+1.
 *  - mode "distinct": cutaway = C2 che FULL khung (mỗi đoạn 1 cảnh khác); caption = input N+1.
 *  - mode "loop"    : input 1 = C2 (-stream_loop) [fallback khi c2Dur lỗi]; caption = input 2.
 *  - mode "none"    : không có cutaway; caption (nếu có) = input 1.
 * `split` = null → full-cutaway (đường cũ); { topScaleCrop, faceCrop, topH } → khuôn split-screen.
 * @returns {{ mode:"split"|"distinct"|"loop"|"none", c2Offsets:({offset:number,readDur:number}[]|null), filter:string, captionIdx:(number|null) }}
 */
export function buildComposeGraph({ scaleCrop, segs, c2Dur, hasCaption, split }) {
  const list = Array.isArray(segs) ? segs : [];
  const distinct = list.length > 0 && Number.isFinite(c2Dur) && c2Dur > 1.5;
  const f2 = (x) => Number(x).toFixed(2);
  const chain = [];
  let cur = "base";
  let nextInput = 1;
  let mode = "none";
  let c2Offsets = null;

  if (distinct && split) {
    // ── KHUÔN SPLIT-SCREEN (Phase B): cutaway = nửa TRÊN b-roll C2 + nửa DƯỚI MẶT C1 (cùng lúc). ──
    // [0:v] split=2 → base (C1 full, hiện NGOÀI cutaway) + c1face (crop band MẶT, hiện nửa dưới khi cutaway).
    // c1face dùng [0:v] (KHÔNG tốn input mới) → lip-sync vì là frame C1 tại đúng t.
    mode = "split";
    c2Offsets = planC2Offsets(list, c2Dur);
    chain.push(`[0:v]${scaleCrop},split=2[base][c1full]`);
    chain.push(`[c1full]${split.faceCrop}[c1face]`); // crop MẶT (giữ tỉ lệ, không méo)
    list.forEach((s, k) => {
      const inIdx = nextInput++;
      // C2 seg → fill nửa TRÊN (1080×topH); setpts dịch về đúng cửa sổ cutaway.
      chain.push(`[${inIdx}:v]${split.topScaleCrop},setpts=PTS-STARTPTS+${Number(s.start).toFixed(3)}/TB[top${k}]`);
    });
    // overlay b-roll nửa TRÊN (y=0) đúng cửa sổ từng cutaway (mỗi cutaway 1 đoạn C2 khác = round-robin).
    list.forEach((s, k) => {
      const out = `ot${k}`;
      chain.push(`[${cur}][top${k}]overlay=x=0:y=0:enable='between(t,${f2(s.start)},${f2(s.end)})':eof_action=pass[${out}]`);
      cur = out;
    });
    // overlay MẶT C1 nửa DƯỚI (y=topH) trong MỌI cửa sổ cutaway — 1 overlay (c1face như nhau mọi cutaway).
    const sumExpr = list.map((s) => `between(t,${f2(s.start)},${f2(s.end)})`).join("+");
    chain.push(`[${cur}][c1face]overlay=x=0:y=${split.topH}:enable='${sumExpr}'[splitv]`);
    cur = "splitv";
  } else if (distinct) {
    mode = "distinct";
    c2Offsets = planC2Offsets(list, c2Dur);
    chain.push(`[0:v]${scaleCrop}[base]`);
    // setpts: dịch mỗi đoạn C2 về đúng cửa sổ cutaway trên timeline output → overlay enable khớp.
    list.forEach((s, k) => {
      const inIdx = nextInput++;
      chain.push(`[${inIdx}:v]${scaleCrop},setpts=PTS-STARTPTS+${Number(s.start).toFixed(3)}/TB[seg${k}]`);
    });
    // chuỗi overlay: mỗi đoạn bật đúng cửa sổ; eof_action=pass → đoạn hết thì cho nền C1 chạy tiếp.
    list.forEach((s, k) => {
      const out = `o${k}`;
      chain.push(`[${cur}][seg${k}]overlay=enable='between(t,${f2(s.start)},${f2(s.end)})':eof_action=pass[${out}]`);
      cur = out;
    });
  } else if (list.length > 0) {
    mode = "loop";
    chain.push(`[0:v]${scaleCrop}[base]`);
    nextInput++; // input 1 = C2 (-stream_loop)
    const expr = list.map((s) => `between(t,${f2(s.start)},${f2(s.end)})`).join("+");
    chain.push(`[1:v]${scaleCrop}[cut]`);
    chain.push(`[${cur}][cut]overlay=enable='${expr}'[cutv]`);
    cur = "cutv";
  } else {
    chain.push(`[0:v]${scaleCrop}[base]`);
  }

  let captionIdx = null;
  if (hasCaption) {
    captionIdx = nextInput++;
    chain.push(`[${cur}][${captionIdx}:v]overlay=0:0[vout]`);
    cur = "vout";
  }
  // Chưa kết thúc ở [vout] (không cutaway + không chữ) → đổi nhãn cuối thành [vout].
  if (cur !== "vout") chain[chain.length - 1] = chain[chain.length - 1].replace(new RegExp(`\\[${cur}\\]$`), "[vout]");
  return { mode, c2Offsets, filter: chain.join(";"), captionIdx };
}
