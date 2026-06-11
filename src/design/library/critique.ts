/**
 * critique — Cổng tự chấm thiết kế 5 chiều + blacklist chống "AI làm xấu".
 *
 * Chưng cất (vendored method) từ nexu-io/open-design (Apache-2.0):
 * apps/daemon/src/prompts/discovery.ts (mục "Step 8 — 5-dimensional critique" +
 * "C. Anti-AI-slop checklist") @ commit 1eac8fcabf20bbc585b8140f1cb6b92bd86f5876.
 * License + attribution: xem THIRD_PARTY.md. Nội dung đã dịch/điều chỉnh cho
 * bối cảnh VIDEO 9:16 (frame video thay vì trang web) — method giữ nguyên.
 *
 * Dùng ở Phase 2: cổng QC thiết kế (vision-QC chấm frame theo 5 chiều, điểm <3/5
 * ở chiều nào = regression → sửa/ẩn/re-render 1 vòng).
 */

export type CritiqueDimension = {
  id: "philosophy" | "hierarchy" | "execution" | "specificity" | "restraint";
  /** Tên hiển thị tiếng Việt */
  name: string;
  /** Câu hỏi chấm điểm (đưa vào prompt vision-QC) */
  question: string;
};

/** 5 chiều tự phê bình — điểm 1-5 mỗi chiều, dưới 3/5 = regression phải sửa. */
export const CRITIQUE_DIMENSIONS: CritiqueDimension[] = [
  {
    id: "philosophy",
    name: "Triết lý",
    question:
      "Tư thế thị giác có ĐÚNG gu đã chọn không (editorial / minimal / dark-pro / brutalist…)? Hay đã trượt về default quen tay?",
  },
  {
    id: "hierarchy",
    name: "Phân cấp",
    question:
      "Mắt có đáp xuống MỘT điểm rõ ràng trên mỗi frame không? Hay mọi thứ tranh nhau nổi bật?",
  },
  {
    id: "execution",
    name: "Thực thi",
    question:
      "Typography, khoảng cách, căn lề, tương phản — ĐÚNG hẳn hay chỉ gần đúng? Có chữ tràn/đè/lệch không?",
  },
  {
    id: "specificity",
    name: "Cụ thể",
    question:
      "Mọi chữ, con số, hình có gắn với ĐÚNG nội dung video này không? Hay lọt filler/số liệu generic vô nghĩa?",
  },
  {
    id: "restraint",
    name: "Tiết chế",
    question:
      "Một accent dùng tối đa hai lần, một điểm nhấn quyết đoán — hay ba điểm nhấn cãi nhau?",
  },
];

/** Điểm sàn mỗi chiều — dưới ngưỡng này là regression (sửa/ẩn/re-render). */
export const CRITIQUE_PASS_THRESHOLD = 3;

/**
 * Blacklist "AI slop" — các dấu hiệu thiết kế AI làm xấu, audit TRƯỚC khi ship.
 * Điều chỉnh cho video short-form (gốc open-design là cho trang web/deck).
 */
export const AI_SLOP_BLACKLIST: string[] = [
  "Nền gradient tím/violet gắt phủ toàn khung (không thuộc BrandKit)",
  "Emoji generic làm icon tính năng (✨ 🚀 🎯 …) thay vì icon line nhất quán",
  "Thẻ bo góc + viền màu trái kiểu bootstrap mặc định",
  "Hình người/mặt/cảnh vẽ tay SVG ngô nghê",
  "Số liệu bịa ('nhanh 10×', 'uptime 99.9%') không nguồn — phải có nhãn 'ước tính'/'ví dụ' hoặc ẩn",
  "Chữ filler ('Tính năng 1 / Tính năng 2', lorem ipsum)",
  "Icon cạnh MỌI heading (icon phải có chọn lọc)",
  "Gradient trên MỌI nền thẻ",
  "Nền beige/cream/peach ấm khi BrandKit không yêu cầu",
  "Chữ tràn khung (scrollWidth > clientWidth) hoặc đè lên nhau",
];

/** Render checklist blacklist thành text cho prompt vision-QC. */
export function renderSlopChecklist(): string {
  return AI_SLOP_BLACKLIST.map((s) => `- ❌ ${s}`).join("\n");
}

/** Render 5 chiều thành block prompt chấm điểm cho vision-QC. */
export function renderCritiquePrompt(): string {
  const dims = CRITIQUE_DIMENSIONS.map(
    (d, i) => `${i + 1}. **${d.name}** (${d.id}) — ${d.question}`
  ).join("\n");
  return `Chấm frame theo 5 chiều, mỗi chiều 1-5 (5 = hoàn hảo):\n${dims}\n\nDưới ${CRITIQUE_PASS_THRESHOLD}/5 ở chiều nào = không đạt chiều đó.\nNgoài ra soi blacklist sau — dính mục nào liệt kê ra:\n${renderSlopChecklist()}`;
}

export type CritiqueScore = {
  philosophy: number;
  hierarchy: number;
  execution: number;
  specificity: number;
  restraint: number;
  /** Các mục blacklist bị dính (rỗng = sạch) */
  slop: string[];
};

/** Frame đạt khi MỌI chiều ≥ ngưỡng và không dính blacklist nghiêm trọng. */
export function critiquePasses(s: CritiqueScore): boolean {
  return (
    s.philosophy >= CRITIQUE_PASS_THRESHOLD &&
    s.hierarchy >= CRITIQUE_PASS_THRESHOLD &&
    s.execution >= CRITIQUE_PASS_THRESHOLD &&
    s.specificity >= CRITIQUE_PASS_THRESHOLD &&
    s.restraint >= CRITIQUE_PASS_THRESHOLD &&
    s.slop.length === 0
  );
}
