/**
 * KV store for JSON documents.
 *
 * - Local dev: reads/writes to `.data/<name>.json` (synchronous)
 * - Supabase mode: stores in a single `kv_store` table, key=name, value=jsonb
 *
 * Used to persist the JSON metadata files (db.json, scripts.json, audio.json, etc.)
 * across cold starts on serverless platforms.
 *
 * IMPORTANT: Supabase operations are async. Modules using this MUST be ready to
 * handle async (or use the sync local fallback when Supabase not configured).
 *
 * NOTE: Since most existing storage modules use SYNC fs operations, we provide
 * both sync (local-only) and async (supabase-or-local) APIs. Modules that need
 * Supabase persistence should migrate to async.
 */
import fs from "node:fs";
import path from "node:path";
import { dataPath } from "@/lib/paths";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client";

const TABLE = "kv_store";

function localFile(name: string): string {
  return dataPath(`${name}.json`);
}

function ensureLocal(name: string, defaultValue: unknown) {
  const file = localFile(name);
  // path.dirname thay vì cắt theo "/" — path Windows dùng "\" → cắt "/" ra chuỗi rỗng → mkdir('') nổ.
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
}

// ─── Async API (supports Supabase) ───

export async function kvRead<T>(name: string, defaultValue: T): Promise<T> {
  if (isSupabaseConfigured()) {
    const client = getSupabaseClient()!;
    const { data, error } = await client.from(TABLE).select("value").eq("key", name).maybeSingle();
    if (error) {
      // Lỗi đọc thường do RLS chặn (đang dùng anon key thay vì SERVICE_ROLE) hoặc thiếu bảng kv_store.
      console.error(`[kv-store] read "${name}" lỗi — kiểm tra SUPABASE_SERVICE_ROLE_KEY & bảng kv_store:`, error.message);
      return defaultValue;
    }
    return (data?.value as T) ?? defaultValue;
  }
  ensureLocal(name, defaultValue);
  try {
    return JSON.parse(fs.readFileSync(localFile(name), "utf8")) as T;
  } catch {
    return defaultValue;
  }
}

export async function kvWrite<T>(name: string, value: T): Promise<void> {
  if (isSupabaseConfigured()) {
    const client = getSupabaseClient()!;
    const { error } = await client.from(TABLE).upsert(
      { key: name, value: value as object, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    if (error) {
      // KHÔNG nuốt lỗi: trước đây write fail âm thầm (vd RLS chặn vì dùng anon key) khiến
      // UI tưởng đã lưu nhưng kv_store rỗng. Ném lỗi để server action báo ngay.
      console.error(`[kv-store] write "${name}" lỗi:`, error.message);
      throw new Error(`Supabase kv_store write "${name}" thất bại: ${error.message}. Kiểm tra SUPABASE_SERVICE_ROLE_KEY (cần service_role, không phải anon) và bảng kv_store đã tạo.`);
    }
    return;
  }
  ensureLocal(name, value);
  fs.writeFileSync(localFile(name), JSON.stringify(value, null, 2));
}
