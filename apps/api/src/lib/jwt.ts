import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { getEnv } from "../config/env";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

/**
 * Reads lazily from the centralized, validated config (Production
 * Hardening Phase 3) on every call rather than eagerly at module-load
 * time — this is a deliberate relaxation from the previous eager
 * top-level `requireEnv()` calls, which meant importing this module at
 * all required every JWT env var to already be set (several test files
 * across this codebase set these vars specifically to satisfy that
 * constraint). getEnv() is memoized, so this costs nothing beyond the
 * first call.
 */

export function signAccessToken(payload: AccessTokenPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getEnv().JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function generateRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(48).toString("hex");
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + parseDurationMs(getEnv().JWT_REFRESH_TTL)),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/;

function parseDurationMs(duration: string): number {
  const match = DURATION_PATTERN.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  const amount = Number(match[1]);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
  return amount * unitMs;
}
