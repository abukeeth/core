import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./customer-cookies", () => ({
  CUSTOMER_REFRESH_TOKEN_COOKIE: "customer_refresh_token",
  clearCustomerAuthCookies: vi.fn(),
  setCustomerAccessTokenCookie: vi.fn(),
  setCustomerRefreshTokenCookie: vi.fn(),
}));

vi.mock("./customers.service", () => ({
  changePassword: vi.fn(),
  getCustomerById: vi.fn(),
  issueCustomerTokenPair: vi.fn(),
  registerCustomer: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  revokeCustomerRefreshToken: vi.fn(),
  rotateCustomerRefreshToken: vi.fn(),
  toPublicCustomer: vi.fn((c: unknown) => c),
  validateCustomerCredentials: vi.fn(),
}));

import type { Request, Response } from "express";
import { clearCustomerAuthCookies, setCustomerAccessTokenCookie, setCustomerRefreshTokenCookie } from "./customer-cookies";
import {
  changePasswordHandler,
  confirmPasswordResetHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
  requestPasswordResetHandler,
} from "./customers.controller";
import { CustomerEmailInUseError, InvalidCustomerCredentialsError, InvalidPasswordResetTokenError } from "./customers.errors";
import {
  changePassword,
  issueCustomerTokenPair,
  registerCustomer,
  requestPasswordReset,
  resetPassword,
  revokeCustomerRefreshToken,
  rotateCustomerRefreshToken,
  validateCustomerCredentials,
} from "./customers.service";

function mockRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return res as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(issueCustomerTokenPair).mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    refreshExpiresAt: new Date(Date.now() + 1000),
  });
});

describe("registerHandler", () => {
  it("sets access + refresh cookies and returns 201 on success", async () => {
    vi.mocked(registerCustomer).mockResolvedValue({ id: "c1", email: "a@b.com" } as never);

    const req = { body: { email: "a@b.com", password: "password123", name: "Alex" } } as unknown as Request;
    const res = mockRes();

    await registerHandler(req, res);

    expect(setCustomerAccessTokenCookie).toHaveBeenCalledWith(res, "access-token");
    expect(setCustomerRefreshTokenCookie).toHaveBeenCalledWith(res, "refresh-token");
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("maps CustomerEmailInUseError to 409 without setting cookies", async () => {
    vi.mocked(registerCustomer).mockRejectedValue(new CustomerEmailInUseError());

    const req = { body: { email: "a@b.com", password: "password123", name: "Alex" } } as unknown as Request;
    const res = mockRes();

    await registerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(setCustomerAccessTokenCookie).not.toHaveBeenCalled();
  });
});

describe("loginHandler", () => {
  it("maps InvalidCustomerCredentialsError to 401", async () => {
    vi.mocked(validateCustomerCredentials).mockRejectedValue(new InvalidCustomerCredentialsError());

    const req = { body: { email: "a@b.com", password: "password123" } } as unknown as Request;
    const res = mockRes();

    await loginHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("refreshHandler (Sprint 07.7 H-7)", () => {
  it("returns 401 without rotating when there is no refresh cookie", async () => {
    const req = { cookies: {} } as unknown as Request;
    const res = mockRes();

    await refreshHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(rotateCustomerRefreshToken).not.toHaveBeenCalled();
  });

  it("clears cookies and returns 401 when the presented refresh token is invalid/expired/revoked", async () => {
    vi.mocked(rotateCustomerRefreshToken).mockRejectedValue(new Error("invalid refresh token"));

    const req = { cookies: { customer_refresh_token: "stale" } } as unknown as Request;
    const res = mockRes();

    await refreshHandler(req, res);

    expect(clearCustomerAuthCookies).toHaveBeenCalledWith(res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rotates the token — sets a brand-new pair of cookies and returns 200 on a valid refresh token", async () => {
    vi.mocked(rotateCustomerRefreshToken).mockResolvedValue({
      customerId: "c1",
      tokens: { accessToken: "new-access-token", refreshToken: "new-refresh-token", refreshExpiresAt: new Date() },
    });

    const req = { cookies: { customer_refresh_token: "valid" } } as unknown as Request;
    const res = mockRes();

    await refreshHandler(req, res);

    expect(rotateCustomerRefreshToken).toHaveBeenCalledWith("valid");
    expect(setCustomerAccessTokenCookie).toHaveBeenCalledWith(res, "new-access-token");
    expect(setCustomerRefreshTokenCookie).toHaveBeenCalledWith(res, "new-refresh-token");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("a second refresh with the same (now-rotated-away) token is rejected — replay protection", async () => {
    vi.mocked(rotateCustomerRefreshToken)
      .mockResolvedValueOnce({
        customerId: "c1",
        tokens: { accessToken: "a1", refreshToken: "r1", refreshExpiresAt: new Date() },
      })
      .mockRejectedValueOnce(new Error("invalid refresh token"));

    const req = { cookies: { customer_refresh_token: "original" } } as unknown as Request;
    await refreshHandler(req, mockRes());

    const replayRes = mockRes();
    await refreshHandler(req, replayRes);

    expect(replayRes.status).toHaveBeenCalledWith(401);
  });
});

describe("logoutHandler (Sprint 07.7 H-7)", () => {
  it("revokes the presented refresh token, clears cookies, and returns 200", async () => {
    const req = { cookies: { customer_refresh_token: "valid" } } as unknown as Request;
    const res = mockRes();

    await logoutHandler(req, res);

    expect(revokeCustomerRefreshToken).toHaveBeenCalledWith("valid");
    expect(clearCustomerAuthCookies).toHaveBeenCalledWith(res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("clears cookies and returns 200 even with no refresh cookie present (nothing to revoke)", async () => {
    const req = { cookies: {} } as unknown as Request;
    const res = mockRes();

    await logoutHandler(req, res);

    expect(revokeCustomerRefreshToken).not.toHaveBeenCalled();
    expect(clearCustomerAuthCookies).toHaveBeenCalledWith(res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("a refreshHandler call with the token presented at logout is rejected afterward", async () => {
    const req = { cookies: { customer_refresh_token: "valid" } } as unknown as Request;
    await logoutHandler(req, mockRes());

    vi.mocked(rotateCustomerRefreshToken).mockRejectedValue(new Error("invalid refresh token"));
    const refreshRes = mockRes();
    await refreshHandler(req, refreshRes);

    expect(refreshRes.status).toHaveBeenCalledWith(401);
  });
});

describe("requestPasswordResetHandler (Sprint 07.7 H-6)", () => {
  it("returns 200 for a well-formed request regardless of whether the email exists", async () => {
    const req = { body: { email: "a@b.com" } } as unknown as Request;
    const res = mockRes();

    await requestPasswordResetHandler(req, res);

    expect(requestPasswordReset).toHaveBeenCalledWith("a@b.com");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 on invalid input without calling the service", async () => {
    const req = { body: { email: "not-an-email" } } as unknown as Request;
    const res = mockRes();

    await requestPasswordResetHandler(req, res);

    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("confirmPasswordResetHandler (Sprint 07.7 H-6)", () => {
  it("returns 200 on a successful reset", async () => {
    vi.mocked(resetPassword).mockResolvedValue(undefined);
    const req = { body: { token: "valid-token", newPassword: "newPassword123" } } as unknown as Request;
    const res = mockRes();

    await confirmPasswordResetHandler(req, res);

    expect(resetPassword).toHaveBeenCalledWith("valid-token", "newPassword123");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("maps InvalidPasswordResetTokenError to 400", async () => {
    vi.mocked(resetPassword).mockRejectedValue(new InvalidPasswordResetTokenError());
    const req = { body: { token: "stale-token", newPassword: "newPassword123" } } as unknown as Request;
    const res = mockRes();

    await confirmPasswordResetHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("changePasswordHandler (Sprint 07.7 H-6)", () => {
  it("returns 200 on a successful change", async () => {
    vi.mocked(changePassword).mockResolvedValue(undefined);
    const req = { customer: { id: "c1" }, body: { currentPassword: "old-pw", newPassword: "newPassword123" } } as unknown as Request;
    const res = mockRes();

    await changePasswordHandler(req, res);

    expect(changePassword).toHaveBeenCalledWith("c1", "old-pw", "newPassword123");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("maps InvalidCustomerCredentialsError (wrong currentPassword) to 401", async () => {
    vi.mocked(changePassword).mockRejectedValue(new InvalidCustomerCredentialsError());
    const req = { customer: { id: "c1" }, body: { currentPassword: "wrong-pw", newPassword: "newPassword123" } } as unknown as Request;
    const res = mockRes();

    await changePasswordHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
