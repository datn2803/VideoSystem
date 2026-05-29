import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataPath, IS_SERVERLESS } from "@/lib/paths";

const ALGO = "aes-256-gcm";
const KEY_FILE = dataPath(".vault-key");

function getKey(): Buffer {
  const envKey = process.env.HUB_VAULT_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, "base64");
    if (buf.length === 32) return buf;
    console.warn("[vault] HUB_VAULT_KEY không hợp lệ (cần đúng 32 byte base64) — đang fallback sang key file ephemeral.");
  } else if (IS_SERVERLESS) {
    // Trên serverless, key file nằm ở /tmp (ephemeral): mỗi cold start sinh key mới
    // → mọi credential đã mã hoá trước đó sẽ KHÔNG decrypt được. Phải set env cố định.
    console.warn(
      "[vault] Thiếu HUB_VAULT_KEY trên serverless — credentials sẽ KHÔNG decrypt được sau cold start. Set env HUB_VAULT_KEY (32-byte base64): openssl rand -base64 32"
    );
  }
  if (fs.existsSync(KEY_FILE)) {
    return Buffer.from(fs.readFileSync(KEY_FILE, "utf8"), "base64");
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, key.toString("base64"), { mode: 0o600 });
  return key;
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, encB64] = payload.split(":");
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "•".repeat(secret.length);
  return secret.slice(0, 4) + "•".repeat(Math.min(secret.length - 8, 20)) + secret.slice(-4);
}
