import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { getStringEnv, requireEnv } from "../../../config/env";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Deliberately uses config/env.ts's narrow, single-key `requireEnv`/
 * `getStringEnv` helpers, not `getEnv()`'s full core schema: this file
 * only ever needed JWT_ACCESS_SECRET/JWT_ACCESS_TTL, and requiring the
 * rest of the app's core config (DATABASE_URL, COMMERCE_ENCRYPTION_KEY,
 * etc.) just to sign a customer token would be a broader requirement than
 * this file actually has — the same reasoning that originally kept this
 * file from importing lib/jwt.ts directly, preserved through the Phase 3
 * config centralization rather than discarded by it.
 */
export function hashCustomerRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface CustomerAccessPayload {
  sub: string;
  kind: "customer";
}

/**
 * Separate end-diner identity, sharing JWT_ACCESS_SECRET with staff auth
 * (no new secret to manage) but a distinct `kind` discriminator — mirrors
 * modules/sites/preview-token.ts's pattern — so a customer access token
 * can never be mistaken for or reused as a staff access token.
 */
export function signCustomerAccessToken(customerId: string): string {
  const payload: CustomerAccessPayload = { sub: customerId, kind: "customer" };
  return jwt.sign(payload, requireEnv("JWT_ACCESS_SECRET"), {
    expiresIn: getStringEnv("JWT_ACCESS_TTL", "15m") as jwt.SignOptions["expiresIn"],
  });
}

export function verifyCustomerAccessToken(token: string): string {
  const decoded = jwt.verify(token, requireEnv("JWT_ACCESS_SECRET")) as Partial<CustomerAccessPayload>;
  if (decoded.kind !== "customer" || typeof decoded.sub !== "string") {
    throw new Error("Not a valid customer access token");
  }
  return decoded.sub;
}

/**
 * Opaque, DB-backed refresh token (Sprint 07.7 H-7) — mirrors staff
 * auth's RefreshToken pattern (lib/jwt.ts's generateRefreshToken),
 * replacing the prior self-contained-JWT design that had no server-side
 * revocation and survived logout. The raw token is only ever held by the
 * client (as the cookie value); customers.service.ts stores only its
 * hash, alongside customerId/expiresAt/revokedAt, in CustomerRefreshToken.
 */
export function generateCustomerRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(48).toString("hex");
  return {
    token,
    tokenHash: hashCustomerRefreshToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  };
}
