/**
 * Blob store for binary files (mp3, mp4, raw footage).
 *
 * - Local: write to `.data/<bucket>/<filename>`, return path `/<bucket>/<filename>`
 *   so the route handler can serve it.
 * - Supabase: upload to bucket, return the public URL directly.
 *
 * The returned path/URL is what gets stored in metadata's `storagePath` field
 * and is what clients (video/audio tags) load from.
 */
import fs from "node:fs";
import path from "node:path";
import { dataPath } from "@/lib/paths";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client";

export type BlobBucket = "uploads" | "audio" | "videos" | "broll-images";

// Buckets đã xác nhận tồn tại trong phiên này → khỏi gọi getBucket lặp lại.
const ensuredBuckets = new Set<BlobBucket>();

/**
 * Đảm bảo bucket Supabase tồn tại + public (idempotent, có cache in-memory).
 * App dùng SERVICE_ROLE_KEY nên đủ quyền createBucket. Lỗi quyền (anon key) →
 * throw message rõ để người dùng tạo bucket thủ công. No-op khi chạy local.
 */
export async function ensureBucket(bucket: BlobBucket): Promise<void> {
  if (!isSupabaseConfigured() || ensuredBuckets.has(bucket)) return;
  const client = getSupabaseClient()!;
  const { data, error: getErr } = await client.storage.getBucket(bucket);
  if (data && !getErr) {
    ensuredBuckets.add(bucket);
    return;
  }
  const { error: createErr } = await client.storage.createBucket(bucket, { public: true });
  if (createErr && !/already exists/i.test(createErr.message)) {
    throw new Error(
      `Không tạo được bucket "${bucket}": ${createErr.message}. ` +
        `Hãy tạo bucket "${bucket}" (public) thủ công trên Supabase, hoặc đảm bảo dùng SERVICE_ROLE_KEY.`
    );
  }
  ensuredBuckets.add(bucket);
}

export async function blobUpload(input: {
  bucket: BlobBucket;
  filename: string;
  buffer: Buffer;
  contentType?: string;
}): Promise<string> {
  const { bucket, filename, buffer, contentType } = input;

  if (isSupabaseConfigured()) {
    const client = getSupabaseClient()!;
    await ensureBucket(bucket); // phòng khi bucket chưa được tạo thủ công
    const { error } = await client.storage.from(bucket).upload(filename, buffer, {
      contentType: contentType || "application/octet-stream",
      upsert: true,
    });
    if (error) throw new Error(`Supabase upload (${bucket}/${filename}): ${error.message}`);
    const { data } = client.storage.from(bucket).getPublicUrl(filename);
    return data.publicUrl;
  }

  // Local: write to .data/<bucket>/<filename>
  const dir = dataPath(bucket);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, filename);
  fs.writeFileSync(full, buffer);
  return `/${bucket}/${filename}`;
}

export async function blobDelete(input: {
  bucket: BlobBucket;
  pathOrUrl: string;
}): Promise<void> {
  const { bucket, pathOrUrl } = input;

  if (isSupabaseConfigured()) {
    const client = getSupabaseClient()!;
    // Extract filename from path or URL
    const filename = path.basename(new URL(pathOrUrl, "https://x.invalid").pathname);
    await client.storage.from(bucket).remove([filename]);
    return;
  }

  // Local
  const filename = path.basename(pathOrUrl);
  const full = path.join(dataPath(bucket), filename);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {}
}
