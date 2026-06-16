/**
 * Unit-test planScenes + isValidGraph (Phase 1 §5.1).
 * Chạy: node --import ./test/_alias.mjs test/scene-planner.test.mts
 */
import type { ContentGraph } from "../src/lib/content-graph/index.ts";
import { planScenes, isValidGraph, sceneTimesFromPlan } from "../src/lib/video/scene-planner.ts";
import { eq, ok, done } from "./assert.mjs";

const T = (id: string, durationSec?: number, frameIntent?: string): unknown =>
  ({ id, kind: "text", text: id.toUpperCase(), durationSec, frameIntent });

const seqGraph: ContentGraph = {
  schemaVersion: 1,
  intent: "explainer",
  synopsis: "demo",
  nodes: [T("hook", 2, "hook"), T("p1", 4), T("p2", 4), T("cta", 2, "cta")] as ContentGraph["nodes"],
  edges: [
    { from: "hook", to: "p1", kind: "sequence" },
    { from: "p1", to: "p2", kind: "sequence" },
    { from: "p2", to: "cta", kind: "sequence" },
  ],
};

// 1) Thứ tự + scale timing theo totalDurationSec
{
  const plan = planScenes(seqGraph, { totalDurationSec: 24 }); // rawTotal=12 → scale ×2
  eq(plan.scenes.map((s) => s.id), ["hook", "p1", "p2", "cta"], "thứ tự topoSort theo sequence");
  eq(plan.scenes[0].start, 0, "scene đầu start=0");
  eq([plan.scenes[0].dur, plan.scenes[1].dur, plan.scenes[2].dur], [4, 8, 8], "dur scale ×2 (trừ cảnh cuối)");
  eq(plan.scenes[1].start, 4, "start cộng dồn");
  eq(plan.scenes[2].start, 12, "start cộng dồn 2");
  eq(plan.totalSec, 24, "totalSec = target");
  eq(plan.intent, "explainer", "giữ intent graph");
  const sum = plan.scenes.reduce((a, s) => a + s.dur, 0);
  eq(Math.round(sum * 100) / 100, 24, "tổng dur = target (cảnh cuối khử trôi)");
}

// 2) Không có totalDurationSec → dùng rawTotal (durationSec node, mặc định 3s)
{
  const g: ContentGraph = { schemaVersion: 1, intent: "other", nodes: [T("a"), T("b", 5)] as ContentGraph["nodes"], edges: [] };
  const plan = planScenes(g); // a: mặc định 3s, b: 5s → tổng 8
  eq(plan.totalSec, 8, "rawTotal = 3 (mặc định) + 5");
  eq(plan.scenes[0].dur, 3, "node thiếu durationSec → mặc định 3s");
}

// 3) Dependency edge ép thứ tự (đảo so với thứ tự mảng)
{
  const g: ContentGraph = {
    schemaVersion: 1, intent: "other",
    nodes: [T("a"), T("b")] as ContentGraph["nodes"],
    edges: [{ from: "b", to: "a", kind: "dependency" }], // a phụ thuộc b → b trước a
  };
  const plan = planScenes(g);
  eq(plan.scenes.map((s) => s.id), ["b", "a"], "dependency: b trước a (đảo thứ tự mảng)");
}

// 4) PlannedScene mang theo payload đúng kind
{
  const g: ContentGraph = {
    schemaVersion: 1, intent: "data-viz",
    nodes: [
      { id: "d", kind: "data", data: { value: 9 }, durationSec: 3 },
      { id: "t", kind: "text", text: "xin chào", durationSec: 3 },
    ] as ContentGraph["nodes"],
    edges: [{ from: "d", to: "t", kind: "sequence" }],
  };
  const plan = planScenes(g);
  eq((plan.scenes[0] as { data?: unknown }).data, { value: 9 }, "scene data mang payload data");
  eq((plan.scenes[1] as { text?: string }).text, "xin chào", "scene text mang payload text");
}

// 5) isValidGraph — guard null/empty/cycle, true cho graph hợp lệ
{
  ok(isValidGraph(seqGraph) === true, "graph hợp lệ → true");
  ok(isValidGraph(null) === false, "null → false");
  ok(isValidGraph(undefined) === false, "undefined → false");
  ok(isValidGraph({ schemaVersion: 1, intent: "other", nodes: [], edges: [] } as ContentGraph) === false, "nodes rỗng → false");
  ok(isValidGraph({ schemaVersion: 1, intent: "other", nodes: [T("a")] as ContentGraph["nodes"] } as ContentGraph) === false, "thiếu edges → false");
  const cyc: ContentGraph = {
    schemaVersion: 1, intent: "other",
    nodes: [T("a"), T("b")] as ContentGraph["nodes"],
    edges: [{ from: "a", to: "b", kind: "dependency" }, { from: "b", to: "a", kind: "dependency" }],
  };
  ok(isValidGraph(cyc) === false, "cycle dependency → false");
  // contrast là 1 trong 3 EdgeKind; validate KHÔNG ràng buộc loại edge → contrast-only vẫn hợp lệ
  const contrastOnly: ContentGraph = {
    schemaVersion: 1, intent: "comparison",
    nodes: [T("a"), T("b")] as ContentGraph["nodes"],
    edges: [{ from: "a", to: "b", kind: "contrast" }],
  };
  ok(isValidGraph(contrastOnly) === true, "contrast-only → hợp lệ");
}

// 6) sceneTimesFromPlan: ScenePlan → {id:{start,dur}} (cầu nối scene_times)
{
  const plan = planScenes(seqGraph, { totalDurationSec: 24 });
  const st = sceneTimesFromPlan(plan);
  eq(Object.keys(st).sort(), ["cta", "hook", "p1", "p2"], "sceneTimesFromPlan đủ id");
  eq(st.hook, { start: 0, dur: 4 }, "sceneTimesFromPlan giữ start/dur theo plan");
}

done("planScenes + isValidGraph");
