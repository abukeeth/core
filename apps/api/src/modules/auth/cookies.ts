import type { CookieOptions, Response } from "express";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

const isProduction = process.env.NODE_ENV === "production";

/**
 * apps/web (Vercel) and apps/api (Render) are deployed on two separate
 * domains — cross-site for cookie purposes whenever a browser calls the
 * API directly (originally surfaced as RC-1 M3, when both apps were on
 * separate *.vercel.app domains; the same cross-site issue applies to
 * any two-domain split, Render included). Browsers never attach a
 * SameSite=Lax cookie to a cross-site fetch/XHR request, so every API
 * call after login would look unauthenticated. SameSite=None (which
 * requires Secure, already true in production) is what makes the auth
 * cookie actually reach the API from a different origin.
 */
const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
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
