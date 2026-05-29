import type { ScriptResult } from "@/lib/agents/scripter";
import type { AuditResult } from "@/lib/agents/auditor";
import { kvRead, kvWrite } from "@/lib/backend/kv-store";

export type ReviewState = "draft" | "in_review" | "approved" | "rejected" | "exported";

export type ScriptRecord = {
  id: string;
  profileId: string;
  topic: string;
  painPoint: string;
  targetPersona: string;
  formatHint?: string;
  priority?: number;
  script: ScriptResult;
  audit?: AuditResult;
  version: number;
  reviewState?: ReviewState;
  reviewComment?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
};

const KEY = "scripts";

async function read(): Promise<ScriptRecord[]> {
  return await kvRead<ScriptRecord[]>(KEY, []);
}
async function write(list: ScriptRecord[]): Promise<void> {
  await kvWrite(KEY, list);
}

export const scriptStore = {
  async list(): Promise<ScriptRecord[]> {
    return await read();
  },
  async byProfile(profileId: string): Promise<ScriptRecord[]> {
    return (await read()).filter((s) => s.profileId === profileId);
  },
  async get(id: string): Promise<ScriptRecord | undefined> {
    return (await read()).find((s) => s.id === id);
  },
  async create(input: Omit<ScriptRecord, "id" | "version" | "createdAt">): Promise<ScriptRecord> {
    const record: ScriptRecord = {
      ...input,
      id: crypto.randomUUID(),
      version: 1,
      createdAt: new Date().toISOString(),
    };
    const list = await read();
    list.push(record);
    await write(list);
    return record;
  },
  async update(id: string, patch: Partial<ScriptRecord>): Promise<ScriptRecord | undefined> {
    const list = await read();
    const idx = list.findIndex((s) => s.id === id);
    if (idx < 0) return undefined;
    list[idx] = { ...list[idx], ...patch };
    await write(list);
    return list[idx];
  },
  async delete(id: string): Promise<boolean> {
    const list = await read();
    const next = list.filter((s) => s.id !== id);
    if (next.length === list.length) return false;
    await write(next);
    return true;
  },
};
