"use server";
/**
 * Server actions cho BrandKit (Design Director) — UI trang Profiles gọi.
 * Mọi action đều $0 (deterministic, không LLM/API trả phí).
 */
import { revalidatePath } from "next/cache";
import { store } from "@/lib/integration-hub/storage";
import { brandKitStore, type BrandKit, type StyleVariant } from "./brandkit";
import { generateBrandKit, rebuildFromSystem } from "./director";

/** Director sinh lại kit theo industry (bỏ override tay nếu có). */
export async function regenerateBrandKitAction(profileId: string): Promise<{ kit?: BrandKit; error?: string }> {
  const profile = await store.getProfile(profileId);
  if (!profile) return { error: "Không tìm thấy profile" };
  const kit = generateBrandKit(profile);
  await brandKitStore.set(kit);
  revalidatePath("/profiles");
  return { kit };
}

/** Tommy chọn tay 1 design system khác → derive kit từ hệ đó (overridden=true). */
export async function chooseBrandSystemAction(
  profileId: string,
  systemId: string
): Promise<{ kit?: BrandKit; error?: string }> {
  const kit = rebuildFromSystem(profileId, systemId);
  if (!kit) return { error: `Không có design system "${systemId}"` };
  await brandKitStore.set(kit);
  revalidatePath("/profiles");
  return { kit };
}

/** Override màu/skin lẻ (accent/accent2/styleVariant) — giữ phần còn lại. */
export async function updateBrandTokensAction(
  profileId: string,
  patch: { accent?: string; accent2?: string; styleVariant?: StyleVariant }
): Promise<{ kit?: BrandKit; error?: string }> {
  const kit = await brandKitStore.get(profileId);
  if (!kit) return { error: "Chưa có BrandKit — bấm Tạo lại trước" };
  const hexOk = (s?: string) => !s || /^#[0-9a-fA-F]{6}$/.test(s);
  if (!hexOk(patch.accent) || !hexOk(patch.accent2)) return { error: "Màu phải dạng #rrggbb" };
  const next: BrandKit = {
    ...kit,
    tokens: {
      ...kit.tokens,
      ...(patch.accent ? { accent: patch.accent } : {}),
      ...(patch.accent2 ? { accent2: patch.accent2 } : {}),
      ...(patch.styleVariant ? { styleVariant: patch.styleVariant } : {}),
    },
    overridden: true,
    generatedAt: new Date().toISOString(),
  };
  await brandKitStore.set(next);
  revalidatePath("/profiles");
  return { kit: next };
}
