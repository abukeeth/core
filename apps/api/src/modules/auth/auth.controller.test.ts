import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../lib/idempotency", () => ({
  reserveIdempotencyKey: vi.fn(),
  completeIdempotencyKey: vi.fn(),
  failIdempotencyKey: vi.fn(),
}));

vi.mock("./auth.service", () => ({
  changePassword: vi.fn(),
  createStaff: vi.fn(),
  dispatchSignupVerificationEmail: vi.fn(),
  getUserById: vi.fn(),
  issueTokenPair: vi.fn(),
  listStaff: vi.fn(),
  registerOwner: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  revokeAllRefreshTokensForUser: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  sendEmailVerification: vi.fn(),
  setStaffActive: vi.fn(),
  toPublicUser: vi.fn((user: unknown) => user),
  updateProfile: vi.fn(),
  validateCredentials: vi.fn(),
  verifyEmail: vi.fn(),
}));

import { completeIdempotencyKey, reserveIdempotencyKey } from "../../lib/idempotency";
import { EmailInUseError } from "./auth.errors";
import { forgotPassword, login, register, resendVerificationHandler } from "./auth.controller";
import {
  dispatchSignupVerificationEmail,
  issueTokenPair,
  registerOwner,
  requestPasswordReset,
  sendEmailVerification,
  toPublicUser,
  validateCredentials,
} from "./auth.service";

function makeReq(body: unknown, headers: Record<string, string> = {}, extra: Partial<Request> = {}): Request {
  return {
    body,
    header: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    ...extra,
  } as unknown as Request;
}

function makeRes(): Response {
  const headers = new Map<string, string>([["X-Request-Id", "req-test-1"]]);
  const res = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
    getHeader: vi.fn((name: string) => headers.get(name)),
  };
  return res as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "fresh" });
  vi.mocked(issueTokenPair).mockResolvedValue({
    accessToken: "access",
    refreshToken: "refresh",
    refreshExpiresAt: new Date(Date.now() + 60_000),
  });
});

describe("auth.controller stabilization", () => {
  it("returns signup success without blocking on verification email delivery", async () => {
    vi.mocked(registerOwner).mockResolvedValue({
      id: "u1",
      email: "owner@example.com",
      name: "Owner",
      role: "RESTAURANT_OWNER",
      isActive: true,
      emailVerified: false,
      phone: null,
    } as never);
    vi.mocked(toPublicUser).mockImplementation((user) => user as never);
    vi.mocked(dispatchSignupVerificationEmail).mockImplementation(() => undefined);

    const req = makeReq(
      { email: "owner@example.com", password: "hunter222", name: "Owner" },
      { "Idempotency-Key": "signup-key-1" },
    );
    const res = makeRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(dispatchSignupVerificationEmail).toHaveBeenCalledWith("u1");
    expect(completeIdempotencyKey).toHaveBeenCalled();
  });

  it("recovers signup safely when a retry hits EmailInUse with matching credentials", async () => {
    vi.mocked(registerOwner).mockRejectedValue(new EmailInUseError());
    vi.mocked(validateCredentials).mockResolvedValue({
      id: "u1",
      email: "owner@example.com",
      name: "Owner",
      role: "RESTAURANT_OWNER",
      isActive: true,
      emailVerified: false,
      phone: null,
    } as never);
    vi.mocked(toPublicUser).mockImplementation((user) => user as never);

    const req = makeReq(
      { email: "owner@example.com", password: "hunter222", name: "Owner" },
      { "Idempotency-Key": "signup-key-2" },
    );
    const res = makeRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ signupState: "ACCOUNT_RECOVERED" }));
  });

  it("replays completed signup idempotency snapshot without re-running creation", async () => {
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({
      status: "completed",
      response: { statusCode: 201, body: { signupState: "ACCOUNT_CREATED", user: { id: "u1" } } },
    });
    const req = makeReq(
      { email: "owner@example.com", password: "hunter222", name: "Owner" },
      { "Idempotency-Key": "signup-key-3" },
    );
    const res = makeRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(registerOwner).not.toHaveBeenCalled();
  });

  it("returns clear resend failure state when provider send fails", async () => {
    vi.mocked(sendEmailVerification).mockResolvedValue({ sent: false, state: "FAILED", errorMessage: "SMTP down" });
    const req = makeReq({}, { "Idempotency-Key": "resend-key-1" }, { user: { id: "u1" } as never });
    const res = makeRes();

    await resendVerificationHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "EMAIL_DELIVERY_FAILED", state: "FAILED" }));
  });

  it("does not claim password-reset email delivered when provider failed", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({
      accountFound: true,
      sent: false,
      errorMessage: "SMTP down",
    });
    const req = makeReq({ email: "owner@example.com" }, { "Idempotency-Key": "forgot-key-1" });
    const res = makeRes();

    await forgotPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "REQUEST_ACCEPTED",
        message: expect.stringContaining("If an account exists"),
      }),
    );
    expect(JSON.stringify(vi.mocked(res.json).mock.calls[0]?.[0] ?? {})).not.toContain("sent");
  });

  it("replays completed login request without creating another refresh session", async () => {
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({
      status: "completed",
      response: { statusCode: 200, body: { user: { id: "u1" }, loginState: "AUTHENTICATED" } },
    });
    const req = makeReq(
      { email: "owner@example.com", password: "hunter222", rememberMe: true },
      { "Idempotency-Key": "login-key-1" },
    );
    const res = makeRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(validateCredentials).not.toHaveBeenCalled();
    expect(issueTokenPair).not.toHaveBeenCalled();
  });
});
