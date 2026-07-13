import { beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "./api";

describe("apiFetch — timeout and network error mapping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces a clear, actionable message when the request times out, instead of hanging or a raw AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    );

    await expect(login("owner@example.com", "hunter2")).rejects.toThrow(/taking longer than expected.*waking up/i);
  });

  it("also maps a manually-aborted request (AbortError) to the same clear timeout message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "AbortError")));

    await expect(login("owner@example.com", "hunter2")).rejects.toThrow(/taking longer than expected/i);
  });

  it("surfaces a distinct message for a genuine network failure (no server reachable at all)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(login("owner@example.com", "hunter2")).rejects.toThrow(/couldn't reach the server/i);
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
      json: async () => ({ error: "Invalid credentials" }),
    }));

    await expect(login("owner@example.com", "wrong")).rejects.toThrow("Invalid credentials");
  });

  it("resolves normally on a healthy response, unaffected by the added timeout wiring", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1", email: "owner@example.com" } }),
    }));

    const result = await login("owner@example.com", "hunter2");
    expect(result.user.id).toBe("u1");
  });
});
