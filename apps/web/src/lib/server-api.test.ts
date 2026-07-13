import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ toString: () => "access_token=abc" }),
}));

import { serverFetch } from "./server-api";

describe("serverFetch — timeout and network error mapping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reports reason: 'timeout' instead of hanging when the backend never responds in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    );

    const result = await serverFetch("/api/auth/me");

    expect(result).toEqual({ ok: false, status: 503, reason: "timeout" });
  });

  it("reports reason: 'network' for a connection failure distinct from a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const result = await serverFetch("/api/auth/me");

    expect(result).toEqual({ ok: false, status: 503, reason: "network" });
  });

  it("reports reason: 'http' for a normal non-2xx response, preserving the real status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const result = await serverFetch("/api/auth/me");

    expect(result).toEqual({ ok: false, status: 401, reason: "http" });
  });

  it("passes an AbortSignal on every request so a hang is actually bounded", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: "u1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    await serverFetch("/api/auth/me");

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("resolves normally on a healthy response, unaffected by the added timeout wiring", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: "u1" } }) }));

    const result = await serverFetch<{ user: { id: string } }>("/api/auth/me");

    expect(result).toEqual({ ok: true, data: { user: { id: "u1" } } });
  });
});
