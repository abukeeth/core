import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { GUEST_SESSION_COOKIE, resolveGuestSessionId } from "./guest-session";

describe("resolveGuestSessionId", () => {
  it("reuses an existing cookie value without setting a new one", () => {
    const req = { cookies: { [GUEST_SESSION_COOKIE]: "existing-id" } } as unknown as Request;
    const res = { cookie: vi.fn() } as unknown as Response;

    const id = resolveGuestSessionId(req, res);

    expect(id).toBe("existing-id");
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("generates and sets a new cookie when none exists", () => {
    const req = { cookies: {} } as unknown as Request;
    const res = { cookie: vi.fn() } as unknown as Response;

    const id = resolveGuestSessionId(req, res);

    expect(id.length).toBeGreaterThan(10);
    expect(res.cookie).toHaveBeenCalledWith(GUEST_SESSION_COOKIE, id, expect.any(Object));
  });
});
