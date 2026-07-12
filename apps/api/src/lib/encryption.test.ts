import { createCipheriv } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetEnvCacheForTests } from "../config/env";
import { decryptSecret, encryptSecret, reencryptSecret } from "./encryption";

function legacyEncrypt(keyHex: string, ivHex: string, plaintext: string): string {
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(ivHex, "hex"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ivHex}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

function setRequiredCoreEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test",
    FRONTEND_URL: "http://localhost:3000",
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "30d",
    COMMERCE_ENCRYPTION_KEY: "a".repeat(64),
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  __resetEnvCacheForTests();
}

describe("encryption (Production Hardening Phase 3 — key versioning)", () => {
  beforeEach(() => {
    delete process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS;
    setRequiredCoreEnv();
  });

  it("round-trips a secret", () => {
    const encoded = encryptSecret("sk_test_super_secret_value");
    expect(encoded).not.toContain("sk_test_super_secret_value");
    expect(decryptSecret(encoded)).toBe("sk_test_super_secret_value");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-plaintext");
    const b = encryptSecret("same-plaintext");
    expect(a).not.toBe(b);
  });

  it("writes the new 4-part versioned format, keyed \"1\" for the current key", () => {
    const encoded = encryptSecret("value");
    const parts = encoded.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("1");
  });

  it("rejects a malformed encoded value", () => {
    expect(() => decryptSecret("not-the-right-shape")).toThrow();
  });

  it("rejects an encoded value with an unknown key version", () => {
    const encoded = encryptSecret("value");
    const [, iv, tag, ciphertext] = encoded.split(":");
    expect(() => decryptSecret(`9:${iv}:${tag}:${ciphertext}`)).toThrow(/unknown key version/);
  });

  it("rejects a tampered ciphertext (auth tag mismatch)", () => {
    const encoded = encryptSecret("secret");
    const [version, iv, tag, ciphertext] = encoded.split(":");
    const tampered = `${version}:${iv}:${tag}:${ciphertext.slice(0, -2)}ff`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws if COMMERCE_ENCRYPTION_KEY is missing", () => {
    setRequiredCoreEnv({ COMMERCE_ENCRYPTION_KEY: undefined });
    expect(() => encryptSecret("x")).toThrow(/COMMERCE_ENCRYPTION_KEY/);
  });

  describe("backward compatibility — legacy pre-Phase-3 ciphertext", () => {
    it("still decrypts the original 3-part format (no key-version prefix)", () => {
      // Hand-construct what encryptSecret produced before Phase 3, using
      // the same key material, to confirm decryptSecret's legacy branch
      // actually works end-to-end rather than just existing in the code.
      const legacyEncoded = legacyEncrypt("a".repeat(64), "b".repeat(24), "legacy-secret");
      expect(decryptSecret(legacyEncoded)).toBe("legacy-secret");
    });
  });

  describe("key rotation", () => {
    it("decrypts ciphertext written under the previous key once it's set as COMMERCE_ENCRYPTION_KEY_PREVIOUS", () => {
      // Encrypt under what will become the "previous" key.
      setRequiredCoreEnv({ COMMERCE_ENCRYPTION_KEY: "c".repeat(64) });
      const encodedUnderOldKey = encryptSecret("rotated-secret");
      expect(encodedUnderOldKey.startsWith("1:")).toBe(true);

      // Rotate: the old key becomes PREVIOUS, a new key becomes current.
      setRequiredCoreEnv({ COMMERCE_ENCRYPTION_KEY: "d".repeat(64), COMMERCE_ENCRYPTION_KEY_PREVIOUS: "c".repeat(64) });

      // Re-tag the envelope's key-version marker to "2" (previous) — this
      // is what a real rotation migration would have recorded when the
      // key was rotated; decryptSecret must honor it.
      const [, iv, tag, ciphertext] = encodedUnderOldKey.split(":");
      const asPreviousKeyEnvelope = `2:${iv}:${tag}:${ciphertext}`;

      expect(decryptSecret(asPreviousKeyEnvelope)).toBe("rotated-secret");
    });

    it("throws a clear error decrypting a previous-key envelope when COMMERCE_ENCRYPTION_KEY_PREVIOUS is not set", () => {
      setRequiredCoreEnv({ COMMERCE_ENCRYPTION_KEY_PREVIOUS: undefined });
      const encoded = encryptSecret("value");
      const [, iv, tag, ciphertext] = encoded.split(":");
      expect(() => decryptSecret(`2:${iv}:${tag}:${ciphertext}`)).toThrow(/COMMERCE_ENCRYPTION_KEY_PREVIOUS/);
    });

    it("reencryptSecret migrates a previous-key envelope onto the current key", () => {
      setRequiredCoreEnv({ COMMERCE_ENCRYPTION_KEY: "c".repeat(64) });
      const encodedUnderOldKey = encryptSecret("migrate-me");
      const [, iv, tag, ciphertext] = encodedUnderOldKey.split(":");
      const asPreviousKeyEnvelope = `2:${iv}:${tag}:${ciphertext}`;

      setRequiredCoreEnv({ COMMERCE_ENCRYPTION_KEY: "d".repeat(64), COMMERCE_ENCRYPTION_KEY_PREVIOUS: "c".repeat(64) });

      const migrated = reencryptSecret(asPreviousKeyEnvelope);

      expect(migrated.startsWith("1:")).toBe(true);
      expect(decryptSecret(migrated)).toBe("migrate-me");
    });

    it("reencryptSecret migrates a legacy 3-part envelope onto the new 4-part current-key format", () => {
      const legacyEncoded = legacyEncrypt("a".repeat(64), "e".repeat(24), "legacy-migrate-me");

      const migrated = reencryptSecret(legacyEncoded);

      expect(migrated.split(":")).toHaveLength(4);
      expect(decryptSecret(migrated)).toBe("legacy-migrate-me");
    });
  });
});
