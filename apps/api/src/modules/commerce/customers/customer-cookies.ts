import type { CookieOptions, Response } from "express";

export const CUSTOMER_ACCESS_TOKEN_COOKIE = "customer_access_token";
export const CUSTOMER_REFRESH_TOKEN_COOKIE = "customer_refresh_token";

const isProduction = process.env.NODE_ENV === "production";

const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
};

// Distinct cookie names from staff auth (access_token/refresh_token) so a
// customer session and a staff session can coexist in the same browser
// without colliding — e.g. an owner testing their own storefront while
// logged into their dashboard.

export function setCustomerAccessTokenCookie(res: Response, token: string): void {
  res.cookie(CUSTOMER_ACCESS_TOKEN_COOKIE, token, { ...baseOptions, path: "/" });
}

export function setCustomerRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(CUSTOMER_REFRESH_TOKEN_COOKIE, token, {
    ...baseOptions,
    path: "/api/customer/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearCustomerAuthCookies(res: Response): void {
  res.clearCookie(CUSTOMER_ACCESS_TOKEN_COOKIE, { ...baseOptions, path: "/" });
  res.clearCookie(CUSTOMER_REFRESH_TOKEN_COOKIE, { ...baseOptions, path: "/api/customer/auth" });
}
