"use server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { store, type ProfileRecord, type ProfileStrategy } from "@/lib/integration-hub/storage";
import { generateSampleScript } from "@/lib/agents/planner";
import { generateStrategy, generateAndSaveStrategy } from "@/lib/agents/strategist";

const DEFAULT_OWNER = "demo-user";

export async function createProfileAction(input: {
  name: string;
  role: string;
  industry?: string;
  yearsExp?: number;
  products?: string[];
  audienceSegment?: string;
  painPoints?: string[];
  goals?: string[];
  toneVoice?: string;
  usp?: string;
}) {
  const id = crypto.randomUUID();
  const profile: ProfileRecord = {
    id,
    ownerId: DEFAULT_OWNER,
    name: input.name,
    industry: input.industry || "personal_banking",
    role: input.role,
    expertise: {
      yearsExp: input.yearsExp,
      products: input.products || [],
    },
    audience: {
      segment: input.audienceSegment,
      painPoints: input.painPoints || [],
      goals: input.goals || [],
    },
    tone: {
      voice: input.toneVoice || "professional, trustworthy",
    },
    usp: input.usp,
    createdAt: new Date().toISOString(),
  };
  await store.upsertProfile(profile);

  // Tự sinh chiến lược (pillars) ngay sau khi tạo — best-effort, KHÔNG để lỗi LLM phá việc tạo profile.
  // Hỏng/quota → profile vẫn tạo, Tommy bấm "Tạo lại trụ" sau.
  try {
    const out = await generateStrategy(profile);
    if (out) {
      profile.strategy = out.strategy;
      await store.upsertProfile(profile);
    }
  } catch (e) {
    console.error("[createProfile] sinh strategy lỗi (bỏ qua):", e);
  }

  revalidatePath("/profiles");
  return { id, ok: true };
}

// Tạo lại 4 trụ từ profile (Tommy bấm nút "Tạo lại trụ").
export async function regenerateStrategyAction(profileId: string) {
  const strategy = await generateAndSaveStrategy(profileId);
  revalidatePath("/profiles");
  return { ok: !!strategy, strategy };
}

// Lưu strategy do Tommy sửa tay (override). generatedAt cập nhật = thời điểm sửa.
export async function updateStrategyAction(profileId: string, strategy: ProfileStrategy) {
  const profile = await store.getProfile(profileId);
  if (!profile) throw new Error("Profile not found");
  await store.upsertProfile({
    ...profile,
    strategy: { ...strategy, generatedAt: new Date().toISOString() },
  });
  revalidatePath("/profiles");
  return { ok: true };
}

export async function deleteProfileAction(id: string) {
  await store.deleteProfile(id);
  revalidatePath("/profiles");
  return { ok: true };
}

export async function generateSampleScriptAction(profileId: string) {
  const profile = await store.getProfile(profileId);
  if (!profile) throw new Error("Profile not found");
  const result = await generateSampleScript(profile);
  return result;
}

export async function seedDemoProfileAction() {
  if ((await store.listProfiles()).length > 0) return { ok: true, message: "Đã có profile" };
  await createProfileAction({
    name: "Nguyễn Hoàng Anh",
    role: "Personal Banker — VPBank",
    industry: "personal_banking",
    yearsExp: 5,
    products: ["Tiết kiệm", "Thẻ tín dụng", "Vay mua nhà", "Đầu tư trái phiếu", "Bảo hiểm nhân thọ"],
    audienceSegment: "Khách hàng cá nhân 28-45 tuổi, thu nhập 15-50 triệu/tháng tại các thành phố lớn",
    painPoints: [
      "Không biết chọn ngân hàng nào để gửi tiết kiệm",
      "Sợ bị lừa khi mở thẻ tín dụng",
      "Thiếu kiến thức về đầu tư tài chính",
      "Hồ sơ vay phức tạp, không biết bắt đầu từ đâu",
    ],
    goals: ["Tiết kiệm an toàn", "Sinh lời từ tiền nhàn rỗi", "Mua nhà trong 3-5 năm"],
    toneVoice: "Chuyên nghiệp, đáng tin cậy, gần gũi, không sáo rỗng",
    usp: "5 năm tư vấn cá nhân hoá, đã hỗ trợ 500+ khách hàng đạt mục tiêu tài chính",
  });
  return { ok: true };
}
