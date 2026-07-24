import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    order: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("../notifications/notifications.service", () => ({
  sendKitchenUnacceptedAlert: vi.fn(),
}));

import { prisma } from "../../../lib/prisma";
import { sendKitchenUnacceptedAlert } from "../notifications/notifications.service";
import { dispatchUnacceptedOrderAlerts } from "./unaccepted-order.service";

const mockPrisma = vi.mocked(prisma, { deep: true });
const mockAlert = vi.mocked(sendKitchenUnacceptedAlert);

function candidate(overrides: Record<string, unknown> = {}) {
  return { id: "o1", orderNumber: 7, restaurantId: "r1", restaurant: { phone: "+15551230000" }, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.KITCHEN_UNACCEPTED_ALERT_MS;
});

describe("dispatchUnacceptedOrderAlerts", () => {
  it("only considers CONFIRMED, past-deadline, not-yet-alerted orders (default 60s deadline)", async () => {
    mockPrisma.order.findMany.mockResolvedValue([] as never);

    await dispatchUnacceptedOrderAlerts(new Date("2026-07-24T00:01:00.000Z"));

    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "CONFIRMED",
          confirmedAt: { lte: new Date("2026-07-24T00:00:00.000Z") },
          unacceptedAlertSentAt: null,
        },
      }),
    );
  });

  it("atomically claims and SMSes the owner for a stale unaccepted order", async () => {
    mockPrisma.order.findMany.mockResolvedValue([candidate()] as never);
    mockPrisma.order.updateMany.mockResolvedValue({ count: 1 } as never);
    mockAlert.mockResolvedValue({ success: true } as never);

    const now = new Date("2026-07-24T00:01:00.000Z");
    const result = await dispatchUnacceptedOrderAlerts(now);

    expect(mockPrisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", status: "CONFIRMED", unacceptedAlertSentAt: null },
      data: { unacceptedAlertSentAt: now },
    });
    expect(mockAlert).toHaveBeenCalledWith("o1", "r1", "+15551230000", 7);
    expect(result.alertedCount).toBe(1);
  });

  it("does not resend when the claim is lost — order accepted or already alerted in the same tick", async () => {
    mockPrisma.order.findMany.mockResolvedValue([candidate()] as never);
    mockPrisma.order.updateMany.mockResolvedValue({ count: 0 } as never);

    const result = await dispatchUnacceptedOrderAlerts();

    expect(mockAlert).not.toHaveBeenCalled();
    expect(result.alertedCount).toBe(0);
  });

  it("claims (so it isn't reprocessed) but sends nothing when the restaurant has no phone", async () => {
    mockPrisma.order.findMany.mockResolvedValue([candidate({ restaurant: { phone: null } })] as never);
    mockPrisma.order.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await dispatchUnacceptedOrderAlerts();

    expect(mockPrisma.order.updateMany).toHaveBeenCalledOnce();
    expect(mockAlert).not.toHaveBeenCalled();
    expect(result.alertedCount).toBe(0);
  });

  it("honours a custom deadline from KITCHEN_UNACCEPTED_ALERT_MS", async () => {
    process.env.KITCHEN_UNACCEPTED_ALERT_MS = "30000";
    mockPrisma.order.findMany.mockResolvedValue([] as never);

    await dispatchUnacceptedOrderAlerts(new Date("2026-07-24T00:01:00.000Z"));

    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ confirmedAt: { lte: new Date("2026-07-24T00:00:30.000Z") } }),
      }),
    );
  });
});
