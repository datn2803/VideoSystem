// Vision-QC: chấm chất lượng layout 1 frame bằng Gemini vision.
// Key: process.env.GEMINI_API_KEY. thinkingBudget:0 (nếu không Gemini 2.5 trả rỗng).
// Lỗi/thiếu key → {score:10, issues:["ok"]} (coi như đạt, KHÔNG chặn render).
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const PROMPT = `Bạn là QC layout cho 1 frame video DỌC nền tối (explainer số liệu).
Chấm frame này và trả về DUY NHẤT JSON (không markdown, không giải thích):
{"score":<0-10>,"issues":[...],"fix_hint":"<ngắn>"}
issues là tập con của: ["text_overflow","overlap","low_contrast","unbalanced","image_ugly","empty","ok"].
score cao = bố cục gọn-cân, chữ KHÔNG tràn/đè, tương phản tốt trên nền tối, ảnh (nếu có) đẹp tự nhiên.
score thấp khi: chữ tràn mép/đè nhau, mất cân đối, nền/chữ thiếu tương phản, ảnh xấu/méo, frame trống.`;

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
          maxOutputTokens: 256,
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
    const score = Number(j.score);
    return {
      score: Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 10,
      issues: Array.isArray(j.issues) && j.issues.length ? j.issues : ["ok"],
      fix_hint: typeof j.fix_hint === "string" ? j.fix_hint : "",
    };
  } catch (e) {
    console.error("[vision] err", e && e.message ? e.message : e);
    return { score: 10, issues: ["ok"], fix_hint: "" };
  }
}
