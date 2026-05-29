/**
 * Storage abstraction — local JSON file when running locally,
 * Supabase Postgres (kv_store table) when SUPABASE env vars present.
 *
 * All methods are async to support Supabase calls.
 */
import type { ProviderConfig, ProviderUsage, ProviderHealth } from "./types";
import { kvRead, kvWrite } from "@/lib/backend/kv-store";

type DB = {
  providers: ProviderConfig[];
  credentials: Record<string, string>; // providerId -> encrypted blob
  usage: ProviderUsage[];
  health: ProviderHealth[];
  profiles: ProfileRecord[];
};

export type ProfileRecord = {
  id: string;
  ownerId: string;
  name: string;
  industry: string;
  role: string;
  expertise: {
    products?: string[];
    yearsExp?: number;
    certificates?: string[];
    specialties?: string[];
  };
  audience: {
    segment?: string;
    painPoints?: string[];
    goals?: string[];
    ageRange?: string;
  };
  tone: {
    voice?: string;
    forbidden?: string[];
    style?: string;
  };
  usp?: string;
  voiceSampleUrl?: string;
  createdAt: string;
};

const DEFAULT_DB: DB = {
  providers: [],
  credentials: {},
  usage: [],
  health: [],
  profiles: [],
};

const KEY = "db";

async function read(): Promise<DB> {
  return await kvRead<DB>(KEY, { ...DEFAULT_DB });
}

async function write(db: DB): Promise<void> {
  await kvWrite(KEY, db);
}

export const store = {
  async listProviders(): Promise<ProviderConfig[]> {
    return (await read()).providers;
  },
  async getProvider(id: string): Promise<ProviderConfig | undefined> {
    return (await read()).providers.find((p) => p.id === id);
  },
  async upsertProvider(p: ProviderConfig): Promise<void> {
    const db = await read();
    const idx = db.providers.findIndex((x) => x.id === p.id);
    if (idx >= 0) db.providers[idx] = p;
    else db.providers.push(p);
    await write(db);
  },
  async deleteProvider(id: string): Promise<void> {
    const db = await read();
    db.providers = db.providers.filter((p) => p.id !== id);
    delete db.credentials[id];
    await write(db);
  },
  async setCredential(providerId: string, encrypted: string): Promise<void> {
    const db = await read();
    db.credentials[providerId] = encrypted;
    await write(db);
  },
  async getCredential(providerId: string): Promise<string | undefined> {
    return (await read()).credentials[providerId];
  },
  async recordUsage(u: ProviderUsage): Promise<void> {
    const db = await read();
    const idx = db.usage.findIndex((x) => x.providerId === u.providerId && x.date === u.date);
    if (idx >= 0) {
      db.usage[idx].unitsUsed += u.unitsUsed;
      db.usage[idx].costEstimateUsd += u.costEstimateUsd;
      db.usage[idx].requestCount += u.requestCount;
    } else {
      db.usage.push(u);
    }
    await write(db);
  },
  async listUsage(providerId?: string): Promise<ProviderUsage[]> {
    const usage = (await read()).usage;
    return providerId ? usage.filter((u) => u.providerId === providerId) : usage;
  },
  async recordHealth(h: ProviderHealth): Promise<void> {
    const db = await read();
    db.health.push(h);
    if (db.health.length > 1000) db.health = db.health.slice(-1000);
    await write(db);
  },
  async latestHealth(providerId: string): Promise<ProviderHealth | undefined> {
    const list = (await read()).health.filter((h) => h.providerId === providerId);
    return list[list.length - 1];
  },
  // ── Profiles ──
  async listProfiles(): Promise<ProfileRecord[]> {
    return (await read()).profiles;
  },
  async getProfile(id: string): Promise<ProfileRecord | undefined> {
    return (await read()).profiles.find((p) => p.id === id);
  },
  async upsertProfile(p: ProfileRecord): Promise<void> {
    const db = await read();
    const idx = db.profiles.findIndex((x) => x.id === p.id);
    if (idx >= 0) db.profiles[idx] = p;
    else db.profiles.push(p);
    await write(db);
  },
  async deleteProfile(id: string): Promise<void> {
    const db = await read();
    db.profiles = db.profiles.filter((p) => p.id !== id);
    await write(db);
  },
};
