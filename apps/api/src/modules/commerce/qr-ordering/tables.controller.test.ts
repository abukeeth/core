import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tables.service", () => ({
  resolveTableByToken: vi.fn(),
}));

import type { Request, Response } from "express";
import { resolveTableByToken } from "./tables.service";
import { resolveTableHandler } from "./tables.controller";

function mockRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return res as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveTableHandler", () => {
  it("never includes qrToken in the response body", async () => {
    vi.mocked(resolveTableByToken).mockResolvedValue({
      id: "t1",
      restaurantId: "r1",
      label: "Table 5",
      qrToken: "super-secret-token",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const req = { params: { qrToken: "super-secret-token" } } as unknown as Request;
    const res = mockRes();

    await resolveTableHandler(req, res);

    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(JSON.stringify(jsonCall)).not.toContain("super-secret-token");
    expect(jsonCall).toEqual({ table: { id: "t1", restaurantId: "r1", label: "Table 5" } });
  });
});
