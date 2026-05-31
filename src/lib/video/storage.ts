import { kvRead, kvWrite } from "@/lib/backend/kv-store";
import { blobUpload, blobDelete } from "@/lib/backend/blob-store";

export type ConceptKind = "talking" | "broll" | "animation";
export type RenderStatus = "queued" | "rendering" | "done" | "failed";

export type VideoDraftRecord = {
  id: string;
  scriptId: string;
  audioId?: string;
  concept: ConceptKind;
  mode?: "heygen" | "d-id" | "footage" | "creatomate" | "hyperframes" | "mock";
  providerName: string;
  providerJobId?: string;
  /** sha256(scriptId + voiceId + avatarImageUrl) — cost-guard cache key cho render trả phí */
  renderHash?: string;
  status: RenderStatus;
  progress: number;
  outputUrl?: string;
  outputStoragePath?: string;
  durationSec?: number;
  sizeBytes?: number;
  costUsd: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const KEY = "videos";

async function read(): Promise<VideoDraftRecord[]> {
  return await kvRead<VideoDraftRecord[]>(KEY, []);
}
async function write(list: VideoDraftRecord[]): Promise<void> {
  await kvWrite(KEY, list);
}

export const videoStore = {
  async list(): Promise<VideoDraftRecord[]> {
    return await read();
  },
  async byScript(scriptId: string): Promise<VideoDraftRecord[]> {
    return (await read()).filter((v) => v.scriptId === scriptId);
  },
  async get(id: string): Promise<VideoDraftRecord | undefined> {
    return (await read()).find((v) => v.id === id);
  },
  async create(input: Omit<VideoDraftRecord, "id" | "createdAt" | "updatedAt" | "progress" | "status" | "costUsd"> & {
    status?: RenderStatus;
    progress?: number;
    costUsd?: number;
  }): Promise<VideoDraftRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record: VideoDraftRecord = {
      ...input,
      id,
      status: input.status || "queued",
      progress: input.progress || 0,
      costUsd: input.costUsd || 0,
      createdAt: now,
      updatedAt: now,
    };
    const list = await read();
    // Replace same-concept for this script + remove old file
    const olds = list.filter((v) => v.scriptId === input.scriptId && v.concept === input.concept);
    for (const old of olds) {
      if (old.outputStoragePath) {
        await blobDelete({ bucket: "videos", pathOrUrl: old.outputStoragePath });
      }
    }
    const filtered = list.filter((v) => !(v.scriptId === input.scriptId && v.concept === input.concept));
    filtered.push(record);
    await write(filtered);
    return record;
  },
  async update(id: string, patch: Partial<VideoDraftRecord>): Promise<VideoDraftRecord | undefined> {
    const list = await read();
    const idx = list.findIndex((v) => v.id === id);
    if (idx < 0) return undefined;
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    await write(list);
    return list[idx];
  },
  async delete(id: string): Promise<boolean> {
    const list = await read();
    const item = list.find((v) => v.id === id);
    if (!item) return false;
    if (item.outputStoragePath) {
      await blobDelete({ bucket: "videos", pathOrUrl: item.outputStoragePath });
    }
    await write(list.filter((v) => v.id !== id));
    return true;
  },
  async saveOutputFile(id: string, buffer: Buffer, ext: string = ".mp4"): Promise<string> {
    const filename = `${id}${ext}`;
    const contentType = ext === ".webm" ? "video/webm" : "video/mp4";
    return await blobUpload({ bucket: "videos", filename, buffer, contentType });
  },
};
