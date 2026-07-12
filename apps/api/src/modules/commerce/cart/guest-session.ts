import { randomBytes } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";

export const GUEST_SESSION_COOKIE = "guest_session_id";

const isProduction = process.env.NODE_ENV === "production";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Anonymous cart identity for guest checkout — a random, unguessable
 * session id stored in an httpOnly cookie, reused across requests until
 * the guest either checks out or the cookie expires. Distinct from both
 * staff auth and customer auth cookies.
 */
export function resolveGuestSessionId(req: Request, res: Response): string {
  const existing = req.cookies?.[GUEST_SESSION_COOKIE];
  if (typeof existing === "string" && existing.length > 0) {
    return existing;
  }
  const sessionId = randomBytes(24).toString("base64url");
  res.cookie(GUEST_SESSION_COOKIE, sessionId, cookieOptions);
  return sessionId;
}
