import crypto from "crypto";

/**
 * AES-256-GCM encryption for OAuth tokens stored in Postgres.
 * Rows are RLS-protected, but tokens are additionally encrypted with a
 * server-side key so the browser (which can read its own rows via the
 * anon key) never sees usable credentials.
 */
function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptToken(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}
