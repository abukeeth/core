import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEnv } from "../config/env";

/**
 * Envelope encryption for provider credentials (PaymentProvider,
 * FulfillmentProvider, POSProvider .credentialsEncrypted /
 * .webhookSecretEncrypted). Deliberately a separate key from
 * JWT_ACCESS_SECRET — these secrets, if leaked, could authorize real
 * charges against a restaurant's live merchant account (Sprint 07 spec §14).
 *
 * Versioned envelope (Production Hardening Phase 3 / M-1 key rotation):
 * `encryptSecret` always writes the new 4-part format,
 * `${keyVersion}:${iv}:${authTag}:${ciphertext}` — keyVersion "1" means
 * COMMERCE_ENCRYPTION_KEY (current), "2" means
 * COMMERCE_ENCRYPTION_KEY_PREVIOUS. `decryptSecret` accepts both that
 * format AND the original 3-part format with no version prefix
 * (`${iv}:${authTag}:${ciphertext}`, always decrypted under the current
 * key) — so any ciphertext already written before this phase remains
 * decryptable indefinitely; nothing needs to be migrated for existing
 * data to keep working. `reencryptSecret` below is the opt-in migration
 * path for moving old-format or previous-key ciphertext onto the current
 * key. See docs/runbooks/secret-rotation.md.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const CURRENT_KEY_VERSION = "1";
const PREVIOUS_KEY_VERSION = "2";

function keyForVersion(version: typeof CURRENT_KEY_VERSION | typeof PREVIOUS_KEY_VERSION): Buffer {
  const hex = version === PREVIOUS_KEY_VERSION ? requirePreviousKeyHex() : getEnv().COMMERCE_ENCRYPTION_KEY;
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be a 32-byte (64 hex character) value");
  }
  return key;
}

function requirePreviousKeyHex(): string {
  const previous = getEnv().COMMERCE_ENCRYPTION_KEY_PREVIOUS;
  if (!previous) {
    throw new Error("Cannot decrypt: ciphertext was encrypted under the previous key, but COMMERCE_ENCRYPTION_KEY_PREVIOUS is not set");
  }
  return previous;
}

/** Returns `${keyVersion}:${iv}:${authTag}:${ciphertext}`, each hex-encoded except keyVersion. Always writes under the current key. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyForVersion(CURRENT_KEY_VERSION), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${CURRENT_KEY_VERSION}:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/** Accepts both the legacy 3-part (no key-version prefix, current key) format and the new 4-part versioned format. */
export function decryptSecret(encoded: string): string {
  const parts = encoded.split(":");

  let keyVersion: typeof CURRENT_KEY_VERSION | typeof PREVIOUS_KEY_VERSION;
  let ivHex: string;
  let authTagHex: string;
  let ciphertextHex: string;

  if (parts.length === 3) {
    // Pre-Phase-3 format — no version prefix, always the current key.
    keyVersion = CURRENT_KEY_VERSION;
    [ivHex, authTagHex, ciphertextHex] = parts;
  } else if (parts.length === 4) {
    if (parts[0] !== CURRENT_KEY_VERSION && parts[0] !== PREVIOUS_KEY_VERSION) {
      throw new Error(`Malformed encrypted secret: unknown key version "${parts[0]}"`);
    }
    [, ivHex, authTagHex, ciphertextHex] = parts;
    keyVersion = parts[0];
  } else {
    throw new Error("Malformed encrypted secret");
  }

  const decipher = createDecipheriv(ALGORITHM, keyForVersion(keyVersion), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Re-encrypts ciphertext (legacy 3-part, or 4-part under either key
 * version) so it's stored under the current key in the current format —
 * the migration step a real key rotation needs (Production Hardening
 * Phase 3, see docs/runbooks/secret-rotation.md). Idempotent: re-running
 * it on already-current-key ciphertext just re-encrypts with a fresh IV,
 * which is harmless.
 */
export function reencryptSecret(encoded: string): string {
  return encryptSecret(decryptSecret(encoded));
}
