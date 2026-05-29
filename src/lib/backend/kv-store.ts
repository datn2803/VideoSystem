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
import { dataPath } from "@/lib/paths";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client";

const TABLE = "kv_store";

function localFile(name: string): string {
  return dataPath(`${name}.json`);
}

function ensureLocal(name: string, defaultValue: unknown) {
  const file = localFile(name);
  const dir = file.substring(0, file.lastIndexOf("/"));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
}

// ─── Async API (supports Supabase) ───

export async function kvRead<T>(name: string, defaultValue: T): Promise<T> {
  if (isSupabaseConfigured()) {
    const client = getSupabaseClient()!;
    const { data, error } = await client.from(TABLE).select("value").eq("key", name).maybeSingle();
    if (error) {
      console.error(`[kv-store] read ${name} error`, error);
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
    if (error) console.error(`[kv-store] write ${name} error`, error);
    return;
  }
  ensureLocal(name, value);
  fs.writeFileSync(localFile(name), JSON.stringify(value, null, 2));
}

// ─── Sync API (local-only — used by legacy modules) ───

export function kvReadSync<T>(name: string, defaultValue: T): T {
  ensureLocal(name, defaultValue);
  try {
    return JSON.parse(fs.readFileSync(localFile(name), "utf8")) as T;
  } catch {
    return defaultValue;
  }
}

export function kvWriteSync<T>(name: string, value: T): void {
  ensureLocal(name, value);
  fs.writeFileSync(localFile(name), JSON.stringify(value, null, 2));
}
