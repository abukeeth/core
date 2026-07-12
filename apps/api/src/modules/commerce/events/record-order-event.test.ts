import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    orderEvent: { create: vi.fn() },
    outboxEvent: { create: vi.fn() },
  },
}));

vi.mock("./event-bus", () => ({
  commerceEventBus: { emit: vi.fn() },
}));

import { prisma } from "../../../lib/prisma";
import { commerceEventBus } from "./event-bus";
import { emitOrderEvent, recordOrderEvent, writeOrderEvent } from "./record-order-event";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("writeOrderEvent (Sprint 07.7 H-11)", () => {
  it("writes both the OrderEvent and OutboxEvent rows against the same tx client", async () => {
    const tx = { orderEvent: { create: vi.fn() }, outboxEvent: { create: vi.fn() } } as never;

    await writeOrderEvent({ orderId: "o1", restaurantId: "r1", type: "ORDER_CREATED" }, tx);

    expect((tx as { orderEvent: { create: ReturnType<typeof vi.fn> } }).orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orderId: "o1", type: "ORDER_CREATED" }) }),
    );
    expect((tx as { outboxEvent: { create: ReturnType<typeof vi.fn> } }).outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orderId: "o1", restaurantId: "r1", type: "ORDER_CREATED" }) }),
    );
  });

  it("defaults to the shared prisma client when no tx is passed", async () => {
    await writeOrderEvent({ orderId: "o1", restaurantId: "r1", type: "ORDER_CONFIRMED" });

    expect(mockPrisma.orderEvent.create).toHaveBeenCalled();
    expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
  });
});

describe("emitOrderEvent / recordOrderEvent", () => {
  it("emitOrderEvent emits on the in-process bus", () => {
    emitOrderEvent({ orderId: "o1", restaurantId: "r1", type: "ORDER_READY" });
    expect(commerceEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "o1", restaurantId: "r1", type: "ORDER_READY" }),
    );
  });

  it("recordOrderEvent writes then emits", async () => {
    await recordOrderEvent({ orderId: "o1", restaurantId: "r1", type: "ORDER_COMPLETED" });

    expect(mockPrisma.orderEvent.create).toHaveBeenCalled();
    expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
    expect(commerceEventBus.emit).toHaveBeenCalled();
  });
});
