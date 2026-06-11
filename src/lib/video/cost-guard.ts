/**
 * Cost-guard (Phase 3) — MỌI call trả phí gate sau đây.
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

/**
 * Chặn TRƯỚC khi tốn tiền: spend hôm nay + ước tính lần này vượt trần → throw
 * message rõ (action bắt + hiện UI). Gọi ở MỌI điểm sắp gọi provider trả phí.
 */
export async function assertDailyCap(estimatedUsd: number, label: string): Promise<void> {
  const spent = await spendTodayUsd();
  const cap = dailyCapUsd();
  if (spent + estimatedUsd > cap) {
    throw new Error(
      `Trần chi phí/ngày chạm mức: đã dùng ~$${spent.toFixed(2)} + ${label} ~$${estimatedUsd.toFixed(2)} > trần $${cap}/ngày. ` +
        `Đợi mai hoặc nâng DAILY_COST_CAP_USD.`
    );
  }
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
}
