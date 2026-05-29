import { kvRead, kvWrite } from "@/lib/backend/kv-store";
import { blobUpload, blobDelete } from "@/lib/backend/blob-store";
import { store } from "@/lib/integration-hub/storage";

export type FootageTag = "intro" | "talking" | "broll" | "cta" | "outro" | "other";

export type FootageAsset = {
  id: string;
  profileId: string;
  filename: string;
  storagePath: string; // public URL or /uploads/<file>
  mimeType: string;
  sizeBytes: number;
  durationSec?: number;
  tag: FootageTag;
  notes?: string;
  thumbnailUrl?: string;
  uploadedAt: string;
};

const KEY = "footage";

async function readIndex(): Promise<FootageAsset[]> {
  return await kvRead<FootageAsset[]>(KEY, []);
}
async function writeIndex(list: FootageAsset[]): Promise<void> {
  await kvWrite(KEY, list);
}

export const footageStore = {
  async listByProfile(profileId: string): Promise<FootageAsset[]> {
    return (await readIndex()).filter((f) => f.profileId === profileId);
  },
  async listAll(): Promise<FootageAsset[]> {
    return await readIndex();
  },
  async get(id: string): Promise<FootageAsset | undefined> {
    return (await readIndex()).find((f) => f.id === id);
  },
  async upload(input: {
    profileId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    tag: FootageTag;
    notes?: string;
    fileBuffer: Buffer;
  }): Promise<FootageAsset> {
    const id = crypto.randomUUID();
    const ext = input.filename.match(/\.[^.]+$/)?.[0] || ".mp4";
    const filename = `${id}${ext}`;

    const storagePath = await blobUpload({
      bucket: "uploads",
      filename,
      buffer: input.fileBuffer,
      contentType: input.mimeType,
    });

    const asset: FootageAsset = {
      id,
      profileId: input.profileId,
      filename: input.filename,
      storagePath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      tag: input.tag,
      notes: input.notes,
      uploadedAt: new Date().toISOString(),
    };
    const list = await readIndex();
    list.push(asset);
    await writeIndex(list);
    return asset;
  },
  async delete(id: string): Promise<boolean> {
    const list = await readIndex();
    const item = list.find((f) => f.id === id);
    if (!item) return false;
    await blobDelete({ bucket: "uploads", pathOrUrl: item.storagePath });
    await writeIndex(list.filter((f) => f.id !== id));
    return true;
  },
  async updateTag(id: string, tag: FootageTag, notes?: string): Promise<boolean> {
    const list = await readIndex();
    const item = list.find((f) => f.id === id);
    if (!item) return false;
    item.tag = tag;
    if (notes !== undefined) item.notes = notes;
    await writeIndex(list);
    return true;
  },
};

export async function getDefaultProfileId(): Promise<string> {
  const profiles = await store.listProfiles();
  return profiles[0]?.id || "";
}
