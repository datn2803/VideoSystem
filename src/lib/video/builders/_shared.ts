/**
 * Helper dùng CHUNG cho các builder video (c1-talking / c2-broll / c3-animation).
 * Gom các hàm GIỐNG HỆT từng lặp ở 3 file — KHÔNG đổi hành vi, chỉ 1 nguồn sự thật.
 */
import { store } from "@/lib/integration-hub/storage";

/** Header MP4 tối thiểu (ftyp box) cho file placeholder ở chế độ mock. */
export const MOCK_MP4_HEADER = Buffer.from([
  0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
]);

/** Retry 1 hàm async tối đa `retries` lần; ném lỗi cuối nếu vẫn fail. */
export async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Render provider mặc định (kind="render", enabled) → isDefault || phần tử đầu. */
export async function pickRenderProvider() {
  const providers = (await store.listProviders()).filter((p) => p.kind === "render" && p.enabled);
  return providers.find((p) => p.isDefault) || providers[0];
}

/** Chuẩn hoá path → URL tuyệt đối (giữ nguyên nếu đã là http; rỗng → undefined). */
export function toAbsoluteUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${process.env.PUBLIC_APP_URL || ""}${path}`;
}

/**
 * MP4 placeholder cho chế độ mock. Hợp nhất 3 bản cũ bằng tham số — GIỮ NGUYÊN
 * hành vi từng concept qua `kbPerSec` + `byte`:
 *   c1 = (seconds, 50, 0xab) · c2 = (seconds, 60, 0xcd) · c3 = (seconds, 40, 0xee)
 */
export function generatePlaceholderMp4(seconds: number, kbPerSec: number, byte: number): Buffer {
  const payload = Buffer.alloc(Math.round(kbPerSec * 1024 * Math.max(1, seconds)), byte);
  return Buffer.concat([MOCK_MP4_HEADER, payload]);
}
