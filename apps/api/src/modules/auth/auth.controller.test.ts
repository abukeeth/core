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
  reassignStaffRole: vi.fn(),
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
import { EmailInUseError, OwnerWithoutBusinessError, StaffNotFoundError } from "./auth.errors";
import {
  forgotPassword,
  inviteStaff,
  login,
  reassignStaffRoleHandler,
  register,
  resendVerificationHandler,
} from "./auth.controller";
import {
  createStaff,
  dispatchSignupVerificationEmail,
  issueTokenPair,
  reassignStaffRole,
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

describe("inviteStaff (P2.6.0 — fail safely when the owner has no business)", () => {
  function staffReq() {
    return makeReq(
      { email: "s@x.com", password: "hunter222", name: "S" },
      {},
      { user: { id: "owner1", role: "RESTAURANT_OWNER" } } as Partial<Request>,
    );
  }

  it("maps OwnerWithoutBusinessError to a 409 and does not 201", async () => {
    vi.mocked(createStaff).mockRejectedValue(new OwnerWithoutBusinessError());
    const res = makeRes();

    await inviteStaff(staffReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.status).not.toHaveBeenCalledWith(201);
  });

  it("returns 201 with the created staff on success", async () => {
    vi.mocked(createStaff).mockResolvedValue({ id: "staff-1", role: "RESTAURANT_STAFF" } as never);
    vi.mocked(toPublicUser).mockImplementation((user) => user as never);
    const res = makeRes();

    await inviteStaff(staffReq(), res);

    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("reassignStaffRoleHandler (P2.6.1-pre-b — HTTP boundary)", () => {
  function roleReq(body: unknown) {
    return makeReq(body, {}, { user: { id: "owner1", role: "RESTAURANT_OWNER" }, params: { id: "staff-1" } } as Partial<Request>);
  }

  it("returns 200 with the updated staff summary on success", async () => {
    vi.mocked(reassignStaffRole).mockResolvedValue({
      id: "staff-1",
      name: "S",
      email: "s@x.com",
      phone: null,
      isActive: true,
      createdAt: new Date(),
      membershipRole: "KITCHEN",
    } as never);
    const res = makeRes();

    await reassignStaffRoleHandler(roleReq({ membershipRole: "KITCHEN" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(reassignStaffRole).toHaveBeenCalledWith("owner1", "staff-1", "KITCHEN");
  });

  it("maps StaffNotFoundError to 404 (cross-business / missing / owner-without-business)", async () => {
    vi.mocked(reassignStaffRole).mockRejectedValue(new StaffNotFoundError());
    const res = makeRes();

    await reassignStaffRoleHandler(roleReq({ membershipRole: "KITCHEN" }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 400 for an unsupported role without calling the service", async () => {
    const res = makeRes();

    await reassignStaffRoleHandler(roleReq({ membershipRole: "OWNER" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(reassignStaffRole).not.toHaveBeenCalled();
  });
});
