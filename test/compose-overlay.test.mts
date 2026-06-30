/**
 * Unit-test buildComposeGraph (C4 auto-editor filter_complex) — PURE, offline.
 * Lưới regression cho khuôn SPLIT-SCREEN: khoá đường distinct CŨ + split MỚI + invariant round-robin.
 */
// compose-overlay.mjs là JS thuần (hyperframes-service) → import quan hệ tương đối.
// @ts-ignore — module .mjs không có .d.ts (thuần JS, ngoài src/); test chỉ kiểm hành vi.
import { coprimeStride, estimateC2Scenes, planC2Offsets, buildComposeGraph } from "../hyperframes-service/lib/compose-overlay.mjs";
import { ok, eq, done } from "./assert.mjs";

const SC = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24";
const SPLIT = {
  topH: 1056,
  topScaleCrop: "scale=1080:1056:force_original_aspect_ratio=increase,crop=1080:1056,setsar=1,fps=24",
  faceCrop: "crop=1080:864:0:180",
};
const segs = [{ start: 3, end: 4.5 }, { start: 6, end: 7.5 }, { start: 9, end: 10.5 }];

// ── 1) helpers thuần ──
{
  ok(coprimeStride(5) === 2 && coprimeStride(4) === 3 && coprimeStride(6) === 5 && coprimeStride(2) === 1, "coprimeStride");
  ok(estimateC2Scenes(20) >= 4 && estimateC2Scenes(20) <= 6, "estimateC2Scenes(20) ~ count C2");
  const offs = planC2Offsets(segs, 20) as { offset: number; readDur: number }[];
  ok(offs.length === 3 && offs.every((o) => o.offset >= 0 && o.offset <= 20), "planC2Offsets trong [0,c2Dur]");
}

// ── 2) distinct (split=null) — KHOÁ đường cũ (không bị refactor làm trôi) ──
{
  const d = buildComposeGraph({ scaleCrop: SC, segs, c2Dur: 20, hasCaption: true, split: null });
  eq(d.mode, "distinct", "split=null → distinct");
  ok(!/split=2/.test(d.filter), "distinct KHÔNG có split=2");
  ok(/\[0:v\]scale[^;]*\[base\]/.test(d.filter), "distinct: base = C1 full");
  ok(/\[seg0\]overlay=enable='between\(t,3\.00,4\.50\)'/.test(d.filter), "distinct: cutaway overlay FULL enable đúng cửa sổ");
  ok(/\[4:v\]overlay=0:0\[vout\]/.test(d.filter), "distinct: caption = input N+1 (=4)");
}

// ── 3) split — khuôn split-screen ──
{
  const s = buildComposeGraph({ scaleCrop: SC, segs, c2Dur: 20, hasCaption: true, split: SPLIT });
  eq(s.mode, "split", "split!=null + distinct → split");
  ok(/\[0:v\]scale[^;]*,split=2\[base\]\[c1full\]/.test(s.filter), "split: [0:v] split=2 → base + c1full");
  ok(/\[c1full\]crop=1080:864:0:180\[c1face\]/.test(s.filter), "split: crop band MẶT C1");
  ok(/\[1:v\]scale=1080:1056[^;]*\[top0\]/.test(s.filter), "split: C2 seg scale nửa TRÊN (topH)");
  ok(/\[top0\]overlay=x=0:y=0:enable='between\(t,3\.00,4\.50\)'/.test(s.filter), "split: b-roll overlay y=0 đúng cửa sổ");
  ok(/\[c1face\]overlay=x=0:y=1056:enable='between\(t,3\.00,4\.50\)\+between\(t,6\.00,7\.50\)\+between\(t,9\.00,10\.50\)'/.test(s.filter), "split: MẶT C1 overlay y=topH, enable=SUM mọi cutaway");
  ok(/\[4:v\]overlay=0:0\[vout\]/.test(s.filter), "split: caption = input N+1 (=4) overlay SAU split");
}

// ── 4) INVARIANT: round-robin c2Offsets GIỮ NGUYÊN khi bật/tắt split ──
{
  const a = buildComposeGraph({ scaleCrop: SC, segs, c2Dur: 20, hasCaption: false, split: null }).c2Offsets;
  const b = buildComposeGraph({ scaleCrop: SC, segs, c2Dur: 20, hasCaption: false, split: SPLIT }).c2Offsets;
  eq(JSON.stringify(a), JSON.stringify(b), "split BẬT/TẮT → c2Offsets IDENTICAL (round-robin không đổi)");
}

// ── 5) fallback: c2Dur lỗi → loop (KHÔNG split); không cutaway → none ──
{
  const lp = buildComposeGraph({ scaleCrop: SC, segs, c2Dur: 0, hasCaption: false, split: SPLIT });
  eq(lp.mode, "loop", "c2Dur lỗi + split → loop (KHÔNG split)");
  ok(!/split=2/.test(lp.filter), "loop: không split=2");
  const nn = buildComposeGraph({ scaleCrop: SC, segs: [], c2Dur: 20, hasCaption: false, split: SPLIT });
  eq(nn.mode, "none", "không cutaway → none");
  ok(/\[0:v\]scale[^;]*\[vout\]/.test(nn.filter), "none: [0:v]…[vout]");
}

// ── 6) FIX2 (gate cảnh đen) — c2Offsets truyền sẵn + segs đã lọc → DÙNG nguyên, không tự tính ──
{
  // giả lập: composeAutoEditor đã loại cutaway giữa (cảnh đen) → còn segs[0],segs[2] + offset tương ứng.
  const kept = [segs[0], segs[2]];
  const pre = [{ offset: 1.1, readDur: 1.75 }, { offset: 13.3, readDur: 1.75 }];
  const g = buildComposeGraph({ scaleCrop: SC, segs: kept, c2Dur: 20, hasCaption: false, split: SPLIT, c2Offsets: pre });
  eq(JSON.stringify(g.c2Offsets), JSON.stringify(pre), "FIX2: dùng c2Offsets truyền sẵn (KHÔNG planC2Offsets lại)");
  ok(/\[top0\]overlay=x=0:y=0:enable='between\(t,3\.00,4\.50\)'/.test(g.filter), "FIX2: cutaway còn lại #0 overlay đúng cửa sổ");
  ok(/\[top1\]overlay=x=0:y=0:enable='between\(t,9\.00,10\.50\)'/.test(g.filter), "FIX2: cutaway còn lại #1 = segs[2] (giữ round-robin)");
  ok(!/top2/.test(g.filter) && !/between\(t,6\.00,7\.50\)/.test(g.filter), "FIX2: cutaway ĐEN (giữa) bị BỎ → KHÔNG overlay, C1 full ở cửa sổ đó");
  // bỏ trống c2Offsets → vẫn tự tính (đường thuần) — KHÔNG khớp pre.
  const auto = buildComposeGraph({ scaleCrop: SC, segs: kept, c2Dur: 20, hasCaption: false, split: SPLIT }).c2Offsets;
  ok(JSON.stringify(auto) !== JSON.stringify(pre), "FIX2: bỏ trống c2Offsets → tự planC2Offsets như cũ");
}

// ── 7) MIXED (Phase C) — full-khung CHỦ ĐẠO + split THƯA theo splitEvery ──
{
  // splitEvery=0 + split!=null → KHÔNG cutaway nào split = full khung hết (giống mẫu).
  const d0 = buildComposeGraph({ scaleCrop: SC, segs, c2Dur: 20, hasCaption: false, split: SPLIT, splitEvery: 0 });
  eq(d0.mode, "distinct", "splitEvery=0 → full khung hết (distinct, KHÔNG split)");
  ok(!/split=2/.test(d0.filter), "splitEvery=0: KHÔNG split=2 (không tách mặt)");

  // splitEvery=1 → MỌI cutaway split (tương thích ngược SPLIT_SCREEN=1).
  const a1 = buildComposeGraph({ scaleCrop: SC, segs, c2Dur: 20, hasCaption: false, split: SPLIT, splitEvery: 1 });
  eq(a1.mode, "split", "splitEvery=1 → mọi cutaway split (legacy)");

  // splitEvery=2 + 3 cutaway → chỉ cutaway #1 (k=1, (1+1)%2==0) split; #0,#2 full khung. mode=mixed.
  const m = buildComposeGraph({ scaleCrop: SC, segs, c2Dur: 20, hasCaption: true, split: SPLIT, splitEvery: 2 });
  eq(m.mode, "mixed", "splitEvery=2 + 3 cutaway → mixed");
  ok(/\[0:v\]scale[^;]*,split=2\[base\]\[c1full\]/.test(m.filter), "mixed: vẫn tách c1face cho cửa sổ split");
  // seg0 = FULL khung (scale 1080:1920, overlay KHÔNG x/y)
  ok(/\[1:v\]scale=1080:1920[^;]*\[seg0\]/.test(m.filter), "mixed: cutaway #0 scale FULL khung");
  ok(/\[seg0\]overlay=enable='between\(t,3\.00,4\.50\)'/.test(m.filter), "mixed: cutaway #0 overlay FULL (không y=0)");
  // seg1 = SPLIT (scale topH=1056, overlay x=0:y=0)
  ok(/\[2:v\]scale=1080:1056[^;]*\[seg1\]/.test(m.filter), "mixed: cutaway #1 scale nửa TRÊN (topH)");
  ok(/\[seg1\]overlay=x=0:y=0:enable='between\(t,6\.00,7\.50\)'/.test(m.filter), "mixed: cutaway #1 b-roll y=0 (split)");
  // seg2 = FULL
  ok(/\[3:v\]scale=1080:1920[^;]*\[seg2\]/.test(m.filter), "mixed: cutaway #2 scale FULL khung");
  // c1face overlay CHỈ ở cửa sổ split (#1) — không gồm #0,#2
  ok(/\[c1face\]overlay=x=0:y=1056:enable='between\(t,6\.00,7\.50\)'\[mixv\]/.test(m.filter), "mixed: MẶT C1 chỉ overlay ở cửa sổ split (#1)");
  ok(!/between\(t,3\.00,4\.50\)\+/.test(m.filter.split("c1face")[1] || ""), "mixed: cửa sổ full KHÔNG có overlay mặt");
  ok(/\[4:v\]overlay=0:0\[vout\]/.test(m.filter), "mixed: caption = input N+1 (=4)");

  // INVARIANT: c2Offsets (round-robin) GIỮ NGUYÊN dù mode (full/split/mixed)
  const off0 = buildComposeGraph({ scaleCrop: SC, segs, c2Dur: 20, hasCaption: false, split: SPLIT, splitEvery: 0 }).c2Offsets;
  const offM = buildComposeGraph({ scaleCrop: SC, segs, c2Dur: 20, hasCaption: false, split: SPLIT, splitEvery: 2 }).c2Offsets;
  eq(JSON.stringify(off0), JSON.stringify(offM), "mixed: round-robin c2Offsets không đổi theo splitEvery");
}

done("compose-overlay");
