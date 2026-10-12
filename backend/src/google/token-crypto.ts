import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_BYTES = 12;

/** 32-byte AES key from GOOGLE_TOKEN_ENCRYPTION_KEY (base64). */
export function parseTokenKey(raw: string | undefined): Buffer | null {
  if (!raw?.trim()) return null;
  const key = Buffer.from(raw.trim(), "base64");
  return key.length === 32 ? key : null;
}

/** AES-256-GCM, serialized as "iv:tag:ciphertext" in base64. */
export function encryptToken(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(":");
}

export function decryptToken(payload: string, key: Buffer): string {
  const [iv, tag, data] = payload.split(":").map((part) => Buffer.from(part, "base64"));
  if (!iv || !tag || !data || iv.length !== IV_BYTES) {
    throw new Error("Malformed encrypted token");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
