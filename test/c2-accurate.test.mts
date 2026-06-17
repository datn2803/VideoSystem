/**
 * Unit-test C2 ACCURATE (BLUEPRINT_C2_V2). c2-accurate.ts KHÔNG import singleton →
 * test offline thuần (llm + fetch được TIÊM). Chạy: node test/c2-accurate.test.mts
 */
import {
  isC2Accurate,
  c2AccurateQuality,
  suffixFor,
  guessDomain,
  brandScenePrompt,
  parseShotPlans,
  fetchBrandLogo,
  planShotsAccurate,
  SUFFIX_NOTEXT,
  SUFFIX_TEXT,
  type DirectorLLM,
} from "../src/lib/video/builders/c2-accurate.ts";
import { eq, ok, done } from "./assert.mjs";

// ── 1) Cờ + quality (env) ─────────────────────────────────────────────────
{
  const save = { acc: process.env.C2_ACCURATE, q: process.env.C2_IMAGE_QUALITY };
  delete process.env.C2_ACCURATE;
  ok(!isC2Accurate(), "C2_ACCURATE chưa set → tắt (giữ C2 cũ)");
  process.env.C2_ACCURATE = "1";
  ok(isC2Accurate(), "C2_ACCURATE=1 → bật");
  delete process.env.C2_IMAGE_QUALITY;
  eq(c2AccurateQuality(), "medium", "quality mặc định = medium");
  process.env.C2_IMAGE_QUALITY = "high";
  eq(c2AccurateQuality(), "high", "quality=high tôn trọng env");
  process.env.C2_IMAGE_QUALITY = "ultra"; // sai → medium
  eq(c2AccurateQuality(), "medium", "quality rác → medium");
  process.env.C2_ACCURATE = save.acc ?? "";
  if (save.acc === undefined) delete process.env.C2_ACCURATE;
  if (save.q === undefined) delete process.env.C2_IMAGE_QUALITY; else process.env.C2_IMAGE_QUALITY = save.q;
}

// ── 2) Suffix tách nhánh (mục C) ──────────────────────────────────────────
{
  ok(suffixFor("concept") === SUFFIX_NOTEXT, "concept → suffix NO-TEXT");
  ok(/no readable text/i.test(suffixFor("concept")), "concept suffix CẤM chữ");
  ok(suffixFor("app-ui") === SUFFIX_TEXT, "app-ui → suffix CHO PHÉP chữ");
  ok(/legible/i.test(suffixFor("brand")), "brand suffix cho phép chữ (legible)");
  ok(/legible/i.test(suffixFor("chart")), "chart suffix cho phép chữ");
}

// ── 3) guessDomain ────────────────────────────────────────────────────────
{
  eq(guessDomain("SePay"), "sepay.vn", "SePay → sepay.vn (known)");
  eq(guessDomain("make.com"), "make.com", "đã là domain → giữ");
  eq(guessDomain("Zalo"), "zalo.me", "Zalo → zalo.me");
  eq(guessDomain("Google Sheets"), "sheets.google.com", "Google Sheets → sheets.google.com");
  eq(guessDomain("FooBar"), "foobar.com", "brand lạ → thử .com");
  eq(guessDomain(""), null, "rỗng → null");
  eq(guessDomain(undefined), null, "undefined → null");
}

// ── 4) brandScenePrompt ───────────────────────────────────────────────────
{
  const p = brandScenePrompt("SePay");
  ok(p.includes("SePay"), "brandScenePrompt chứa tên brand");
  ok(/brand logo/i.test(p) && /legible/i.test(p), "brandScenePrompt: logo reference + cho phép chữ");
}

// ── 5) parseShotPlans (PURE) ──────────────────────────────────────────────
{
  const fb = ["FB0 cinematic", "FB1 cinematic", "FB2 cinematic"];
  // brand không kèm domain → tự guessDomain; app-ui → domain undefined
  const good = JSON.stringify([
    { imageType: "brand", entity: "SePay", prompt: "SePay brand card on phone" },
    { imageType: "app-ui", entity: "Make.com", prompt: "Make.com scenario editor with modules" },
    { imageType: "concept", prompt: "cinematic hands counting cash" },
  ]);
  const plans = parseShotPlans(good, 3, fb);
  eq(plans.length, 3, "đúng count");
  eq(plans[0].imageType, "brand", "shot0 = brand");
  eq(plans[0].domain, "sepay.vn", "brand thiếu domain → guessDomain");
  eq(plans[1].imageType, "app-ui", "shot1 = app-ui");
  eq(plans[1].domain, undefined, "app-ui KHÔNG có domain");
  eq(plans[2].imageType, "concept", "shot2 = concept");

  // imageType sai / prompt rỗng → fallback concept + prompt cũ
  const bad = JSON.stringify([
    { imageType: "weird", prompt: "x" },
    { imageType: "brand", prompt: "" },
  ]);
  const p2 = parseShotPlans(bad, 3, fb);
  eq(p2[0].imageType, "concept", "imageType lạ → concept");
  eq(p2[0].prompt, "FB0 cinematic", "→ dùng fallback prompt cũ");
  eq(p2[1].prompt, "FB1 cinematic", "prompt rỗng → fallback");
  eq(p2[2].prompt, "FB2 cinematic", "thiếu phần tử → fallback (đủ count)");

  // markdown fence + không phải JSON
  const fenced = "```json\n" + good + "\n```";
  ok(parseShotPlans(fenced, 3, fb)[0].imageType === "brand", "bóc ```json fence");
  const junk = parseShotPlans("xin chào không phải json", 2, fb);
  eq(junk[0].imageType, "concept", "non-JSON → toàn concept fallback");
  eq(junk[0].prompt, "FB0 cinematic", "non-JSON → prompt fallback");
}

// ── 6) fetchBrandLogo (mock fetch) ────────────────────────────────────────
type MockOpt = { ok?: boolean; ct?: string; size?: number };
const mkFetch = (route: (url: string) => MockOpt) =>
  (async (url: string) => {
    const o = route(String(url));
    return {
      ok: o.ok !== false,
      headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? (o.ct ?? "image/png") : null) },
      arrayBuffer: async () => new Uint8Array(o.size ?? 1000).buffer,
    };
  }) as unknown as typeof fetch;

{
  // (a) clearbit trả ảnh hợp lệ → nhận
  const okLogo = await fetchBrandLogo("sepay.vn", mkFetch(() => ({ ok: true, ct: "image/png", size: 4000 })));
  ok(okLogo !== null && okLogo.buffer.length === 4000, "logo hợp lệ → trả buffer");
  eq(okLogo?.contentType, "image/png", "giữ content-type");

  // (b) tất cả !ok → null
  const none = await fetchBrandLogo("sepay.vn", mkFetch(() => ({ ok: false })));
  eq(none, null, "mọi nguồn fail → null (fallback AI)");

  // (c) content-type không phải ảnh (html error page) → bỏ → null
  const html = await fetchBrandLogo("sepay.vn", mkFetch(() => ({ ok: true, ct: "text/html", size: 4000 })));
  eq(html, null, "content-type !image → bỏ");

  // (d) ảnh quá nhỏ (placeholder 1x1) → bỏ → null
  const tiny = await fetchBrandLogo("sepay.vn", mkFetch(() => ({ ok: true, ct: "image/png", size: 100 })));
  eq(tiny, null, "buffer < 512 bytes → bỏ");

  // (e) domain rỗng → null không gọi fetch
  let called = false;
  const guard = (async () => { called = true; return new Response(); }) as unknown as typeof fetch;
  eq(await fetchBrandLogo("", guard), null, "domain rỗng → null");
  ok(!called, "domain rỗng → KHÔNG gọi fetch");
}

// ── 7) planShotsAccurate (llm tiêm) ───────────────────────────────────────
{
  const seg = ["Dùng SePay nhận tiền", "Make.com đẩy vào Sheets", "Tiết kiệm thời gian"];
  const fb = ["FB0", "FB1", "FB2"];
  // llm trả JSON tốt
  const goodLlm: DirectorLLM = {
    complete: async () => ({
      text: JSON.stringify([
        { imageType: "brand", entity: "SePay", domain: "sepay.vn", prompt: "SePay app notification" },
        { imageType: "app-ui", prompt: "Make.com editor pushing data to Google Sheets" },
        { imageType: "concept", prompt: "clock saving time cinematic" },
      ]),
      costUsd: 0.001,
      tokensIn: 100,
      tokensOut: 50,
    }),
  };
  let usage = 0;
  const plans = await planShotsAccurate({
    topic: "Tự động đối soát", scriptText: "SePay ... Make.com ... Sheets", factHint: "SePay 15 giây",
    segments: seg, fallbackPrompts: fb, count: 3, llm: goodLlm, writerModel: "x",
    onUsage: (c) => { usage += c; },
  });
  eq(plans[0].imageType, "brand", "planner: shot0 brand");
  eq(plans[0].domain, "sepay.vn", "planner: domain giữ");
  eq(plans[1].imageType, "app-ui", "planner: shot1 app-ui");
  ok(usage > 0, "onUsage được gọi (đo chi phí director)");

  // llm THROW → toàn concept fallback (an toàn, không phá pipeline)
  const badLlm: DirectorLLM = { complete: async () => { throw new Error("LLM down"); } };
  const p2 = await planShotsAccurate({
    topic: "x", scriptText: "y", factHint: "", segments: seg, fallbackPrompts: fb, count: 3,
    llm: badLlm, writerModel: "x",
  });
  eq(p2.map((p) => p.imageType), ["concept", "concept", "concept"], "LLM lỗi → toàn concept");
  eq(p2[0].prompt, "FB0", "LLM lỗi → prompt fallback cũ");
}

done("c2-accurate");
