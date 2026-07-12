import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./public-payment-config.service", () => ({
  getPublicPaymentConfig: vi.fn(),
}));

import type { Request, Response } from "express";
import { getPublicPaymentConfigHandler } from "./public-payment-config.controller";
import { getPublicPaymentConfig } from "./public-payment-config.service";

function mockRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return res as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicPaymentConfigHandler", () => {
  it("returns 200 with the public config shape when a provider is connected", async () => {
    vi.mocked(getPublicPaymentConfig).mockResolvedValue({ providerType: "STRIPE", publicKey: "pk_live_abc" });

    const req = { params: { restaurantId: "r1" } } as unknown as Request;
    const res = mockRes();

    await getPublicPaymentConfigHandler(req, res);

    expect(getPublicPaymentConfig).toHaveBeenCalledWith("r1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ config: { providerType: "STRIPE", publicKey: "pk_live_abc" } });
  });

  it("returns 200 with a null config when no provider is connected (not a 404 — this is a valid, uninitialized state)", async () => {
    vi.mocked(getPublicPaymentConfig).mockResolvedValue(null);

    const req = { params: { restaurantId: "r1" } } as unknown as Request;
    const res = mockRes();

    await getPublicPaymentConfigHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ config: null });
  });
});
