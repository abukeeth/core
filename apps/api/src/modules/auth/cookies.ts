import type { CookieOptions, Response } from "express";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Was previously SameSite=None in production — a holdover from a period
 * when a browser could call apps/api directly cross-site. That's no
 * longer how this app is deployed: apps/web's next.config.ts rewrites()
 * proxies every /api/* call server-side (confirmed unconditional, not
 * gated behind process.env.VERCEL — same behavior whether apps/web runs
 * on Render or Vercel), so the browser only ever talks to apps/web's own
 * origin. This cookie is same-origin from the browser's perspective
 * regardless of which separate host apps/api itself lives on, so Lax is
 * correct and sufficient — and matches every other cookie this codebase
 * sets (customer-cookies.ts, guest-session.ts are both already Lax; this
 * was the one outlier). If a genuine cross-site caller is ever added
 * (e.g. a public third-party integration authenticating via this same
 * cookie), that specific caller needs None+Secure on its own — it should
 * not be the default for every caller to support a case that doesn't
 * exist today.
 */
const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
};

export function setAccessTokenCookie(res: Response, token: string, expiresAt?: Date): void {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...baseOptions,
    path: "/",
    ...(expiresAt ? { expires: expiresAt } : {}),
  });
}

/**
 * When rememberMe is false, the `expires` attribute is omitted so the
 * browser treats this as a session cookie (cleared on browser close) even
 * though the underlying RefreshToken row still carries its normal
 * expiresAt server-side (Sprint 18 — Remember Me).
 */
export function setRefreshTokenCookie(res: Response, token: string, expiresAt: Date, rememberMe = true): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...baseOptions,
    path: "/api/auth",
    ...(rememberMe ? { expires: expiresAt } : {}),
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...baseOptions, path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...baseOptions, path: "/api/auth" });
}
