import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.SHARE_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("SHARE_ENCRYPTION_KEY must be a 64-char hex string");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * @returns Base64-encoded string containing: IV (12 bytes) + auth tag (16 bytes) + ciphertext.
 *   This is a non-standard concatenation format — not compatible with tools
 *   that expect IV and tag to be passed separately.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Decrypts a value produced by {@link encrypt}. Throws on tampered data. */
export function decrypt(encoded: string): string {
  const key = getKey();
  const data = Buffer.from(encoded, "base64");

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
