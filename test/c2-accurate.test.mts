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
  resolveBrandDomain,
  planShotsAccurate,
  detectToolMention,
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

// ── 9) real-scene (C2 HYBRID): type hợp lệ + suffix NO-TEXT + parse ────────
{
  ok(suffixFor("real-scene") === SUFFIX_NOTEXT, "real-scene → suffix NO-TEXT (cảnh thực, không chữ)");
  ok(/no readable text/i.test(suffixFor("real-scene")), "real-scene suffix CẤM chữ (như concept)");
  // parseShotPlans NHẬN real-scene (không rớt về concept fallback)
  const rs = parseShotPlans(
    JSON.stringify([
      { imageType: "real-scene", prompt: "a busy evening street food market" },
      { imageType: "app-ui", entity: "Make.com", prompt: "Make.com editor" },
    ]),
    2,
    ["fb0", "fb1"]
  );
  eq(rs[0].imageType, "real-scene", "parseShotPlans GIỮ real-scene (không fallback concept)");
  eq(rs[0].prompt, "a busy evening street food market", "real-scene giữ prompt tả cảnh");
  eq(rs[0].domain, undefined, "real-scene KHÔNG có domain");
  eq(rs[1].imageType, "app-ui", "app-ui song song vẫn giữ");
}

// ── 10) preferRealScene gate prompt director (HYBRID vs accurate cũ) ───────
{
  let capturedSystem = "";
  let capturedUser = "";
  const captureLlm: DirectorLLM = {
    complete: async (req) => {
      capturedSystem = req.system || "";
      capturedUser = req.messages?.[0]?.content || "";
      return {
        text: JSON.stringify([
          { imageType: "real-scene", prompt: "a woman jogging in a park at sunrise" },
          { imageType: "app-ui", entity: "Make.com", prompt: "Make.com editor showing modules" },
        ]),
      };
    },
  };
  const base = {
    topic: "Sức khoẻ", scriptText: "Chạy bộ mỗi sáng", factHint: "",
    segments: ["Chạy bộ", "Theo dõi app"], fallbackPrompts: ["f0", "f1"], count: 2,
    llm: captureLlm, writerModel: "x",
  };

  // (a) preferRealScene=true → director ƯU TIÊN real-scene; giữ phân loại trả về
  const pHybrid = await planShotsAccurate({ ...base, preferRealScene: true });
  ok(/real-scene/.test(capturedSystem), "HYBRID: system prompt CÓ nhắc 'real-scene'");
  ok(/MẶC ĐỊNH/.test(capturedSystem), "HYBRID: real-scene là MẶC ĐỊNH cho đa số cảnh");
  ok(/MẶC ĐỊNH|real-scene/.test(capturedUser), "HYBRID: user prompt cũng hướng real-scene");
  // ĐỘ KHỚP LỜI: hybrid prompt phải BUỘC bám chủ thể+hành động của câu + CẤM cảnh phong cảnh/aerial lạc.
  ok(/BÁM ĐÚNG Ý/.test(capturedSystem) && /CHỦ THỂ/.test(capturedSystem), "HYBRID: buộc bám Ý đoạn lời (chủ thể+hành động)");
  ok(/aerial/i.test(capturedSystem), "HYBRID: CẤM cảnh aerial/phong cảnh chung chung (chống lạc đề)");
  ok(/aerial|phong cảnh/.test(capturedUser), "HYBRID: user prompt nhắc tránh cảnh lạc");
  // CHỐNG LẠC ĐỘNG-LỰC/GIÀU-SANG (bug 'báo cáo tài chính' → bãi biển): câu công việc/tiền phải ra
  // người làm việc cụ thể, CẤM du thuyền/bãi biển/thiền.
  ok(/yacht|du thuyền/i.test(capturedSystem) && /tự do tài chính/i.test(capturedSystem), "HYBRID: CẤM biểu tượng giàu-sang (yacht...) cho câu công việc/tiền/động lực");
  eq(pHybrid[0].imageType, "real-scene", "HYBRID: giữ real-scene từ director");
  eq(pHybrid[1].imageType, "app-ui", "HYBRID: app-ui vẫn AI (không ép real-scene)");

  // (b) preferRealScene mặc định (false) → prompt director Y NGUYÊN bản cũ.
  // HARD INVARIANT: pin CHÍNH XÁC TỪNG BYTE (không chỉ substring) — system+user được ráp từ mảnh
  // dùng CHUNG với nhánh hybrid (sysIntro/sysOutro/preamble), nên chỉnh các mảnh đó có thể vô tình
  // làm TRÔI prompt accurate cũ mà substring-check vẫn xanh. OLD_* là BẢN SAO ĐỘC LẬP của prompt cũ.
  const OLD_SYSTEM =
    "Bạn là ĐẠO DIỄN HÌNH ẢNH cho video dọc 9:16. Với MỖI cảnh, làm 2 việc: (1) PHÂN LOẠI imageType, (2) viết PROMPT ảnh tiếng Anh CỤ THỂ bám ĐÚNG entity (tên brand/tool/sản phẩm) và SỐ thật trong lời — TUYỆT ĐỐI không chung chung kiểu 'glowing app interface'. " +
    "imageType — ƯU TIÊN cảnh ĐANG DÙNG (màn hình/thao tác/thiết bị thật) hơn là chỉ logo: " +
    "'app-ui' = câu mô tả DÙNG phần mềm/app/màn hình/thiết bị-có-màn-hình (kể cả Apple Watch hiện nhịp tim, điện thoại hiện thông báo) → prompt mô tả UI realistic CÓ chữ ĐÚNG tool (vd 'the Make.com scenario editor showing connected modules and a Google Sheets row being filled', 'a phone showing a +500,000đ bank payment notification', 'an Apple Watch face showing 128 bpm heart rate while running'). " +
    "'product' = THIẾT BỊ/vật phẩm vật lý đang dùng (vd đồng hồ trên cổ tay khi chạy bộ, máy POS quẹt thẻ) → ảnh sản phẩm realistic trong bối cảnh dùng. " +
    "'brand' = CHỈ khi trọng tâm là NHẬN DIỆN thương hiệu/logo — câu giới thiệu/nhắc TÊN công ty mà KHÔNG mô tả thao tác/màn hình cụ thể → cần logo thật; entity=tên brand, domain=domain đoán (sepay.vn, make.com, zalo.me, notion.so). ĐỪNG chọn brand nếu câu đang nói VỀ DÙNG sản phẩm — khi đó chọn app-ui/product. " +
    "'chart' = số liệu/biểu đồ → biểu đồ trong bối cảnh, có nhãn số đúng. " +
    "'concept' = cảm xúc/trừu tượng → b-roll điện ảnh KHÔNG chữ. " +
    "Chỉ trả JSON: mảng object {imageType, entity, domain, prompt} đúng thứ tự, KHÔNG giải thích.";
  const OLD_USER =
    `CHỦ ĐỀ: Sức khoẻ\n\nKỊCH BẢN (đọc để lấy entity/số):\n"""Chạy bộ mỗi sáng"""\n\n` +
    `CÁC CẢNH (đoạn lời tương ứng):\n1. Chạy bộ\n2. Theo dõi app\n\n` +
    `Trả JSON mảng ĐÚNG 2 object {imageType, entity, domain, prompt}. Mỗi prompt bám entity/số của đoạn lời đó; brand → entity+domain; app-ui → mô tả UI có chữ đúng tool; concept → cảnh điện ảnh không chữ.`;
  capturedSystem = "";
  capturedUser = "";
  await planShotsAccurate({ ...base });
  ok(!/real-scene/.test(capturedSystem), "ACCURATE cũ: system prompt KHÔNG nhắc real-scene");
  eq(capturedSystem, OLD_SYSTEM, "ACCURATE cũ: system prompt Y NGUYÊN TỪNG BYTE bản cũ");
  eq(capturedUser, OLD_USER, "ACCURATE cũ: user prompt Y NGUYÊN TỪNG BYTE bản cũ");
}

// ── 8) resolveBrandDomain (async, mock fetchImpl) ─────────────────────────
{
  const saveSecret = process.env.LOGODEV_SECRET;
  const guard = (async () => { throw new Error("KHÔNG được fetch"); }) as unknown as typeof fetch;

  // (a) known-hit → KHÔNG fetch
  delete process.env.LOGODEV_SECRET;
  eq(await resolveBrandDomain("SePay", { fetchImpl: guard }), "sepay.vn", "known-hit → sepay.vn (không fetch)");
  // (b) đã là domain → giữ, KHÔNG fetch
  eq(await resolveBrandDomain("acme-widgets.io", { fetchImpl: guard }), "acme-widgets.io", "đã là domain → giữ");

  // (c) search-hit (có LOGODEV_SECRET) → domain top từ Logo.dev
  process.env.LOGODEV_SECRET = "sk_test";
  const fSearch = (async (url: string) => {
    if (String(url).includes("api.logo.dev/search")) return { ok: true, json: async () => [{ name: "Spotify", domain: "spotify.com" }, { name: "x", domain: "x.io" }] };
    throw new Error("unexpected " + url);
  }) as unknown as typeof fetch;
  eq(await resolveBrandDomain("SpotifyXyz", { fetchImpl: fSearch }), "spotify.com", "search-hit → domain[0]");

  // (d) search-miss (có key, search rỗng) → heuristic '.com' (KHÔNG probe .vn)
  const fMiss = (async (url: string) => {
    if (String(url).includes("api.logo.dev/search")) return { ok: true, json: async () => [] }; // miss
    throw new Error("heuristic .com KHÔNG được fetch ngoài search: " + url);
  }) as unknown as typeof fetch;
  eq(await resolveBrandDomain("TimeasVN", { fetchImpl: fMiss }), "timeasvn.com", "search-miss → heuristic .com (không probe .vn)");

  // (e) không key → heuristic '.com', KHÔNG fetch gì
  delete process.env.LOGODEV_SECRET;
  eq(await resolveBrandDomain("GlobalCorpZz", { fetchImpl: guard }), "globalcorpzz.com", "không key → heuristic .com (không fetch)");

  if (saveSecret === undefined) delete process.env.LOGODEV_SECRET; else process.env.LOGODEV_SECRET = saveSecret;
}

// ── detectToolMention — câu nhắc tool → list tool (để director ưu tiên app-ui); KHÔNG false-match từ chung ──
{
  ok(detectToolMention("giờ n8n sẽ tự động lấy data khách hàng").includes("n8n"), "n8n → khớp");
  const z = detectToolMention("dùng Zapier kết nối Facebook Lead Ads với Google Sheets");
  ok(z.includes("zapier") && z.includes("google sheets") && z.includes("facebook lead"), "Zapier + Google Sheets + Facebook Lead → khớp");
  ok(detectToolMention("xây dựng một workflow automation cho CRM").length >= 2, "workflow/automation/crm → khớp");
  eq(detectToolMention("hôm nay trời đẹp, cảm xúc dâng trào").length, 0, "câu cảm xúc không tool → []");
  eq(detectToolMention("").length, 0, "rỗng → []");
  eq(detectToolMention("làm việc chăm chỉ mỗi ngày").length, 0, "KHÔNG false-match (không có 'make'/'work' từ chung)");
}

done("c2-accurate");
