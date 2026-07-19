import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../sites/site.service", () => ({ revalidatePublishedSite: vi.fn() }));
vi.mock("../admin/audit-log.service", () => ({ recordAuditLog: vi.fn() }));
vi.mock("./restaurant.service", () => ({
  createRestaurant: vi.fn(),
  getOwnRestaurant: vi.fn(),
  getRestaurantByBusinessId: vi.fn(),
  listAllRestaurants: vi.fn(),
  updateOwnRestaurant: vi.fn(),
  suspendRestaurant: vi.fn(),
  unsuspendRestaurant: vi.fn(),
}));

import { recordAuditLog } from "../admin/audit-log.service";
import { revalidatePublishedSite } from "../sites/site.service";
import { getMine, suspend, unsuspend, updateMine } from "./restaurant.controller";
import { NoRestaurantError, RestaurantNotFoundError } from "./restaurant.errors";
import {
  getOwnRestaurant,
  getRestaurantByBusinessId,
  suspendRestaurant,
  unsuspendRestaurant,
  updateOwnRestaurant,
} from "./restaurant.service";

const mockRevalidate = vi.mocked(revalidatePublishedSite);
const mockUpdateOwnRestaurant = vi.mocked(updateOwnRestaurant);
const mockSuspendRestaurant = vi.mocked(suspendRestaurant);
const mockUnsuspendRestaurant = vi.mocked(unsuspendRestaurant);
const mockRecordAuditLog = vi.mocked(recordAuditLog);
const mockGetOwnRestaurant = vi.mocked(getOwnRestaurant);
const mockGetRestaurantByBusinessId = vi.mocked(getRestaurantByBusinessId);

function mockRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRevalidate.mockResolvedValue(undefined);
});

describe("restaurant.controller revalidation hook (§19.4 profile changes)", () => {
  it("triggers revalidation for the updated restaurant after a profile change", async () => {
    mockUpdateOwnRestaurant.mockResolvedValue({ id: "restaurant-1", name: "New Name" } as never);
    const req = { user: { id: "user-1" }, body: { name: "New Name" } } as never;

    await updateMine(req, mockRes());

    expect(mockRevalidate).toHaveBeenCalledWith("restaurant-1");
  });

  it("swallows a revalidation failure rather than failing the request", async () => {
    mockUpdateOwnRestaurant.mockResolvedValue({ id: "restaurant-1", name: "New Name" } as never);
    mockRevalidate.mockRejectedValue(new Error("render failed"));
    const req = { user: { id: "user-1" }, body: { name: "New Name" } } as never;

    await expect(updateMine(req, mockRes())).resolves.toBeUndefined();
  });
});

describe("restaurant.controller admin suspend/unsuspend (Sprint 16)", () => {
  it("suspends a restaurant and records an audit log entry", async () => {
    mockSuspendRestaurant.mockResolvedValue({ id: "restaurant-1", isSuspended: true } as never);
    const req = { user: { id: "admin-1" }, params: { id: "restaurant-1" }, body: { reason: "ToS violation" } } as never;
    const res = mockRes();

    await suspend(req, res);

    expect(mockSuspendRestaurant).toHaveBeenCalledWith("restaurant-1", "ToS violation");
    expect(mockRecordAuditLog).toHaveBeenCalledWith("admin-1", "RESTAURANT_SUSPENDED", "Restaurant", "restaurant-1", {
      reason: "ToS violation",
    });
    expect((res as { status: (n: number) => unknown }).status).toHaveBeenCalledWith(200);
  });

  it("returns 404 when suspending a restaurant that doesn't exist", async () => {
    mockSuspendRestaurant.mockRejectedValue(new RestaurantNotFoundError());
    const req = { user: { id: "admin-1" }, params: { id: "missing" }, body: {} } as never;
    const res = mockRes();

    await suspend(req, res);

    expect((res as { status: (n: number) => unknown }).status).toHaveBeenCalledWith(404);
    expect(mockRecordAuditLog).not.toHaveBeenCalled();
  });

  it("unsuspends a restaurant and records an audit log entry", async () => {
    mockUnsuspendRestaurant.mockResolvedValue({ id: "restaurant-1", isSuspended: false } as never);
    const req = { user: { id: "admin-1" }, params: { id: "restaurant-1" } } as never;
    const res = mockRes();

    await unsuspend(req, res);

    expect(mockUnsuspendRestaurant).toHaveBeenCalledWith("restaurant-1");
    expect(mockRecordAuditLog).toHaveBeenCalledWith("admin-1", "RESTAURANT_UNSUSPENDED", "Restaurant", "restaurant-1");
  });
});

describe("getMine — first Tenant Context consumer (P0.3), flag parity", () => {
  const record = { id: "restaurant-1", name: "Joe's Deli" };

  function tenant(businessId: string | null) {
    return {
      businessId,
      role: "RESTAURANT_OWNER",
      organizationId: null,
      locationId: null,
      memberships: [],
      capabilities: {},
      resolvedFrom: "legacy-user-restaurant",
    };
  }

  it("flag OFF (no req.tenant): resolves via the legacy getOwnRestaurant path", async () => {
    mockGetOwnRestaurant.mockResolvedValue(record as never);
    const req = { user: { id: "user-1" } } as never;
    const res = mockRes();

    await getMine(req, res);

    expect(mockGetOwnRestaurant).toHaveBeenCalledWith("user-1");
    expect(mockGetRestaurantByBusinessId).not.toHaveBeenCalled();
    expect((res as { status: (n: number) => unknown }).status).toHaveBeenCalledWith(200);
    expect((res as { json: (b: unknown) => unknown }).json).toHaveBeenCalledWith({ restaurant: record });
  });

  it("flag ON (req.tenant present): resolves via req.tenant.businessId", async () => {
    mockGetRestaurantByBusinessId.mockResolvedValue(record as never);
    const req = { user: { id: "user-1" }, tenant: tenant("restaurant-1") } as never;
    const res = mockRes();

    await getMine(req, res);

    expect(mockGetRestaurantByBusinessId).toHaveBeenCalledWith("restaurant-1");
    expect(mockGetOwnRestaurant).not.toHaveBeenCalled();
    expect((res as { status: (n: number) => unknown }).status).toHaveBeenCalledWith(200);
    expect((res as { json: (b: unknown) => unknown }).json).toHaveBeenCalledWith({ restaurant: record });
  });

  it("parity: flag-off and flag-on return an identical response for the same user/business", async () => {
    // Flag OFF
    mockGetOwnRestaurant.mockResolvedValue(record as never);
    const offReq = { user: { id: "user-1" } } as never;
    const offRes = mockRes();
    await getMine(offReq, offRes);
    const offBody = (offRes as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0][0];

    // Flag ON — same underlying record (businessId === getOwnRestaurantId result)
    mockGetRestaurantByBusinessId.mockResolvedValue(record as never);
    const onReq = { user: { id: "user-1" }, tenant: tenant("restaurant-1") } as never;
    const onRes = mockRes();
    await getMine(onReq, onRes);
    const onBody = (onRes as { json: ReturnType<typeof vi.fn> }).json.mock.calls[0][0];

    expect(onBody).toEqual(offBody);
  });

  it("returns 404 in BOTH flag states when the user has no restaurant", async () => {
    // Flag OFF: legacy path throws NoRestaurantError
    mockGetOwnRestaurant.mockRejectedValue(new NoRestaurantError());
    const offRes = mockRes();
    await getMine({ user: { id: "user-1" } } as never, offRes);
    expect((offRes as { status: (n: number) => unknown }).status).toHaveBeenCalledWith(404);

    // Flag ON: tenant path (businessId null → NoRestaurantError)
    mockGetRestaurantByBusinessId.mockRejectedValue(new NoRestaurantError());
    const onRes = mockRes();
    await getMine({ user: { id: "user-1" }, tenant: tenant(null) } as never, onRes);
    expect((onRes as { status: (n: number) => unknown }).status).toHaveBeenCalledWith(404);
  });
});
