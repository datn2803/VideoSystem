"use server";
import { revalidatePath } from "next/cache";
import { footageStore, getDefaultProfileId, type FootageTag } from "./storage";

const ALLOWED_MIME = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
const MAX_SIZE = 500 * 1024 * 1024; // 500MB

export async function uploadFootageAction(formData: FormData) {
  const file = formData.get("file") as File | null;
  const tag = (formData.get("tag") as FootageTag) || "other";
  const notes = (formData.get("notes") as string) || undefined;
  const profileId = (formData.get("profileId") as string) || (await getDefaultProfileId());

  if (!file) return { ok: false, error: "Không có file" };
  if (!profileId) return { ok: false, error: "Cần tạo profile trước" };
  if (file.size > MAX_SIZE) return { ok: false, error: `File quá lớn (max 500MB)` };
  if (file.size === 0) return { ok: false, error: "File rỗng" };
  // Some browsers send 'application/octet-stream', so we're lenient.
  const looksVideo =
    ALLOWED_MIME.includes(file.type) ||
    /\.(mp4|mov|webm|avi|m4v)$/i.test(file.name);
  if (!looksVideo) return { ok: false, error: `Định dạng không hỗ trợ: ${file.type}` };

  const buf = Buffer.from(await file.arrayBuffer());
  const asset = await footageStore.upload({
    profileId,
    filename: file.name,
    mimeType: file.type || "video/mp4",
    sizeBytes: file.size,
    tag,
    notes,
    fileBuffer: buf,
  });
  revalidatePath("/footage");
  return { ok: true, id: asset.id };
}

export async function deleteFootageAction(id: string) {
  await footageStore.delete(id);
  revalidatePath("/footage");
  return { ok: true };
}

export async function updateFootageTagAction(id: string, tag: FootageTag, notes?: string) {
  await footageStore.updateTag(id, tag, notes);
  revalidatePath("/footage");
  return { ok: true };
}
