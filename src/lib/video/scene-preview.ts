/**
 * Scene preview (Phase 4 — studio): render 1 CẢNH lẻ của storyboard thành MP4
 * ngắn trên engine render (VPS $0) để xem trước khi sửa.
 *
 * Cách hoạt động: composition `animation` TỰ ẨN scene thiếu biến → truyền BỘ BIẾN
 * TỐI THIỂU của đúng cảnh đó (các biến khác rỗng) là chỉ cảnh đó hiện. s1/s7 luôn
 * có trong DOM → ép cửa sổ 0.3s đầu/cuối qua scene_times (chớp nhẹ, chấp nhận
 * được cho preview; node hook/outro thì map THẲNG vào s1/s7 — preview chuẩn).
 */
import type { Node as GraphNode } from "@/lib/content-graph";
import type { BrandKit } from "@/lib/design/brandkit";

type SceneVars = { variables: Record<string, unknown>; durationSec: number };

/**
 * Spec 1 cảnh (DÙNG CHUNG cho preview + video thật graph-driven):
 *  - `intent`: archetype CHUẨN HOÁ (hook|cta|bignum|bars|flow|compare|callout|points)
 *    — composition (chế độ mảng-cảnh) switch theo trường này để gọi đúng hàm dựng.
 *  - `vars`: CHỈ các biến của riêng cảnh đó (KHÔNG kèm BLANK toàn cục).
 *  - `durationSec`: thời lượng cảnh đã kẹp [2.5, 12].
 */
export type SceneSpec = { intent: string; vars: Record<string, unknown>; durationSec: number };

const BLANK: Record<string, unknown> = {
  hook_line1: "", hook_line2: "", hook_keyword: "", hook_sub: "", hook_eyebrow: "", hook_stat: "",
  bignum_value: "", bignum_unit: "", bignum_label: "",
  data_bars: "[]", bars_title: "", pills: "[]", pills_title: "", levels: "[]", levels_title: "",
  points: "[]", compare: "", principle: "", callout: "",
  donut: "", before_after: "", mini_stats: "[]", mini_title: "", trend: "", flow: "",
  cta_top: "", cta_keyword: "", cta_sub: "", cta_hl: "",
  img_hero: "", voice_url: "", captions: "", topic: "", compact: "",
};

const txt = (n: GraphNode): string => (n.kind === "text" ? n.text : n.label || "");
const dataOf = (n: GraphNode): Record<string, unknown> =>
  n.kind === "data" && n.data && typeof n.data === "object" && !Array.isArray(n.data)
    ? (n.data as Record<string, unknown>)
    : {};

/**
 * Map 1 node storyboard → archetype + BỘ BIẾN của riêng cảnh đó (KHÔNG kèm BLANK,
 * KHÔNG kèm scene_times). Hàm THUẦN, dùng chung cho:
 *  - preview cảnh lẻ (`sceneVariablesForNode` gọi lại + trộn BLANK + scene_times),
 *  - video thật graph-driven (`buildAnimationVariablesFromGraph` lặp node → spec).
 * → "preview = video thật" vì cùng 1 mapping. `_kit`/`_theme` reserved cho
 * theming theo từng cảnh sau này (hiện theme/tokens là biến TOÀN CỤC).
 */
export function sceneSpecForNode(node: GraphNode, _kit: BrandKit | null, _theme: string): SceneSpec {
  const dur = Math.max(2.5, Math.min(12, node.durationSec || 4));
  const intent = (node.frameIntent || "").toLowerCase();
  const d = dataOf(node);
  const vars: Record<string, unknown> = {};
  let archetype: string;

  if (intent === "hook" || node.id === "hook") {
    const words = txt(node).split(/\s+/).filter(Boolean);
    const mid = Math.ceil(words.length / 2);
    vars.hook_line1 = words.slice(0, mid).join(" ");
    vars.hook_line2 = words.slice(mid).join(" ");
    vars.hook_keyword = node.label || "";
    archetype = "hook";
  } else if (intent === "outro" || intent === "cta" || node.id === "cta") {
    vars.cta_top = "";
    vars.cta_keyword = txt(node);
    archetype = "cta";
  } else if (intent === "data-big") {
    vars.bignum_value = String(d.value ?? "");
    vars.bignum_unit = String(d.unit ?? "");
    vars.bignum_label = String(d.label ?? node.label ?? "").toUpperCase();
    archetype = "bignum";
  } else if (intent === "data-bars" && Array.isArray(d.bars)) {
    vars.data_bars = JSON.stringify(d.bars);
    // bars_title = node.label (KHÔNG đọc d.label: shape {bars} không có title thật, và anti-fab
    // có thể nhét d.label="(ước tính)" vào → tránh tiêu đề thành "(ước tính)").
    vars.bars_title = String(node.label || "Những con số");
    archetype = "bars";
  } else if (intent === "flow" && Array.isArray(d.steps)) {
    vars.flow = JSON.stringify({ title: String(d.title || node.label || "Quy trình"), steps: d.steps });
    archetype = "flow";
  } else if (intent === "compare" && d.leftTitle) {
    vars.compare = JSON.stringify(d);
    archetype = "compare";
  } else if (intent === "donut" && d.value != null && !Array.isArray(d.value) && String(d.value).trim() !== "") {
    vars.donut = JSON.stringify({ value: d.value, unit: d.unit ?? "", label: d.label ?? node.label ?? "" });
    archetype = "donut";
  } else if (intent === "trend" && Array.isArray(d.points)) {
    vars.trend = JSON.stringify({ label: String(d.label || node.label || "Xu hướng"), points: d.points });
    archetype = "trend";
  } else if ((intent === "before-after" || intent === "before_after") && d.fromValue != null && d.toValue != null) {
    vars.before_after = JSON.stringify(d);
    archetype = "before_after";
  } else if (intent === "mini" && Array.isArray(d.stats)) {
    vars.mini_stats = JSON.stringify(d.stats);
    vars.mini_title = String(d.title || node.label || "Chỉ số");
    archetype = "mini";
  } else if ((intent === "pills" || intent === "levels") && Array.isArray(d.items)) {
    const items = d.items as unknown[];
    vars.pills = JSON.stringify(items.map((it, i) => {
      const label = typeof it === "string"
        ? it
        : it && typeof it === "object" && "label" in it
          ? String((it as Record<string, unknown>).label ?? "")
          : String(it ?? "");
      return { n: String(i + 1), label };
    }));
    vars.pills_title = String(d.title || node.label || "Điểm chính");
    archetype = "pills";
  } else if (intent === "principle") {
    vars.principle = txt(node);
    archetype = "principle";
  } else if (intent === "quote") {
    vars.callout = txt(node);
    archetype = "callout";
  } else if (node.kind === "data" && d.value != null && !Array.isArray(d.value) && String(d.value).trim() !== "") {
    // FALLBACK CUỐI: node data có số vô hướng nhưng intent rỗng/lạ (vd "stat", "data-bar" số ít) →
    // số lớn (GIỮ số, không rơi points làm mất số). Đặt SAU mọi nhánh viz đặc thù (donut… đi trước).
    vars.bignum_value = String(d.value ?? "");
    vars.bignum_unit = String(d.unit ?? "");
    vars.bignum_label = String(d.label ?? node.label ?? "").toUpperCase();
    archetype = "bignum";
  } else {
    // point/text mặc định → 1 point card
    vars.points = JSON.stringify([
      { n: 1, total: 1, text: txt(node), title: txt(node), detail: "", stat: undefined },
    ]);
    archetype = "points";
  }

  // PHẦN D4 — dòng NGUỒN nhỏ dưới cảnh data: lấy displaySource từ node.data (Writer xuất; số ước tính → rỗng).
  if (["bignum", "bars", "donut", "trend", "before_after", "mini"].includes(archetype) && d.displaySource != null && String(d.displaySource).trim()) {
    vars.source = String(d.displaySource).trim().slice(0, 40);
  }

  return { intent: archetype, vars, durationSec: dur };
}

/** Map 1 node storyboard → bộ biến composition để render RIÊNG cảnh đó. */
export function sceneVariablesForNode(node: GraphNode, kit: BrandKit | null, theme: string): SceneVars {
  const spec = sceneSpecForNode(node, kit, theme);
  const dur = spec.durationSec;
  const intent = (node.frameIntent || "").toLowerCase();
  const vars: Record<string, unknown> = { ...BLANK, ...spec.vars };
  // Node hook/cta map THẲNG vào s1/s7 (luôn hiện) → KHÔNG cần bookend.
  const direct = spec.intent === "hook" || spec.intent === "cta";

  if (direct) {
    // s1 + s7 LUÔN trong DOM (composition không remove) → nếu không ép scene_times,
    // 2 cảnh chia đôi thời lượng và nửa khung trống. Ép cảnh đích chiếm gần trọn,
    // cảnh còn lại 0.3s cuối/đầu.
    const total = +(dur + 0.3).toFixed(2);
    const sceneTimes: Record<string, { start: number; dur: number }> =
      intent === "outro" || node.id === "cta"
        ? { s1: { start: 0, dur: 0.3 }, s7: { start: 0.3, dur } }
        : { s1: { start: 0, dur }, s7: { start: dur, dur: 0.3 } };
    return {
      variables: {
        ...vars,
        duration: String(total),
        theme,
        tokens: kit ? JSON.stringify(kit.tokens) : "",
        scene_times: JSON.stringify(sceneTimes),
        visionQC: false,
      },
      durationSec: total,
    };
  }
  // Bookend 0.3s cho s1/s7 (luôn trong DOM) — cảnh đích chiếm trọn phần giữa.
  const total = +(dur + 0.6).toFixed(2);
  const sceneTimes: Record<string, { start: number; dur: number }> = {
    s1: { start: 0, dur: 0.3 },
    s7: { start: +(0.3 + dur).toFixed(2), dur: 0.3 },
  };
  // id cảnh đích trong composition: points → spt0; còn lại theo map intent.
  const idMap: Record<string, string> = {
    "data-big": "s2", "data-bars": "s4b", flow: "s_flow", compare: "s_cmp", quote: "s_emph",
    donut: "s_donut", trend: "s_trend", "before-after": "s_ba", before_after: "s_ba",
    mini: "s_mini", pills: "s6", levels: "s6", principle: "s_emph",
  };
  const target = idMap[intent] || (vars.points !== "[]" ? "spt0" : "s2");
  sceneTimes[target] = { start: 0.3, dur };

  return {
    variables: {
      ...vars,
      duration: String(total),
      theme,
      tokens: kit ? JSON.stringify(kit.tokens) : "",
      scene_times: JSON.stringify(sceneTimes),
      visionQC: false,
    },
    durationSec: total,
  };
}
