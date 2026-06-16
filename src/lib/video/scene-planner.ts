/**
 * Scene planner — ContentGraph (storyboard) → ScenePlan (thứ tự cảnh + timing).
 *
 * TRẠNG THÁI (Phase 1 "Graph-driven build" — Hướng A): module này NAY được nối
 * vào builder qua `builders/graph-scenes.ts` → `c3-animation.ts`, SAU cờ
 * `GRAPH_DRIVEN_C3` (mặc định TẮT). Cờ tắt → video chính vẫn dựng từ variantPrompts
 * (fallback). Cờ bật + storyboard hợp lệ → planScenes quyết thứ tự + timing cảnh.
 * Vẫn dùng cho preview cảnh lẻ (scene-preview.ts) + QC + Scene Studio.
 *
 * topoSort quyết thứ tự phát; durationSec từng node (mặc định 3s) quyết timing;
 * có audio thật thì scale tuyến tính toàn timeline khớp độ dài giọng đọc (builder
 * còn tinh chỉnh lại ranh giới theo Whisper qua alignByWeights → cảnh khớp giọng).
 */
import {
  type ContentGraph,
  type Node as GraphNode,
  validate,
  topoSort,
  getNode,
  DEFAULT_FRAME_DURATION_SEC,
} from "@/lib/content-graph";

export type PlannedScene = {
  /** id node trong graph (ổn định — studio sửa từng cảnh theo id này) */
  id: string;
  kind: GraphNode["kind"];
  /** Gợi ý loại cảnh cho template: hook|point|data-big|data-bars|compare|flow|quote|outro… */
  frameIntent?: string;
  label?: string;
  /** kind=text: nội dung chữ */
  text?: string;
  /** kind=data: payload data-viz ({value,unit,label} hoặc tự do) */
  data?: unknown;
  /** kind=entity: props thương hiệu/chủ thể */
  props?: Record<string, unknown>;
  /** Mốc bắt đầu (giây, đã scale) */
  start: number;
  /** Thời lượng (giây, đã scale) */
  dur: number;
};

export type ScenePlan = {
  scenes: PlannedScene[];
  totalSec: number;
  intent: ContentGraph["intent"];
  synopsis?: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Storyboard có DÙNG ĐƯỢC để lái render graph-driven không? An toàn với
 * null/undefined + graph rỗng + edges thiếu. Bọc validate() (vendored) — nếu
 * false thì builder rơi về đường variantPrompts cũ (fallback an toàn).
 */
export function isValidGraph(graph: ContentGraph | null | undefined): graph is ContentGraph {
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return false;
  if (!Array.isArray(graph.edges)) return false;
  try {
    return validate(graph).ok;
  } catch {
    return false;
  }
}

/**
 * Lập kế hoạch cảnh từ storyboard.
 * - validate trước (throw message rõ nếu graph hỏng — caller đã sanitize nên hiếm).
 * - topoSort ra thứ tự; node.durationSec || 3s.
 * - opts.totalDurationSec (độ dài audio thật) → scale tuyến tính cho khớp.
 */
export function planScenes(graph: ContentGraph, opts?: { totalDurationSec?: number }): ScenePlan {
  const v = validate(graph);
  if (!v.ok) {
    throw new Error(`Storyboard không hợp lệ: ${v.errors.map((e) => e.message).join("; ")}`);
  }
  const order = topoSort(graph);
  const durations = order.map((id) => {
    const n = getNode(graph, id);
    return n?.durationSec && n.durationSec > 0 ? n.durationSec : DEFAULT_FRAME_DURATION_SEC;
  });
  const rawTotal = durations.reduce((a, b) => a + b, 0);
  const target = opts?.totalDurationSec && opts.totalDurationSec > 0 ? opts.totalDurationSec : rawTotal;
  const scale = rawTotal > 0 ? target / rawTotal : 1;

  let t = 0;
  const scenes: PlannedScene[] = order.map((id, i) => {
    const n = getNode(graph, id)!;
    const dur = r2(durations[i] * scale);
    const scene: PlannedScene = {
      id,
      kind: n.kind,
      frameIntent: n.frameIntent,
      label: n.label,
      start: r2(t),
      dur,
    };
    if (n.kind === "text") scene.text = n.text;
    if (n.kind === "data") scene.data = n.data;
    if (n.kind === "entity") scene.props = n.props;
    t += dur;
    return scene;
  });
  // Khử trôi số học: cảnh cuối nở/co cho TỔNG đúng bằng target.
  if (scenes.length > 0) {
    const last = scenes[scenes.length - 1];
    last.dur = r2(Math.max(0.5, target - last.start));
  }

  return { scenes, totalSec: r2(target), intent: graph.intent, synopsis: graph.synopsis };
}

/**
 * Map ScenePlan → biến `scene_times` mà composition HyperFrames đang đọc
 * ({id: {start, dur}}) — cầu nối đường MỚI (graph) vào composition HIỆN CÓ.
 */
export function sceneTimesFromPlan(plan: ScenePlan): Record<string, { start: number; dur: number }> {
  const out: Record<string, { start: number; dur: number }> = {};
  for (const s of plan.scenes) out[s.id] = { start: s.start, dur: s.dur };
  return out;
}
