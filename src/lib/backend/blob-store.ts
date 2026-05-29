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

export type BlobBucket = "uploads" | "audio" | "videos";

export async function blobUpload(input: {
  bucket: BlobBucket;
  filename: string;
  buffer: Buffer;
  contentType?: string;
}): Promise<string> {
  const { bucket, filename, buffer, contentType } = input;

  if (isSupabaseConfigured()) {
    const client = getSupabaseClient()!;
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

export function blobReadLocal(bucket: BlobBucket, filename: string): Buffer | null {
  const full = path.join(dataPath(bucket), path.basename(filename));
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full);
}
