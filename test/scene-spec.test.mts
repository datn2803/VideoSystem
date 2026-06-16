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

// 20) DATA-VIZ Phase 1.1: donut → donut JSON
{
  const r = spec({ id: "dn", kind: "data", frameIntent: "donut", data: { value: 72, unit: "%", label: "tỉ lệ (ví dụ)" } });
  eq(r.intent, "donut", "donut → archetype donut");
  const dn = JSON.parse(String(r.vars.donut));
  eq(dn.value, 72, "donut.value"); eq(dn.unit, "%", "donut.unit");
}

// 21) trend → trend JSON {label, points}
{
  const r = spec({ id: "tr", kind: "data", frameIntent: "trend", data: { label: "Tăng trưởng", points: ["10", "20", "35", "50"] } });
  eq(r.intent, "trend", "trend → archetype trend");
  const tr = JSON.parse(String(r.vars.trend));
  eq(tr.label, "Tăng trưởng", "trend.label"); eq(tr.points.length, 4, "trend.points = 4");
}

// 22) before-after (cả gạch ngang & gạch dưới) → before_after JSON
{
  const data = { fromValue: "8", fromLabel: "Trước", toValue: "1", toLabel: "Sau", unit: "giờ" };
  const r = spec({ id: "ba", kind: "data", frameIntent: "before-after", data });
  eq(r.intent, "before_after", "before-after → archetype before_after");
  eq(JSON.parse(String(r.vars.before_after)).fromValue, "8", "before_after.fromValue");
  eq(spec({ id: "ba2", kind: "data", frameIntent: "before_after", data }).intent, "before_after", "before_after (gạch dưới) cũng nhận");
}

// 23) mini → mini_stats JSON[] + mini_title
{
  const r = spec({ id: "mi", kind: "data", frameIntent: "mini", data: { title: "Chỉ số", stats: [{ value: "3", unit: "x", label: "a" }, { value: "5", unit: "x", label: "b" }] } });
  eq(r.intent, "mini", "mini → archetype mini");
  eq(JSON.parse(String(r.vars.mini_stats)).length, 2, "mini_stats = 2");
  eq(r.vars.mini_title, "Chỉ số", "mini_title");
}

// 24) pills (items chuỗi) + levels (alias) → pills [{n,label}] + pills_title
{
  const r = spec({ id: "pl", kind: "data", frameIntent: "pills", data: { title: "Điểm chính", items: ["Nhanh", "Rẻ", "Dễ"] } });
  eq(r.intent, "pills", "pills → archetype pills");
  const p = JSON.parse(String(r.vars.pills));
  eq(p.length, 3, "pills = 3"); eq(p[0], { n: "1", label: "Nhanh" }, "pill[0] {n,label}");
  eq(r.vars.pills_title, "Điểm chính", "pills_title");
  // items dạng object {label}
  const r2 = spec({ id: "pl2", kind: "data", frameIntent: "levels", data: { items: [{ label: "Cấp 1" }, { label: "Cấp 2" }] } });
  eq(r2.intent, "pills", "levels → alias pills");
  eq(JSON.parse(String(r2.vars.pills))[0].label, "Cấp 1", "levels item.label");
}

// 25) principle (text node) → principle
{
  const r = spec({ id: "pr", kind: "text", frameIntent: "principle", text: "Ít mà chất hơn nhiều mà loãng" });
  eq(r.intent, "principle", "principle → archetype principle");
  eq(r.vars.principle, "Ít mà chất hơn nhiều mà loãng", "principle = text");
}

// 26) ANTI-FAB data-viz: frameIntent đặt nhưng data sai shape → fallback points (không bịa)
{
  eq(spec({ id: "x1", kind: "data", frameIntent: "trend", data: { label: "x" } }).intent, "points", "trend thiếu points → points");
  eq(spec({ id: "x2", kind: "data", frameIntent: "mini", data: { title: "x" } }).intent, "points", "mini thiếu stats → points");
  eq(spec({ id: "x3", kind: "data", frameIntent: "before-after", data: { fromValue: "8" } }).intent, "points", "before-after thiếu toValue → points");
}

// 27) REGRESSION (review #1): data node số vô hướng + frameIntent LẠ → vẫn bignum (KHÔNG mất số)
{
  const r = spec({ id: "st", kind: "data", frameIntent: "stat", data: { value: "88", unit: "điểm" } });
  eq(r.intent, "bignum", "intent lạ + số vô hướng → bignum (fallback cuối)");
  eq(r.vars.bignum_value, "88", "giữ số");
  // "data-bar" số ít (vendored doc liệt kê) cũng không mất số
  eq(spec({ id: "st2", kind: "data", frameIntent: "data-bar", data: { value: "5", unit: "x" } }).intent, "bignum", "data-bar (số ít) → bignum");
}

// 28) bars_title bỏ qua d.label (chống anti-fab "(ước tính)" làm hỏng tiêu đề)
{
  const r = spec({ id: "b", kind: "data", frameIntent: "data-bars", label: "So sánh", data: { bars: [{ label: "A", value: "1" }, { label: "B", value: "2" }], label: "(ước tính)" } });
  eq(r.vars.bars_title, "So sánh", "bars_title = node.label, KHÔNG phải d.label '(ước tính)'");
  eq(spec({ id: "b2", kind: "data", frameIntent: "data-bars", data: { bars: [{ label: "A", value: "1" }, { label: "B", value: "2" }] } }).vars.bars_title, "Những con số", "thiếu node.label → fallback mặc định");
}

// 29) donut value RỖNG → KHÔNG donut (tránh vòng trống); rơi points (không số)
{
  eq(spec({ id: "dz", kind: "data", frameIntent: "donut", data: { value: "" } }).intent, "points", "donut value rỗng → points");
  eq(spec({ id: "dz2", kind: "data", frameIntent: "donut", data: { value: "  " } }).intent, "points", "donut value toàn space → points");
}

// 30) D4: node data có displaySource → vars.source (cảnh data hiện dòng nguồn); ước tính → không source
{
  const r = spec({ id: "s", kind: "data", frameIntent: "data-big", data: { value: "65", unit: "%", displaySource: "VnExpress 2025" } });
  eq(r.vars.source, "VnExpress 2025", "displaySource → vars.source (bignum)");
  const r2 = spec({ id: "s2", kind: "data", frameIntent: "donut", data: { value: "70", unit: "%", label: "x (ước tính)" } });
  ok(!("source" in r2.vars), "không displaySource → KHÔNG vars.source (số ước tính)");
  // points (không phải cảnh data-viz) → không gắn source dù có displaySource
  const r3 = spec({ id: "s3", kind: "text", text: "ý chính" });
  ok(!("source" in r3.vars), "cảnh chữ → không source");
}

done("sceneSpecForNode");
