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

/** Map 1 node storyboard → bộ biến composition để render RIÊNG cảnh đó. */
export function sceneVariablesForNode(node: GraphNode, kit: BrandKit | null, theme: string): SceneVars {
  const dur = Math.max(2.5, Math.min(12, node.durationSec || 4));
  const intent = (node.frameIntent || "").toLowerCase();
  const d = dataOf(node);
  const vars: Record<string, unknown> = { ...BLANK };
  // Node hook/outro map THẲNG vào s1/s7 (luôn hiện) → KHÔNG cần bookend.
  let direct = false;

  if (intent === "hook" || node.id === "hook") {
    const words = txt(node).split(/\s+/).filter(Boolean);
    const mid = Math.ceil(words.length / 2);
    vars.hook_line1 = words.slice(0, mid).join(" ");
    vars.hook_line2 = words.slice(mid).join(" ");
    vars.hook_keyword = node.label || "";
    direct = true;
  } else if (intent === "outro" || intent === "cta" || node.id === "cta") {
    vars.cta_top = "";
    vars.cta_keyword = txt(node);
    direct = true;
  } else if (intent === "data-big" || (node.kind === "data" && d.value != null && !Array.isArray(d.value))) {
    vars.bignum_value = String(d.value ?? "");
    vars.bignum_unit = String(d.unit ?? "");
    vars.bignum_label = String(d.label ?? node.label ?? "").toUpperCase();
  } else if (intent === "data-bars" && Array.isArray(d.bars)) {
    vars.data_bars = JSON.stringify(d.bars);
    vars.bars_title = String(d.label || node.label || "Những con số");
  } else if (intent === "flow" && Array.isArray(d.steps)) {
    vars.flow = JSON.stringify({ title: String(d.title || node.label || "Quy trình"), steps: d.steps });
  } else if (intent === "compare" && d.leftTitle) {
    vars.compare = JSON.stringify(d);
  } else if (intent === "quote") {
    vars.callout = txt(node);
  } else {
    // point/text mặc định → 1 point card
    vars.points = JSON.stringify([
      { n: 1, total: 1, text: txt(node), title: txt(node), detail: "", stat: undefined },
    ]);
  }

  if (direct) {
    return {
      variables: { ...vars, duration: String(dur), theme, tokens: kit ? JSON.stringify(kit.tokens) : "", visionQC: false },
      durationSec: dur,
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
