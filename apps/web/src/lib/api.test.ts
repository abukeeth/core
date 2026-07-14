import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, forgotPassword, login, resendVerification } from "./api";

describe("apiFetch — timeout and network error mapping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces a timeout-specific error instead of assuming a cold start", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    );

    await expect(login("owner@example.com", "hunter2")).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      message: expect.stringMatching(/request timed out/i),
    });
  });

  it("also maps a manually-aborted request (AbortError) to the same clear timeout message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "AbortError")));

    await expect(login("owner@example.com", "hunter2")).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
  });

  it("surfaces a distinct message for a genuine network failure (no server reachable at all)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(login("owner@example.com", "hunter2")).rejects.toMatchObject({
      code: "NETWORK_UNREACHABLE",
      message: expect.stringMatching(/couldn't reach the server/i),
    });
  });

  it("passes an AbortSignal on every request so a hang is actually bounded", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await login("owner@example.com", "hunter2");

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("still surfaces the API's own error message for a normal (non-network) failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid credentials", code: "AUTHENTICATION_FAILED" }),
    }));

    await expect(login("owner@example.com", "wrong")).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      message: expect.stringMatching(/authentication failed/i),
    });
  });

  it("resolves normally on a healthy response, unaffected by the added timeout wiring", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1", email: "owner@example.com" } }),
    }));

    const result = await login("owner@example.com", "hunter2");
    expect(result.user.id).toBe("u1");
  });

  it("maps resend delivery failures to EMAIL_DELIVERY_FAILED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Could not deliver", code: "EMAIL_DELIVERY_FAILED" }),
    }));

    await expect(resendVerification()).rejects.toMatchObject({
      code: "EMAIL_DELIVERY_FAILED",
      message: expect.stringMatching(/email delivery failed/i),
    });
  });

  it("maps unknown 5xx failures to service temporarily unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    }));

    await expect(forgotPassword("owner@example.com")).rejects.toMatchObject({
      code: "SERVICE_TEMPORARILY_UNAVAILABLE",
      message: expect.stringMatching(/temporarily unavailable/i),
    });
  });

  it("throws AUTH_REQUEST_IN_PROGRESS when login returns an accepted in-progress state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ error: "Login is still processing", code: "AUTH_REQUEST_IN_PROGRESS" }),
    }));

    const err = await login("owner@example.com", "hunter2").catch((caught) => caught);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).code).toBe("AUTH_REQUEST_IN_PROGRESS");
  });
});
