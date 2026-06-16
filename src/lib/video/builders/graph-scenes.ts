/**
 * Graph-driven build (Phase 1 — Hướng A): storyboard (ContentGraph) → MẢNG CẢNH
 * có thứ tự để composition `animation` chạy ở chế độ mảng-cảnh-động.
 *
 * THUẦN (deps nhẹ: scene-planner + scene-preview + content-graph) → unit-test
 * offline được, KHÔNG kéo theo deps nặng của c3-animation (hub/audio/whisper…).
 *
 * Trả về:
 *  - `scenes`: [{id, intent, vars}] theo ĐÚNG thứ tự phát (topoSort) — composition
 *    lặp mảng này, mỗi cảnh gọi hàm dựng theo `intent`, lấy biến từ `vars`.
 *  - `sceneSpecs`: [{id, weight}] (weight = thời lượng kế hoạch) — đưa vào
 *    alignByWeights(Whisper) ở builder để ranh giới cảnh KHỚP GIỌNG ĐỌC; kết quả
 *    scene_times keyed theo node id, composition map scenes[].id → scene_times[id].
 *
 * Mapping node→archetype/biến DÙNG CHUNG `sceneSpecForNode` với preview cảnh lẻ
 * → "sửa trong Scene Studio = ra video đúng vậy".
 */
import { type ContentGraph, getNode } from "@/lib/content-graph";
import type { BrandKit } from "@/lib/design/brandkit";
import { planScenes } from "../scene-planner";
import { sceneSpecForNode } from "../scene-preview";

export type GraphScene = { id: string; intent: string; vars: Record<string, unknown> };
export type GraphSceneSpec = { id: string; weight: number };

/**
 * Cờ Phase 1 "Graph-driven build" (Hướng A). MẶC ĐỊNH TẮT — chỉ "1" mới bật
 * (undefined/""/"0"/"true" đều TẮT). Đặt ở module thuần này để unit-test được
 * (c3-animation kéo deps nặng nên khó test trực tiếp).
 *
 * Trạng thái: Part 1–4 ĐÃ XONG (builder + animation.html chế độ mảng-cảnh-động +
 * renderHash gồm storyboard). Nghiệm thu offline (tsc + 90/90 test) + headless ĐẠT.
 * ⚠ Trước khi đặt GRAPH_DRIVEN_C3=1 ở production PHẢI: (1) scp animation.html mới lên VPS
 *   + docker compose up -d --build (composition cũ chưa có nhánh graph → bật cờ = video hỏng);
 *   (2) nghiệm thu render thật §5.3 (BLUEPRINT_GRAPH_DRIVEN.md). Chưa làm 2 bước đó thì để cờ TẮT.
 */
export function graphDrivenEnabled(): boolean {
  return process.env.GRAPH_DRIVEN_C3 === "1";
}

export function buildGraphScenes(
  graph: ContentGraph,
  durationSec: number,
  kit: BrandKit | null,
  theme: string,
): { scenes: GraphScene[]; sceneSpecs: GraphSceneSpec[] } {
  const plan = planScenes(graph, { totalDurationSec: durationSec });
  const scenes: GraphScene[] = [];
  const sceneSpecs: GraphSceneSpec[] = [];
  for (const ps of plan.scenes) {
    const node = getNode(graph, ps.id);
    if (!node) continue; // phòng thủ: planScenes lấy id từ chính graph nên ~không xảy ra
    const spec = sceneSpecForNode(node, kit, theme);
    scenes.push({ id: ps.id, intent: spec.intent, vars: spec.vars });
    // A2 — weight theo LỜI ĐỌC (khớp giọng, hết "cảnh trôi nhanh hơn giọng"):
    //  - node text (có lời): weight = SỐ TỪ → cảnh giữ trên màn đúng lâu bằng lúc voice đọc ý đó.
    //  - node data (donut/bars/trend/bignum — KHÔNG lời): weight ≈ 0 → chỉ chiếm khe NGẮN, KHÔNG ăn
    //    thời gian cảnh có lời. alignByWeights cho cảnh data ~tối thiểu (≈2.2s) KHI đủ chỗ; nếu graph
    //    quá nhiều cảnh so với độ dài audio thì mọi cảnh co đều dưới mức đó (tổng luôn = độ dài audio).
    const spokenWords = node.kind === "text" ? String(node.text || "").trim().split(/\s+/).filter(Boolean).length : 0;
    sceneSpecs.push({ id: ps.id, weight: node.kind === "text" ? Math.max(1, spokenWords) : 0.01 });
  }
  return { scenes, sceneSpecs };
}

/**
 * Bọc buildGraphScenes thành shape biến {variables, sceneSpecs} mà buildAnimation đang
 * tiêu thụ (cùng shape với đường variantPrompts cũ → tái dùng nguyên pipeline timing).
 * `variables.graphDriven=true` + `variables.scenes` (JSON mảng cảnh có thứ tự) để composition
 * (chế độ mảng-cảnh-động — Part 3) đọc. Tách khỏi c3-animation để unit-test được shape.
 */
export function buildGraphAnimationVariables(
  graph: ContentGraph,
  durationSec: number,
  kit: BrandKit | null,
  theme: string,
): { variables: Record<string, unknown>; sceneSpecs: GraphSceneSpec[] } {
  const { scenes, sceneSpecs } = buildGraphScenes(graph, durationSec, kit, theme);
  return {
    variables: { graphDriven: true, scenes: JSON.stringify(scenes) },
    sceneSpecs,
  };
}
