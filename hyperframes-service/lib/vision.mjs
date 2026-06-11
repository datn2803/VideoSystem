// Vision-QC: chấm chất lượng thiết kế 1 frame bằng Gemini vision.
// Phase 2 đại tu: RUBRIC 5 CHIỀU + blacklist AI-slop (method vendor từ open-design,
// Apache-2.0 — xem THIRD_PARTY.md ở repo app). Giữ NGUYÊN contract trả về
// {score: 0-10, issues: [...], fix_hint} để server.mjs (ngưỡng <6 re-render,
// wantCompact theo nhãn layout) không phải đổi.
// Key: process.env.GEMINI_API_KEY. thinkingBudget:0 (nếu không Gemini 2.5 trả rỗng).
// Lỗi/thiếu key → {score:10, issues:["ok"]} (coi như đạt, KHÔNG chặn render).
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const PROMPT = `Bạn là giám khảo thiết kế cho 1 frame video DỌC 9:16 (explainer số liệu, motion-graphics).
Chấm frame theo 5 CHIỀU, mỗi chiều 1-5 (5 = hoàn hảo):
1. philosophy — tư thế thị giác có nhất quán 1 gu rõ ràng (dark-pro/editorial/poster/bento) không, hay lai tạp vô hướng?
2. hierarchy — mắt có đáp xuống MỘT điểm rõ ràng không, hay mọi thứ tranh nhau nổi bật?
3. execution — typography/khoảng cách/căn lề/tương phản ĐÚNG hẳn chưa? Chữ tràn mép/đè nhau là lỗi nặng.
4. specificity — chữ + số trên frame có cụ thể, nhất quán ngôn ngữ (tiếng Việt), không filler vô nghĩa?
5. restraint — một accent dùng tiết chế, một điểm nhấn quyết đoán — hay nhiều điểm nhấn cãi nhau?

BLACKLIST (dính cái nào liệt kê vào "slop"): gradient phủ MỌI thẻ; emoji làm icon; chữ filler/lorem;
icon cạnh mọi heading; hình người vẽ tay ngô nghê; nền bẩn/loang lổ; chữ vỡ dấu tiếng Việt.

Trả về DUY NHẤT JSON (không markdown, không giải thích):
{"dims":{"philosophy":1-5,"hierarchy":1-5,"execution":1-5,"specificity":1-5,"restraint":1-5},
 "issues":[...], "slop":[...], "fix_hint":"<ngắn>"}
issues là tập con của: ["text_overflow","overlap","low_contrast","unbalanced","image_ugly","empty","ok"]
(đây là nhãn LAYOUT cụ thể nhìn thấy được — chỉ điền khi thật sự thấy).`;

export async function assessFrame(base64Png) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !base64Png) return { score: 10, issues: ["ok"], fix_hint: "" };
  try {
    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/png", data: base64Png } }] },
        ],
        generationConfig: {
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          maxOutputTokens: 384,
          temperature: 0,
        },
      }),
    });
    if (!res.ok) {
      console.error("[vision]", res.status, (await res.text()).slice(0, 200));
      return { score: 10, issues: ["ok"], fix_hint: "" };
    }
    const data = await res.json();
    let txt =
      (data && data.candidates && data.candidates[0] && data.candidates[0].content &&
        (data.candidates[0].content.parts || []).map((p) => p.text || "").join("")) || "";
    txt = txt.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const m = txt.match(/\{[\s\S]*\}/);
    const j = JSON.parse(m ? m[0] : txt);

    // Quy 5 chiều (1-5) → score 0-10 (avg×2) cho contract cũ; chiều <3 + slop là issue.
    const clamp5 = (x) => Math.max(1, Math.min(5, Number(x) || 3));
    let score;
    const issues = Array.isArray(j.issues) ? j.issues.filter((s) => s && s !== "ok") : [];
    if (j.dims && typeof j.dims === "object") {
      const d = {
        philosophy: clamp5(j.dims.philosophy), hierarchy: clamp5(j.dims.hierarchy),
        execution: clamp5(j.dims.execution), specificity: clamp5(j.dims.specificity),
        restraint: clamp5(j.dims.restraint),
      };
      score = ((d.philosophy + d.hierarchy + d.execution + d.specificity + d.restraint) / 5) * 2;
      for (const k in d) if (d[k] < 3) issues.push(`dim_${k}`);
    } else {
      const s0 = Number(j.score); // model trả format cũ → vẫn ăn
      score = Number.isFinite(s0) ? s0 : 10;
    }
    if (Array.isArray(j.slop)) for (const s of j.slop) if (s) issues.push(`slop:${String(s).slice(0, 40)}`);
    return {
      score: Math.max(0, Math.min(10, score)),
      issues: issues.length ? issues : ["ok"],
      fix_hint: typeof j.fix_hint === "string" ? j.fix_hint : "",
      dims: j.dims && typeof j.dims === "object" ? j.dims : undefined,
    };
  } catch (e) {
    console.error("[vision] err", e && e.message ? e.message : e);
    return { score: 10, issues: ["ok"], fix_hint: "" };
  }
}
