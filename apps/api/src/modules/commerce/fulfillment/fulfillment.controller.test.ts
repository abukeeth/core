import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../restaurants/restaurant.service", () => ({
  getOwnRestaurantId: vi.fn(),
}));

vi.mock("./fulfillment.service", () => ({
  getFulfillment: vi.fn(),
  getDriverAssignmentByFulfillment: vi.fn(),
  recordLocationPing: vi.fn(),
  assignDriver: vi.fn(),
  listDriverCandidates: vi.fn(),
  updateFulfillmentStatus: vi.fn(),
  listMyDriverAssignments: vi.fn(),
  respondToAssignment: vi.fn(),
}));

vi.mock("./provider.service", () => ({
  listProviders: vi.fn(),
  connectProvider: vi.fn(),
  disconnectProvider: vi.fn(),
}));

import type { Request, Response } from "express";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import {
  assignDriverHandler,
  listDriverCandidatesHandler,
  locationPingHandler,
  myAssignmentsHandler,
  respondToAssignmentHandler,
} from "./fulfillment.controller";
import { DriverAlreadyBusyError, DriverAssignmentNotFoundError, DriverNotOnStaffError } from "./fulfillment.errors";
import {
  assignDriver,
  getDriverAssignmentByFulfillment,
  getFulfillment,
  listDriverCandidates,
  listMyDriverAssignments,
  recordLocationPing,
  respondToAssignment,
} from "./fulfillment.service";

function mockRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), send: vi.fn() };
  return res as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("locationPingHandler", () => {
  it("lets the assigned driver post a location update", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(getFulfillment).mockResolvedValue({ id: "f1", restaurantId: "r1" } as never);
    vi.mocked(getDriverAssignmentByFulfillment).mockResolvedValue({ id: "da1", driverId: "driver-1" } as never);
    vi.mocked(recordLocationPing).mockResolvedValue({ id: "da1" } as never);

    const req = {
      user: { id: "driver-1" },
      params: { id: "f1" },
      body: { lat: 41.8, lng: -87.6 },
    } as unknown as Request;
    const res = mockRes();

    await locationPingHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects a staff member who is not the assigned driver with 403, not 404", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(getFulfillment).mockResolvedValue({ id: "f1", restaurantId: "r1" } as never);
    vi.mocked(getDriverAssignmentByFulfillment).mockResolvedValue({ id: "da1", driverId: "driver-1" } as never);

    const req = {
      user: { id: "some-other-staffer" },
      params: { id: "f1" },
      body: { lat: 41.8, lng: -87.6 },
    } as unknown as Request;
    const res = mockRes();

    await locationPingHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(recordLocationPing).not.toHaveBeenCalled();
  });
});

describe("myAssignmentsHandler", () => {
  it("scopes the driver queue to the calling staff member", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(listMyDriverAssignments).mockResolvedValue([{ id: "da1" }] as never);

    const req = { user: { id: "driver-1" } } as unknown as Request;
    const res = mockRes();

    await myAssignmentsHandler(req, res);

    expect(listMyDriverAssignments).toHaveBeenCalledWith("r1", "driver-1");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("respondToAssignmentHandler", () => {
  it("maps DriverAssignmentNotFoundError to 404 for another driver's assignment", async () => {
    vi.mocked(respondToAssignment).mockRejectedValue(new DriverAssignmentNotFoundError());

    const req = { user: { id: "driver-1" }, params: { id: "da1" }, body: { accept: true } } as unknown as Request;
    const res = mockRes();

    await respondToAssignmentHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("accepts a valid assignment", async () => {
    vi.mocked(respondToAssignment).mockResolvedValue({ id: "da1", status: "ACCEPTED" } as never);

    const req = { user: { id: "driver-1" }, params: { id: "da1" }, body: { accept: true } } as unknown as Request;
    const res = mockRes();

    await respondToAssignmentHandler(req, res);

    expect(respondToAssignment).toHaveBeenCalledWith("driver-1", "da1", true);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("listDriverCandidatesHandler", () => {
  it("scopes the driver list to the caller's own restaurant", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(listDriverCandidates).mockResolvedValue([
      { id: "u1", name: "Alice", email: "alice@example.com", activeAssignmentCount: 0 },
    ] as never);

    const req = { user: { id: "owner-1" } } as unknown as Request;
    const res = mockRes();

    await listDriverCandidatesHandler(req, res);

    expect(listDriverCandidates).toHaveBeenCalledWith("r1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      drivers: [{ id: "u1", name: "Alice", email: "alice@example.com", activeAssignmentCount: 0 }],
    });
  });

  it("returns 404 when the caller has no restaurant", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue(null);

    const req = { user: { id: "orphan-1" } } as unknown as Request;
    const res = mockRes();

    await listDriverCandidatesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(listDriverCandidates).not.toHaveBeenCalled();
  });
});

describe("assignDriverHandler", () => {
  it("maps DriverAlreadyBusyError to 409", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(assignDriver).mockRejectedValue(new DriverAlreadyBusyError());

    const req = { user: { id: "owner-1" }, params: { id: "f1" }, body: { driverId: "11111111-1111-4111-8111-111111111111" } } as unknown as Request;
    const res = mockRes();

    await assignDriverHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("maps DriverNotOnStaffError to 400", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(assignDriver).mockRejectedValue(new DriverNotOnStaffError());

    const req = { user: { id: "owner-1" }, params: { id: "f1" }, body: { driverId: "11111111-1111-4111-8111-111111111111" } } as unknown as Request;
    const res = mockRes();

    await assignDriverHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("succeeds for a valid, non-busy driver", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(assignDriver).mockResolvedValue({ id: "da1", status: "OFFERED" } as never);

    const req = { user: { id: "owner-1" }, params: { id: "f1" }, body: { driverId: "11111111-1111-4111-8111-111111111111" } } as unknown as Request;
    const res = mockRes();

    await assignDriverHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
