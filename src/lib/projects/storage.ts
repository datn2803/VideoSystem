import type { ContentTopic } from "@/lib/agents/planner";
import { kvRead, kvWrite } from "@/lib/backend/kv-store";

export type ProjectRecord = {
  id: string;
  ownerId: string; // "demo-user" — giống createProfileAction
  profileId: string;
  name: string; // mặc định = tên profile + ngày; user sửa được
  topics: ContentTopic[]; // content plan ĐƯỢC LƯU (persist)
  planCostUsd: number;
  scriptIds: string[]; // id các script đã sinh từ project này
  createdAt: string;
  updatedAt: string;
};

const KEY = "projects";

async function read(): Promise<ProjectRecord[]> {
  return await kvRead<ProjectRecord[]>(KEY, []);
}
async function write(list: ProjectRecord[]): Promise<void> {
  await kvWrite(KEY, list);
}

export const projectStore = {
  async list(): Promise<ProjectRecord[]> {
    return await read();
  },
  async get(id: string): Promise<ProjectRecord | undefined> {
    return (await read()).find((p) => p.id === id);
  },
  async byProfile(profileId: string): Promise<ProjectRecord[]> {
    return (await read()).filter((p) => p.profileId === profileId);
  },
  async create(
    input: Omit<ProjectRecord, "id" | "createdAt" | "updatedAt" | "scriptIds"> & { scriptIds?: string[] }
  ): Promise<ProjectRecord> {
    const now = new Date().toISOString();
    const record: ProjectRecord = {
      ...input,
      scriptIds: input.scriptIds || [],
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    const list = await read();
    list.push(record);
    await write(list);
    return record;
  },
  async update(id: string, patch: Partial<ProjectRecord>): Promise<ProjectRecord | undefined> {
    const list = await read();
    const idx = list.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    await write(list);
    return list[idx];
  },
  async addScript(projectId: string, scriptId: string): Promise<ProjectRecord | undefined> {
    const list = await read();
    const idx = list.findIndex((p) => p.id === projectId);
    if (idx < 0) return undefined;
    if (!list[idx].scriptIds.includes(scriptId)) {
      list[idx].scriptIds.push(scriptId);
      list[idx].updatedAt = new Date().toISOString();
      await write(list);
    }
    return list[idx];
  },
  async delete(id: string): Promise<boolean> {
    const list = await read();
    const next = list.filter((p) => p.id !== id);
    if (next.length === list.length) return false;
    await write(next);
    return true;
  },
};
