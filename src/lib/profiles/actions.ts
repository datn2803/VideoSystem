"use server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { store, type ProfileRecord } from "@/lib/integration-hub/storage";
import { generateSampleScript, generateContentPlan } from "@/lib/agents/planner";

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
  revalidatePath("/profiles");
  return { id, ok: true };
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

export async function generatePlanAction(profileId: string, n: number = 12) {
  const profile = await store.getProfile(profileId);
  if (!profile) throw new Error("Profile not found");
  const result = await generateContentPlan(profile, n);
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
