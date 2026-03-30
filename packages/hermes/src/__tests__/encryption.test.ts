import { describe, it, expect } from "vitest";
import * as crypto from "crypto";
import {
  encryptContent,
  decryptContent,
  isEncrypted,
  deriveKey,
} from "../encryption";

function makeKey(): Buffer {
  return crypto.randomBytes(32);
}

describe("encryptContent + decryptContent", () => {
  it("round-trip: encrypts then decrypts to original", () => {
    const key = makeKey();
    const plaintext = "Hello, Hermes memory content!";
    const encrypted = encryptContent(plaintext, key);
    const decrypted = decryptContent(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });
});

describe("isEncrypted", () => {
  it("returns true for encrypted string", () => {
    const key = makeKey();
    const encrypted = encryptContent("test", key);
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("returns false for plain string", () => {
    expect(isEncrypted("just a regular string")).toBe(false);
  });
});

describe("decryptContent", () => {
  it("returns plain string unchanged if not encrypted", () => {
    const key = makeKey();
    const plain = "not encrypted at all";
    const result = decryptContent(plain, key);
    expect(result).toBe(plain);
  });
});

describe("deriveKey", () => {
  it("produces consistent output for same inputs", async () => {
    const salt = crypto.randomBytes(16);
    const passphrase = "my-secret-passphrase";

    const key1 = await deriveKey(passphrase, salt);
    const key2 = await deriveKey(passphrase, salt);

    expect(Buffer.compare(key1, key2)).toBe(0);
    expect(key1.length).toBe(32);
  });
});
