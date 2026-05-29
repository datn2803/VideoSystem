import { kvRead, kvWrite } from "@/lib/backend/kv-store";

export type Platform = "tiktok" | "facebook" | "youtube_shorts";

export type ExportRecord = {
  id: string;
  scriptId: string;
  platform: Platform;
  captionLocalized: string;
  hashtags: string[];
  exportedAt: string;
};

const KEY = "exports";

async function read(): Promise<ExportRecord[]> {
  return await kvRead<ExportRecord[]>(KEY, []);
}
async function write(list: ExportRecord[]): Promise<void> {
  await kvWrite(KEY, list);
}

export const exportStore = {
  async list(): Promise<ExportRecord[]> {
    return await read();
  },
  async byScript(scriptId: string): Promise<ExportRecord[]> {
    return (await read()).filter((e) => e.scriptId === scriptId);
  },
  async recordExport(input: {
    scriptId: string;
    platform: Platform;
    captionLocalized: string;
    hashtags: string[];
  }): Promise<ExportRecord> {
    const record: ExportRecord = {
      id: crypto.randomUUID(),
      scriptId: input.scriptId,
      platform: input.platform,
      captionLocalized: input.captionLocalized,
      hashtags: input.hashtags,
      exportedAt: new Date().toISOString(),
    };
    const list = await read();
    list.push(record);
    await write(list);
    return record;
  },
};
