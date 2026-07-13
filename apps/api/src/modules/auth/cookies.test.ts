import { afterEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";

function mockResponse(): Response & { cookie: ReturnType<typeof vi.fn>; clearCookie: ReturnType<typeof vi.fn> } {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response & { cookie: ReturnType<typeof vi.fn>; clearCookie: ReturnType<typeof vi.fn> };
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  vi.resetModules();
});

describe("auth cookies — SameSite", () => {
  it("sets SameSite=Lax in production — this app is same-origin-proxied, not genuinely cross-site", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { setAccessTokenCookie, setRefreshTokenCookie, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } = await import("./cookies.js");

    const res = mockResponse();
    setAccessTokenCookie(res, "access-token-value");
    setRefreshTokenCookie(res, "refresh-token-value", new Date());

    expect(res.cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, "access-token-value", expect.objectContaining({ sameSite: "lax", secure: true }));
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE, "refresh-token-value", expect.objectContaining({ sameSite: "lax", secure: true }));
  });

  it("sets SameSite=Lax outside production too", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const { setAccessTokenCookie, ACCESS_TOKEN_COOKIE } = await import("./cookies.js");

    const res = mockResponse();
    setAccessTokenCookie(res, "access-token-value");

    expect(res.cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, "access-token-value", expect.objectContaining({ sameSite: "lax", secure: false }));
  });

  it("clearAuthCookies also uses SameSite=Lax so the clear actually matches the cookie that was set", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { clearAuthCookies, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } = await import("./cookies.js");

    const res = mockResponse();
    clearAuthCookies(res);

    expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, expect.objectContaining({ sameSite: "lax" }));
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE, expect.objectContaining({ sameSite: "lax" }));
  });
});
