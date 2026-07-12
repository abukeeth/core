import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    notificationLog: { create: vi.fn() },
  },
}));

const mockSend = vi.fn();
vi.mock("./registry", () => ({
  notificationProviderRegistry: {
    get: vi.fn((channel: string) => {
      if (channel === "EMAIL") return { channel: "EMAIL", implemented: true, send: mockSend };
      return { channel, implemented: false, send: mockSend };
    }),
  },
}));

import { prisma } from "../../../lib/prisma";
import {
  sendDriverAssignmentOfferNotification,
  sendNewOrderStaffAlert,
  sendNotification,
  sendOrderConfirmation,
} from "./notifications.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendNotification", () => {
  it("writes SKIPPED_CHANNEL_DISABLED and never calls the adapter for a disabled channel", async () => {
    await sendNotification({ type: "ORDER_CONFIRMATION", channel: "SMS", to: "x", body: "y" });

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED_CHANNEL_DISABLED" }) }),
    );
  });

  it("writes SENT on a successful implemented-channel send", async () => {
    mockSend.mockResolvedValue({ success: true, providerMessageId: "msg-1" });

    await sendNotification({ type: "ORDER_CONFIRMATION", channel: "EMAIL", to: "a@b.com", body: "y" });

    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", providerMessageId: "msg-1" }) }),
    );
  });

  it("writes FAILED (never throws) when the adapter reports failure, but still returns the failure to the caller", async () => {
    mockSend.mockResolvedValue({ success: false, errorMessage: "boom" });

    await expect(
      sendNotification({ type: "ORDER_CONFIRMATION", channel: "EMAIL", to: "a@b.com", body: "y" }),
    ).resolves.toEqual({ success: false, errorMessage: "boom" });

    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", error: "boom" }) }),
    );
  });
});

describe("convenience wrappers", () => {
  it("sendOrderConfirmation calls sendNotification with type ORDER_CONFIRMATION over EMAIL", async () => {
    mockSend.mockResolvedValue({ success: true });
    await sendOrderConfirmation("o1", "r1", "a@b.com", 42, 1999);

    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "ORDER_CONFIRMATION", channel: "EMAIL" }) }),
    );
  });

  it("sendNewOrderStaffAlert calls sendNotification with type NEW_ORDER_STAFF_ALERT", async () => {
    mockSend.mockResolvedValue({ success: true });
    await sendNewOrderStaffAlert("o1", "r1", "staff@b.com", 42);

    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "NEW_ORDER_STAFF_ALERT" }) }),
    );
  });

  it("sendDriverAssignmentOfferNotification calls sendNotification with type DRIVER_ASSIGNMENT_OFFER over SMS", async () => {
    await sendDriverAssignmentOfferNotification("o1", "r1", "+15551234567", 42);

    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "DRIVER_ASSIGNMENT_OFFER", channel: "SMS", status: "SKIPPED_CHANNEL_DISABLED" }),
      }),
    );
  });
});
