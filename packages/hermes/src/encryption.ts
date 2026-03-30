/**
 * Memory Encryption at Rest — optional AES-256-GCM encryption.
 *
 * When HERMES_ENCRYPTION_KEY env var is set, memory content is encrypted
 * before writing to YAML and decrypted on read. The key is derived from
 * the passphrase using PBKDF2 with a per-project salt.
 */

import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const PREFIX = "hermes:enc:";

/** Derive an encryption key from a passphrase and salt. */
export async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256", (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Encrypt plaintext content. Returns prefixed base64 string. */
export function encryptContent(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, encrypted, tag]);
  return PREFIX + combined.toString("base64");
}

/** Decrypt encrypted content. Expects prefixed base64 string. */
export function decryptContent(encrypted: string, key: Buffer): string {
  if (!encrypted.startsWith(PREFIX)) return encrypted;
  const data = Buffer.from(encrypted.slice(PREFIX.length), "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(data.length - TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf-8");
}

/** Check if content is encrypted. */
export function isEncrypted(content: string): boolean {
  return content.startsWith(PREFIX);
}

/** Get or create the project salt file. */
export async function getOrCreateSalt(hermesDir: string): Promise<Buffer> {
  const saltPath = path.join(hermesDir, ".salt");
  try {
    const hex = await fs.readFile(saltPath, "utf-8");
    return Buffer.from(hex.trim(), "hex");
  } catch {
    const salt = crypto.randomBytes(32);
    await fs.mkdir(hermesDir, { recursive: true });
    await fs.writeFile(saltPath, salt.toString("hex"), "utf-8");
    return salt;
  }
}

/** Resolve the encryption key from env var + project salt. Returns null if not configured. */
export async function resolveEncryptionKey(hermesDir: string): Promise<Buffer | null> {
  const passphrase = process.env.HERMES_ENCRYPTION_KEY;
  if (!passphrase) return null;
  const salt = await getOrCreateSalt(hermesDir);
  return deriveKey(passphrase, salt);
}
