/**
 * Unit-test sceneSpecForNode (Phase 1 §6.1) — mapping TỪNG intent → archetype + vars.
 * Chạy: node test/scene-spec.test.mts  (Node ≥23 strip types; import type bị xoá → KHÔNG cần alias).
 */
import { sceneSpecForNode } from "../src/lib/video/scene-preview.ts";
import { eq, ok, done } from "./assert.mjs";

type N = Parameters<typeof sceneSpecForNode>[0];
const spec = (node: N) => sceneSpecForNode(node, null, "2");

// 1) hook theo frameIntent → tách 2 dòng cân theo số từ, keyword = label
{
  const r = spec({ id: "n1", kind: "text", frameIntent: "hook", text: "Bạn đang lãng phí thời gian mỗi ngày mà không hề biết", label: "Lãng phí" });
  eq(r.intent, "hook", "hook-intent → archetype hook");
  eq(r.vars.hook_line1, "Bạn đang lãng phí thời gian", "hook_line1 nửa đầu");
  eq(r.vars.hook_line2, "mỗi ngày mà không hề biết", "hook_line2 nửa sau");
  eq(r.vars.hook_keyword, "Lãng phí", "hook_keyword = label");
}

// 2) hook theo id (không frameIntent)
{
  const r = spec({ id: "hook", kind: "text", text: "Một câu hook", label: "Hook" });
  eq(r.intent, "hook", "hook-id → archetype hook");
}

// 3) cta theo frameIntent; 4) outro; 5) cta theo id → đều archetype cta
{
  const r = spec({ id: "n2", kind: "text", frameIntent: "cta", text: "Theo dõi ngay" });
  eq(r.intent, "cta", "cta-intent → archetype cta");
  eq(r.vars.cta_keyword, "Theo dõi ngay", "cta_keyword = text");
  eq(r.vars.cta_top, "", "cta_top rỗng");
  eq(spec({ id: "n3", kind: "text", frameIntent: "outro", text: "Hẹn gặp lại" }).intent, "cta", "outro → archetype cta");
  eq(spec({ id: "cta", kind: "text", text: "Đăng ký kênh" }).intent, "cta", "cta-id → archetype cta");
}

// 6) data-big theo frameIntent → bignum, label uppercased
{
  const r = spec({ id: "n4", kind: "data", frameIntent: "data-big", label: "Người dùng", data: { value: 65, unit: "giờ", label: "mỗi tháng" } });
  eq(r.intent, "bignum", "data-big → archetype bignum");
  eq(r.vars.bignum_value, "65", "bignum_value");
  eq(r.vars.bignum_unit, "giờ", "bignum_unit");
  eq(r.vars.bignum_label, "MỖI THÁNG", "bignum_label uppercased");
}

// 7) data node có value vô hướng (KHÔNG frameIntent) → vẫn bignum
{
  const r = spec({ id: "n5", kind: "data", data: { value: 42, unit: "%" } });
  eq(r.intent, "bignum", "data-kind value vô hướng → bignum");
  eq(r.vars.bignum_value, "42", "bignum_value 42");
}

// 8) data-bars → bars, data_bars là JSON mảng, bars_title = node.label
{
  const bars = [{ label: "A", value: "10" }, { label: "B", value: "20" }];
  const r = spec({ id: "n6", kind: "data", frameIntent: "data-bars", label: "Số liệu", data: { bars } });
  eq(r.intent, "bars", "data-bars → archetype bars");
  eq(JSON.parse(String(r.vars.data_bars)), bars, "data_bars JSON khớp");
  eq(r.vars.bars_title, "Số liệu", "bars_title = node.label");
}

// 9) flow → flow JSON {title, steps}
{
  const r = spec({ id: "n7", kind: "data", frameIntent: "flow", data: { title: "Quy trình", steps: ["B1", "B2", "B3"] } });
  eq(r.intent, "flow", "flow → archetype flow");
  const f = JSON.parse(String(r.vars.flow));
  eq(f.title, "Quy trình", "flow.title");
  eq(f.steps.length, 3, "flow.steps = 3");
}

// 10) compare → compare JSON giữ leftTitle
{
  const data = { leftTitle: "Trước", leftItems: ["a", "b"], rightTitle: "Sau", rightItems: ["c"] };
  const r = spec({ id: "n8", kind: "data", frameIntent: "compare", data });
  eq(r.intent, "compare", "compare → archetype compare");
  eq(JSON.parse(String(r.vars.compare)).leftTitle, "Trước", "compare.leftTitle");
}

// 11) quote → callout
{
  const r = spec({ id: "n9", kind: "text", frameIntent: "quote", text: "Một câu trích dẫn" });
  eq(r.intent, "callout", "quote → archetype callout");
  eq(r.vars.callout, "Một câu trích dẫn", "callout = text");
}

// 12) text mặc định → points (1 thẻ)
{
  const r = spec({ id: "n10", kind: "text", text: "Một ý chính quan trọng" });
  eq(r.intent, "points", "text mặc định → archetype points");
  const p = JSON.parse(String(r.vars.points));
  eq(p.length, 1, "points 1 phần tử");
  eq(p[0].text, "Một ý chính quan trọng", "points[0].text = node.text");
  eq(p[0].title, "Một ý chính quan trọng", "points[0].title = node.text");
}

// 13) entity mặc định → points, text = label
{
  const r = spec({ id: "n11", kind: "entity", label: "Thương hiệu X", props: {} });
  eq(r.intent, "points", "entity mặc định → points");
  eq(JSON.parse(String(r.vars.points))[0].text, "Thương hiệu X", "entity points dùng label");
}

// 14) clamp duration [2.5, 12]
{
  eq(spec({ id: "n12", kind: "text", text: "x", durationSec: 1 }).durationSec, 2.5, "duration kẹp min 2.5");
  eq(spec({ id: "n13", kind: "text", text: "x", durationSec: 99 }).durationSec, 12, "duration kẹp max 12");
  eq(spec({ id: "n14", kind: "text", text: "x" }).durationSec, 4, "duration mặc định 4");
}

// 15) ANTI-FAB: data node KHÔNG có data dùng được + KHÔNG intent → points text RỖNG (không bịa)
{
  const r = spec({ id: "n15", kind: "data", data: {} });
  eq(r.intent, "points", "data rỗng → fallback points");
  eq(JSON.parse(String(r.vars.points))[0].text, "", "anti-fab: text rỗng, KHÔNG bịa nội dung");
}

// 16) vars CHỈ chứa khoá của riêng cảnh (KHÔNG kèm BLANK) — bằng chứng tách thuần
{
  const r = spec({ id: "n16", kind: "data", frameIntent: "data-big", data: { value: 7 } });
  ok(!("hook_line1" in r.vars) && !("captions" in r.vars) && !("scene_times" in r.vars), "vars không kèm khoá BLANK/global");
  ok(Object.keys(r.vars).every((k) => k.startsWith("bignum_")), "vars chỉ có khoá bignum_*");
}

// 17) BIÊN: value=0 → vẫn bignum, bignum_value "0" (guard `!= null`, KHÔNG dùng truthy → 0 không bị nuốt)
{
  const r = spec({ id: "z", kind: "data", frameIntent: "data-big", data: { value: 0, unit: "lần" } });
  eq(r.intent, "bignum", "value=0 → vẫn bignum");
  eq(r.vars.bignum_value, "0", "bignum_value '0' giữ nguyên");
}

// 18) BIÊN: value là MẢNG → KHÔNG bignum, rơi points (guard !Array.isArray(d.value))
{
  eq(spec({ id: "arr", kind: "data", data: { value: [1, 2, 3] } }).intent, "points", "value mảng → points");
}

// 19) BIÊN: frameIntent đặt NHƯNG data sai shape → fallback points (guard kép, anti-fab)
{
  eq(spec({ id: "b", kind: "data", frameIntent: "data-bars", data: { bars: "notarray" } }).intent, "points", "data-bars + bars không phải mảng → points");
  eq(spec({ id: "f", kind: "data", frameIntent: "flow", data: { title: "x" } }).intent, "points", "flow thiếu steps → points");
  eq(spec({ id: "c", kind: "data", frameIntent: "compare", data: { leftItems: ["a"] } }).intent, "points", "compare thiếu leftTitle → points");
}

done("sceneSpecForNode");
