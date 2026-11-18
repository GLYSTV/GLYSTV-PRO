import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for secrets stored in the database (provider passwords).
 * Key: APP_SECRET env var (any long random string). When it is not set, a key
 * derived from DATABASE_URL is used so the app still works out of the box —
 * set APP_SECRET in production and never change it afterwards.
 */
const PREFIX = "enc:v1:";

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.APP_SECRET?.trim() || `fallback:${process.env.DATABASE_URL ?? "glystv-pro"}`;
  if (!process.env.APP_SECRET && process.env.NODE_ENV === "production") {
    console.warn("[crypto] APP_SECRET no está definido: usando una clave derivada de DATABASE_URL. Define APP_SECRET en producción.");
  }
  cachedKey = createHash("sha256").update(secret).digest();
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, data]).toString("base64url");
}

/** Decrypts values produced by encryptSecret; legacy plain-text values are returned as-is. */
export function decryptSecret(stored: string): string {
  if (!stored || !stored.startsWith(PREFIX)) return stored;
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("No se pudo descifrar un secreto almacenado (¿ha cambiado APP_SECRET?)");
  }
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
