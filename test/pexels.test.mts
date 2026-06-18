/**
 * Unit-test Pexels (C2 HYBRID). pexels.ts KHÔNG import singleton → test offline thuần
 * (fetch + key TIÊM). Chạy: node test/pexels.test.mts
 */
import {
  isC2Hybrid,
  toPexelsQuery,
  pickPortraitFile,
  searchPexelsClip,
} from "../src/lib/video/builders/pexels.ts";
import { eq, ok, done } from "./assert.mjs";

// ── 1) Cờ C2_HYBRID (env) ─────────────────────────────────────────────────
{
  const save = process.env.C2_HYBRID;
  delete process.env.C2_HYBRID;
  ok(!isC2Hybrid(), "C2_HYBRID chưa set → tắt (giữ C2 hiện tại)");
  process.env.C2_HYBRID = "1";
  ok(isC2Hybrid(), "C2_HYBRID=1 → bật");
  process.env.C2_HYBRID = "0";
  ok(!isC2Hybrid(), "C2_HYBRID=0 → tắt");
  if (save === undefined) delete process.env.C2_HYBRID; else process.env.C2_HYBRID = save;
}

// ── 2) toPexelsQuery — bỏ filler điện ảnh, giữ chủ thể ────────────────────
{
  const q = toPexelsQuery("cinematic hands counting cash, shallow depth of field, photorealistic 9:16");
  ok(!/cinematic|photorealistic|shallow/.test(q), "bỏ từ phong cách (cinematic/photorealistic/shallow)");
  ok(q.includes("hands") && q.includes("counting") && q.includes("cash"), "giữ chủ thể (hands counting cash)");
  ok(q.split(/\s+/).length <= 5, "tối đa ~5 từ");
  // toàn filler → rơi về 3 từ đầu prompt gốc (không rỗng)
  const f = toPexelsQuery("cinematic dramatic moody lighting");
  ok(f.length > 0, "toàn filler → vẫn có query fallback (không rỗng)");
  eq(toPexelsQuery(""), "", "rỗng → rỗng");
}

// ── 2b) toPexelsQuery — cảnh real-scene ĐA CHỦ ĐỀ (chủ thể + người + hành động) ──
{
  // Tài chính
  const qFin = toPexelsQuery("a young Vietnamese woman reviewing monthly bills at a kitchen table");
  ok(/woman/.test(qFin) && /(bills|kitchen|reviewing)/.test(qFin), "tài chính: giữ woman + chủ thể/hành động");
  ok(!/\byoung\b/.test(qFin), "bỏ modifier chung 'young'");
  ok(qFin.split(/\s+/).length <= 5, "tài chính: ≤5 từ");

  // Sức khoẻ — có chỉ dẫn máy quay đầu prompt
  const qHealth = toPexelsQuery("WIDE establishing shot of a person jogging through a city park at sunrise");
  ok(/jogging/.test(qHealth) && /park/.test(qHealth), "sức khoẻ: giữ jogging + park");
  ok(!/(wide|establishing|shot|through)/.test(qHealth), "sức khoẻ: bỏ chỉ dẫn máy quay/nối (wide/establishing/shot/through)");

  // Kỹ năng / nấu ăn — EXTREME CLOSE-UP
  const qSkill = toPexelsQuery("EXTREME CLOSE-UP of hands chopping fresh vegetables on a wooden board");
  ok(/hands/.test(qSkill) && /(chopping|vegetables)/.test(qSkill), "kỹ năng: giữ hands + hành động");
  ok(!/(extreme|close)/.test(qSkill), "kỹ năng: bỏ 'extreme'/'close'");

  // dedupe — từ lặp KHÔNG phí slot
  const qDup = toPexelsQuery("market market street food street vendor");
  const w = qDup.split(/\s+/);
  eq(w.length, new Set(w).size, "dedupe: không từ nào lặp trong query");
  ok(/market/.test(qDup) && /street/.test(qDup) && /vendor/.test(qDup), "dedupe: vẫn giữ đủ chủ thể duy nhất");
}

// ── 3) pickPortraitFile — chọn mp4 DỌC gần 1080×1920, phạt 4K ─────────────
{
  const files = [
    { link: "https://x/sd.mp4", file_type: "video/mp4", width: 360, height: 640 },
    { link: "https://x/hd.mp4", file_type: "video/mp4", width: 1080, height: 1920 }, // chuẩn
    { link: "https://x/uhd.mp4", file_type: "video/mp4", width: 2160, height: 3840 }, // 4K dọc → phạt
    { link: "https://x/land.mp4", file_type: "video/mp4", width: 1920, height: 1080 }, // ngang → loại
  ];
  const best = pickPortraitFile(files);
  eq(best?.link, "https://x/hd.mp4", "chọn 1080×1920 (gần target, không phải 4K/ngang)");
  eq(best?.width, 1080, "trả width");
  eq(best?.height, 1920, "trả height");

  // chỉ có ngang → null (không có file dọc)
  eq(pickPortraitFile([{ link: "https://x/l.mp4", file_type: "video/mp4", width: 1920, height: 1080 }]), null, "toàn ngang → null");
  // không mp4 → null
  eq(pickPortraitFile([{ link: "https://x/a.webm", file_type: "video/webm", width: 1080, height: 1920 }]), null, "không mp4 → null");
  eq(pickPortraitFile([]), null, "mảng rỗng → null");
  eq(pickPortraitFile(undefined), null, "undefined → null");
}

// ── 4) searchPexelsClip (mock fetch) ──────────────────────────────────────
const mkFetch = (route: (url: string) => { ok?: boolean; body?: unknown }) =>
  (async (url: string) => {
    const o = route(String(url));
    return { ok: o.ok !== false, json: async () => o.body ?? {} };
  }) as unknown as typeof fetch;

{
  const saveKey = process.env.PEXELS_API_KEY;
  const guard = (async () => { throw new Error("KHÔNG được fetch khi thiếu key"); }) as unknown as typeof fetch;

  // (a) không key → null, KHÔNG fetch
  delete process.env.PEXELS_API_KEY;
  eq(await searchPexelsClip("ocean waves NOKEY", { fetchImpl: guard }), null, "không key → null (không fetch)");

  // (b) hit: videos có file dọc → trả clip {url,durationSec,width,height}
  const fHit = mkFetch((url) => {
    ok(url.includes("/v1/videos/search"), "gọi endpoint /v1/videos/search");
    ok(url.includes("orientation=portrait"), "truyền orientation=portrait");
    return {
      ok: true,
      body: {
        videos: [
          { duration: 12, video_files: [{ link: "https://v/p.mp4", file_type: "video/mp4", width: 1080, height: 1920 }] },
        ],
      },
    };
  });
  const clip = await searchPexelsClip("rainy city street HIT", { fetchImpl: fHit, apiKey: "test_key" });
  eq(clip?.url, "https://v/p.mp4", "hit → url clip dọc");
  eq(clip?.durationSec, 12, "hit → duration giây");

  // (c) miss: videos rỗng → null
  const fMiss = mkFetch(() => ({ ok: true, body: { videos: [] } }));
  eq(await searchPexelsClip("zxqwe nothing MISS", { fetchImpl: fMiss, apiKey: "test_key" }), null, "videos rỗng → null");

  // (d) res không ok (429/401) → null
  const fErr = mkFetch(() => ({ ok: false }));
  eq(await searchPexelsClip("anything ERR", { fetchImpl: fErr, apiKey: "test_key" }), null, "res !ok → null");

  // (e) key từ ENV (không truyền apiKey) → vẫn fetch được
  process.env.PEXELS_API_KEY = "env_key";
  const fEnv = mkFetch(() => ({ ok: true, body: { videos: [{ duration: 8, video_files: [{ link: "https://v/e.mp4", file_type: "video/mp4", width: 1080, height: 1920 }] }] } }));
  eq((await searchPexelsClip("forest path ENV", { fetchImpl: fEnv }))?.url, "https://v/e.mp4", "key từ env → hit");

  if (saveKey === undefined) delete process.env.PEXELS_API_KEY; else process.env.PEXELS_API_KEY = saveKey;
}

done("pexels");
