import { kvRead, kvWrite } from "@/lib/backend/kv-store";
import { blobUpload, blobDelete } from "@/lib/backend/blob-store";

export type AudioPart = "hook" | "body" | "cta" | "full" | "broll" | "animation";

export type AudioRecord = {
  id: string;
  scriptId: string;
  part: AudioPart;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  voiceId: string;
  voiceName?: string;
  providerName: string;
  costUsd: number;
  createdAt: string;
};

const KEY = "audio";

async function read(): Promise<AudioRecord[]> {
  return await kvRead<AudioRecord[]>(KEY, []);
}
async function write(list: AudioRecord[]): Promise<void> {
  await kvWrite(KEY, list);
}

// Mảng "audio" lưu dạng 1 blob JSON → đọc-sửa-ghi không an toàn khi nhiều part
// chạy SONG SONG (generateAllAudioAction). Khóa tuần tự cho vùng critical (read→write)
// để tránh ghi đè mất bản ghi. Upload file vẫn chạy song song bên ngoài khóa.
let _writeLock: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = _writeLock.then(fn, fn);
  _writeLock = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export const audioStore = {
  async list(): Promise<AudioRecord[]> {
    return await read();
  },
  async byScript(scriptId: string): Promise<AudioRecord[]> {
    return (await read()).filter((a) => a.scriptId === scriptId);
  },
  async get(id: string): Promise<AudioRecord | undefined> {
    return (await read()).find((a) => a.id === id);
  },
  async save(input: {
    scriptId: string;
    part: AudioPart;
    audioBase64: string;
    mimeType: string;
    durationMs: number;
    voiceId: string;
    voiceName?: string;
    providerName: string;
    costUsd: number;
  }): Promise<AudioRecord> {
    const id = crypto.randomUUID();
    const ext = input.mimeType.includes("wav") ? ".wav" : ".mp3";
    const filename = `${id}${ext}`;
    const buf = Buffer.from(input.audioBase64, "base64");
    const storagePath = await blobUpload({
      bucket: "audio",
      filename,
      buffer: buf,
      contentType: input.mimeType,
    });

    const record: AudioRecord = {
      id,
      scriptId: input.scriptId,
      part: input.part,
      storagePath,
      mimeType: input.mimeType,
      sizeBytes: buf.length,
      durationMs: input.durationMs,
      voiceId: input.voiceId,
      voiceName: input.voiceName,
      providerName: input.providerName,
      costUsd: input.costUsd,
      createdAt: new Date().toISOString(),
    };
    // Vùng critical: đọc list → xoá file cũ cùng part → ghi list. Tuần tự để an toàn khi parallel.
    return await withWriteLock(async () => {
      const list = await read();
      // Replace existing same-part for this script
      const olds = list.filter((a) => a.scriptId === input.scriptId && a.part === input.part);
      for (const old of olds) {
        await blobDelete({ bucket: "audio", pathOrUrl: old.storagePath });
      }
      const filtered = list.filter((a) => !(a.scriptId === input.scriptId && a.part === input.part));
      filtered.push(record);
      await write(filtered);
      return record;
    });
  },
  async delete(id: string): Promise<boolean> {
    const list = await read();
    const item = list.find((a) => a.id === id);
    if (!item) return false;
    await blobDelete({ bucket: "audio", pathOrUrl: item.storagePath });
    await write(list.filter((a) => a.id !== id));
    return true;
  },
};
