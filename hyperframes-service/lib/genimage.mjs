// Sinh ảnh cutout nền TRONG SUỐT bằng OpenAI gpt-image (quality high).
// Dùng trên VPS (không vướng giới hạn 60s của Vercel). Key: process.env.OPENAI_API_KEY.
// Thiếu key / lỗi → trả {} → caller bỏ ảnh, render như 2A (KHÔNG fail job).
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", ".imgcache");

// Recipe ép cutout hợp nền tối, KHÔNG chữ, KHÔNG người thật cụ thể.
const STYLE_SUFFIX =
  ", studio cutout, soft rim light, dramatic dark-friendly lighting, no text, no watermark, not a real identifiable person, centered, high detail, photoreal";

/**
 * @param {{id:string, prompt:string}[]} prompts
 * @returns {Promise<Record<string,string>>}  id → đường dẫn file PNG (tuyệt đối)
 */
export async function generateImages(prompts) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !Array.isArray(prompts) || prompts.length === 0) return {};
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const out = {};
  await Promise.all(
    prompts.map(async (p) => {
      if (!p || !p.id || !p.prompt) return;
      const full = `isolated subject on transparent background, ${String(p.prompt).slice(0, 400)}${STYLE_SUFFIX}`;
      const hash = crypto.createHash("sha256").update(full).digest("hex").slice(0, 24);
      const file = path.join(CACHE_DIR, `${hash}.png`);
      // cache hit
      try { await fs.access(file); out[p.id] = file; return; } catch { /* miss */ }
      try {
        const res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: full,
            n: 1,
            size: "1024x1536",
            background: "transparent",
            output_format: "png",
            quality: "high",
          }),
        });
        if (!res.ok) {
          console.error("[genimage]", p.id, res.status, (await res.text()).slice(0, 200));
          return;
        }
        const data = await res.json();
        const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
        if (!b64) { console.error("[genimage] no b64_json", p.id); return; }
        await fs.writeFile(file, Buffer.from(b64, "base64"));
        out[p.id] = file;
      } catch (e) {
        console.error("[genimage] err", p.id, e && e.message ? e.message : e);
      }
    })
  );
  return out;
}
