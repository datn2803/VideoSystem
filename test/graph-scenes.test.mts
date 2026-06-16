/**
 * Unit-test buildGraphScenes (Phase 1 §6.2) — storyboard → mảng cảnh động.
 * Chạy: node --import ./test/_alias.mjs test/graph-scenes.test.mts
 */
import type { ContentGraph } from "../src/lib/content-graph/index.ts";
import { buildGraphScenes, buildGraphAnimationVariables, graphDrivenEnabled } from "../src/lib/video/builders/graph-scenes.ts";
import { eq, ok, done } from "./assert.mjs";

const graph: ContentGraph = {
  schemaVersion: 1,
  intent: "explainer",
  nodes: [
    { id: "hook", kind: "text", text: "Bạn lãng phí thời gian mỗi ngày", label: "Lãng phí", frameIntent: "hook", durationSec: 3 },
    { id: "big", kind: "data", frameIntent: "data-big", label: "Người dùng", data: { value: 65, unit: "giờ", label: "mỗi tháng" }, durationSec: 3 },
    { id: "pt", kind: "text", text: "Một ý chính cần nhớ", durationSec: 3 },
    { id: "cta", kind: "text", text: "Theo dõi ngay", frameIntent: "cta", durationSec: 3 },
  ] as ContentGraph["nodes"],
  edges: [
    { from: "hook", to: "big", kind: "sequence" },
    { from: "big", to: "pt", kind: "sequence" },
    { from: "pt", to: "cta", kind: "sequence" },
  ],
};

// 1) scenes theo ĐÚNG thứ tự phát + intent chuẩn hoá theo từng node
{
  const { scenes, sceneSpecs } = buildGraphScenes(graph, 20, null, "2");
  eq(scenes.map((s) => s.id), ["hook", "big", "pt", "cta"], "scenes đúng thứ tự topoSort");
  eq(scenes.map((s) => s.intent), ["hook", "bignum", "points", "cta"], "intent chuẩn hoá theo node");
  // vars đúng archetype
  eq(scenes[0].vars.hook_keyword, "Lãng phí", "hook vars dùng chung sceneSpecForNode");
  eq(scenes[1].vars.bignum_value, "65", "bignum vars");
  eq(JSON.parse(String(scenes[2].vars.points))[0].text, "Một ý chính cần nhớ", "points vars");
  eq(scenes[3].vars.cta_keyword, "Theo dõi ngay", "cta vars");

  // 2) sceneSpecs khớp id + A2 weight theo LỜI ĐỌC (text=số từ, data≈0) → đưa vào alignByWeights
  eq(sceneSpecs.map((s) => s.id), ["hook", "big", "pt", "cta"], "sceneSpecs id khớp scenes");
  ok(sceneSpecs.every((s) => s.weight > 0), "mọi weight > 0");
  eq(sceneSpecs[0].weight, 7, "hook weight = số từ lời đọc (7)");
  ok(sceneSpecs[1].weight < 0.5, "data node (big) weight ≈ 0 (không ăn thời gian cảnh có lời)");
  eq(sceneSpecs[2].weight, 5, "pt (point) weight = số từ (5)");
  eq(sceneSpecs[3].weight, 3, "cta weight = số từ (3)");
}

// 3) Một node duy nhất vẫn ra 1 cảnh (n=1)
{
  const g: ContentGraph = { schemaVersion: 1, intent: "single-frame", nodes: [{ id: "only", kind: "text", text: "Chào" }] as ContentGraph["nodes"], edges: [] };
  const { scenes, sceneSpecs } = buildGraphScenes(g, 6, null, "0");
  eq(scenes.length, 1, "1 node → 1 cảnh");
  eq(scenes[0].intent, "points", "node text đơn → points");
  eq(sceneSpecs.length, 1, "1 sceneSpec");
}

// 4) Anti-fab: node data rỗng → points text rỗng (không bịa), vẫn có cảnh
{
  const g: ContentGraph = {
    schemaVersion: 1, intent: "other",
    nodes: [{ id: "empty", kind: "data", data: {} }] as ContentGraph["nodes"], edges: [],
  };
  const { scenes } = buildGraphScenes(g, 4, null, "1");
  eq(JSON.parse(String(scenes[0].vars.points))[0].text, "", "anti-fab: không bịa nội dung");
}

// 5) graphDrivenEnabled: MẶC ĐỊNH TẮT — chỉ "1" mới bật (brief ưu tiên #2)
{
  const orig = process.env.GRAPH_DRIVEN_C3;
  delete process.env.GRAPH_DRIVEN_C3; ok(graphDrivenEnabled() === false, "không set → TẮT");
  process.env.GRAPH_DRIVEN_C3 = "0"; ok(graphDrivenEnabled() === false, "'0' → TẮT");
  process.env.GRAPH_DRIVEN_C3 = "true"; ok(graphDrivenEnabled() === false, "'true' → TẮT (chỉ '1' mới bật)");
  process.env.GRAPH_DRIVEN_C3 = "1"; ok(graphDrivenEnabled() === true, "'1' → BẬT");
  if (orig === undefined) delete process.env.GRAPH_DRIVEN_C3; else process.env.GRAPH_DRIVEN_C3 = orig;
}

// 6) buildGraphAnimationVariables: shape {graphDriven:true, scenes:JSON} + sceneSpecs khớp (brief #3)
{
  const { variables, sceneSpecs } = buildGraphAnimationVariables(graph, 20, null, "2");
  eq(variables.graphDriven, true, "variables.graphDriven=true");
  ok(typeof variables.scenes === "string", "variables.scenes là chuỗi JSON");
  const arr = JSON.parse(String(variables.scenes));
  eq(arr.map((s: { id: string }) => s.id), ["hook", "big", "pt", "cta"], "scenes JSON đúng thứ tự");
  ok(arr.every((s: object) => "intent" in s && "vars" in s), "mỗi scene có intent+vars");
  eq(sceneSpecs.map((s) => s.id), ["hook", "big", "pt", "cta"], "sceneSpecs id khớp scenes");
  ok(sceneSpecs.every((s) => typeof s.weight === "number" && s.weight > 0), "weight số > 0");
}

done("buildGraphScenes");
