import { kvRead, kvWrite } from "@/lib/backend/kv-store";

export type Platform = "tiktok" | "facebook" | "youtube_shorts";

export type ExportRecord = {
  id: string;
  scriptId: string;
  platform: Platform;
  captionLocalized: string;
  hashtags: string[];
  exportedAt: string;
  /** Hook lịch đăng (Phase 5): thời điểm dự kiến đăng (ISO) — người dùng tự đặt. */
  scheduledAt?: string;
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
  /** Đặt/đổi lịch đăng cho 1 export (Phase 5). */
  async schedule(id: string, scheduledAt: string | null): Promise<ExportRecord | undefined> {
    const list = await read();
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return undefined;
    if (scheduledAt) list[idx].scheduledAt = scheduledAt;
    else delete list[idx].scheduledAt;
    await write(list);
    return list[idx];
  },
};
