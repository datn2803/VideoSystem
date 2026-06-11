/**
 * Cost-guard (Phase 3, siết P0 review đợt 2) — các call trả phí gate sau đây.
 *
 * PHẠM VI THẬT (đối soát P0.3 — đừng nói quá): ảnh AI (b-roll/preview/hero),
 * avatar HeyGen/D-ID, TTS ElevenLabs, nhạc MiniMax, Whisper = ĐỀU qua
 * isLive + assertDailyCap + record usage. NGOẠI LỆ CÓ CHỦ ĐÍCH: (1) LLM Gemini
 * (planner/scripter/auditor/đạo diễn ảnh) KHÔNG gate isLive — là core flow,
 * free-tier/grounding 1500 lượt/ngày, usage vẫn record qua recordLLMUsage;
 * (2) render VPS self-host $0 — chỉ tắt ở mode mock.
 *
 * RENDER_MODE = "mock" | "dryrun" | "live" (env):
 *  - mock   — KHÔNG gọi gì hết (kể cả VPS $0): render placeholder, test pipeline.
 *  - dryrun — DEFAULT: render self-host VPS ($0) chạy bình thường, nhưng MỌI
 *             provider TRẢ PHÍ (HeyGen avatar, gpt-image, …) bị tắt → C1 mock,
 *             C2 nền gradient. Đây chính là hành vi cũ khi RENDER_LIVE≠1.
 *  - live   — bật tất cả (sau xác nhận ở UI + trần chi phí/ngày).
 * Backward-compat: không set RENDER_MODE → RENDER_LIVE==="1" nghĩa là live.
 *
 * Trần chi phí/ngày: DAILY_COST_CAP_USD (default 5) — cộng dồn MỌI usage
 * (provider_usage) hôm nay; chạm trần → assertDailyCap throw, action báo rõ.
 */
import { store } from "@/lib/integration-hub/storage";
import { kvRead, kvWrite } from "@/lib/backend/kv-store";

export type RenderMode = "mock" | "dryrun" | "live";

export function renderMode(): RenderMode {
  const m = (process.env.RENDER_MODE || "").toLowerCase();
  if (m === "mock" || m === "dryrun" || m === "live") return m;
  return process.env.RENDER_LIVE === "1" ? "live" : "dryrun";
}

/** Cho phép gọi provider TRẢ PHÍ không (ảnh AI, avatar HeyGen…). */
export function isLive(): boolean {
  return renderMode() === "live";
}

/** Cho phép render self-host VPS ($0) không — chỉ mock mới tắt. */
export function allowSelfHostRender(): boolean {
  return renderMode() !== "mock";
}

export function dailyCapUsd(): number {
  const n = Number(process.env.DAILY_COST_CAP_USD);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

// Usage cho dịch vụ NGOÀI Integration Hub (vd nhạc MiniMax key env) — KV riêng,
// vẫn cộng vào spendTodayUsd để trần/ngày đếm đủ.
const EXTRA_KEY = "extra-usage";
type ExtraUsage = { date: string; label: string; costUsd: number };

export async function recordExtraUsage(label: string, costUsd: number): Promise<void> {
  const list = await kvRead<ExtraUsage[]>(EXTRA_KEY, []);
  list.push({ date: new Date().toISOString().slice(0, 10), label, costUsd });
  // Giữ gọn: chỉ lưu 60 ngày gần nhất
  const cutoff = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  await kvWrite(EXTRA_KEY, list.filter((u) => u.date >= cutoff));
  consumeReserve(costUsd); // quyết toán đặt chỗ (P1.1)
}

/** Tổng chi phí ước tính ĐÃ ghi nhận hôm nay (mọi provider + extra). */
export async function spendTodayUsd(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const usage = await store.listUsage();
  const hub = usage.filter((u) => u.date === today).reduce((s, u) => s + (u.costEstimateUsd || 0), 0);
  const extra = (await kvRead<ExtraUsage[]>(EXTRA_KEY, []))
    .filter((u) => u.date === today)
    .reduce((s, u) => s + (u.costUsd || 0), 0);
  return hub + extra;
}

// ── Chống TOCTOU trần/ngày (P1.1 review đợt 2) ──
// Vấn đề cũ: assert ĐỌC spend rồi caller mới GHI usage — N nhánh song song
// (buildAll p-limit) cùng đọc spend cũ → cùng qua → vượt trần.
// Vá: "đặt chỗ trước, quyết toán sau" TRONG PROCESS — (1) serialize toàn bộ
// assert qua 1 promise-chain (không còn 2 assert đọc cùng lúc); (2) khoản đã
// assert được ĐẶT CHỖ (reserve) và tính vào lần assert sau; (3) record*Usage
// quyết toán → nhả chỗ (khoản đã nằm trong spendToday, giữ reserve nữa là
// double-count); (4) call fail không record → reserve TỰ HẾT HẠN sau 5 phút.
// Giới hạn còn lại (ghi nhận): nhiều INSTANCE serverless song song vẫn có thể
// vượt nhẹ (KV không atomic) — vector chính (song song trong 1 invocation) đã chặn.
const RESERVE_TTL_MS = 5 * 60_000;
let reserves: { usd: number; at: number }[] = [];
let assertChain: Promise<void> = Promise.resolve();

function reservedNowUsd(): number {
  const cutoff = Date.now() - RESERVE_TTL_MS;
  reserves = reserves.filter((r) => r.at >= cutoff && r.usd > 0);
  return reserves.reduce((s, r) => s + r.usd, 0);
}

/** Quyết toán: usage thật đã ghi vào KV → trừ dần phần đã đặt chỗ (FIFO, clamp ≥0). */
export function consumeReserve(usd: number): void {
  let left = Math.max(0, usd);
  for (const r of reserves) {
    if (left <= 0) break;
    const take = Math.min(r.usd, left);
    r.usd -= take;
    left -= take;
  }
  reserves = reserves.filter((r) => r.usd > 0);
}

/**
 * Chặn TRƯỚC khi tốn tiền: (spend hôm nay + đã đặt chỗ + ước tính lần này) vượt
 * trần → throw message rõ (action bắt + hiện UI). Qua được = ước tính ĐÃ được
 * đặt chỗ. Gọi ở MỌI điểm sắp gọi provider trả phí.
 */
export async function assertDailyCap(estimatedUsd: number, label: string): Promise<void> {
  const run = assertChain.then(async () => {
    const spent = await spendTodayUsd();
    const reserved = reservedNowUsd();
    const cap = dailyCapUsd();
    if (spent + reserved + estimatedUsd > cap) {
      throw new Error(
        `Trần chi phí/ngày chạm mức: đã dùng ~$${spent.toFixed(2)}` +
          (reserved > 0 ? ` + đang đặt chỗ ~$${reserved.toFixed(2)}` : "") +
          ` + ${label} ~$${estimatedUsd.toFixed(2)} > trần $${cap}/ngày. Đợi mai hoặc nâng DAILY_COST_CAP_USD.`
      );
    }
    reserves.push({ usd: estimatedUsd, at: Date.now() });
  });
  // giữ chain sống kể cả khi run reject (nuốt ở nhánh chain, KHÔNG nuốt với caller)
  assertChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

/** Ghi nhận usage cho provider mặc định của 1 kind (avatar/image/tts/render). */
export async function recordPaidUsage(
  kind: "avatar" | "image" | "tts" | "render",
  costUsd: number,
  units = 1
): Promise<void> {
  const providers = (await store.listProviders()).filter((p) => p.kind === kind && p.enabled);
  const def = providers.find((p) => p.isDefault) || providers[0];
  if (!def) return;
  await store.recordUsage({
    providerId: def.id,
    date: new Date().toISOString().slice(0, 10),
    unitsUsed: units,
    costEstimateUsd: costUsd,
    requestCount: 1,
  });
  consumeReserve(costUsd); // quyết toán đặt chỗ (P1.1)
}
