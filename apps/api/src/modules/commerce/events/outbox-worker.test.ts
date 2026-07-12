import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTx = {
  $queryRaw: vi.fn(),
  outboxEvent: { update: vi.fn() },
};

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(mockTx)),
  },
}));

vi.mock("./event-bus", () => ({
  commerceEventBus: { emit: vi.fn() },
}));

import { prisma } from "../../../lib/prisma";
import { commerceEventBus } from "./event-bus";
import { processOutboxBatch } from "./outbox-worker";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "outbox-1",
    type: "ORDER_CREATED",
    restaurantId: "r1",
    orderId: "o1",
    payload: null,
    createdAt: new Date(),
    processedAt: null,
    ...overrides,
  } as never;
}

describe("processOutboxBatch (Sprint 07.7 H-11, Production Hardening Phase 6)", () => {
  it("dispatches unprocessed rows to commerceEventBus.emit and marks them processedAt", async () => {
    mockTx.$queryRaw.mockResolvedValue([row()]);

    const result = await processOutboxBatch();

    expect(commerceEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ORDER_CREATED", restaurantId: "r1", orderId: "o1" }),
    );
    expect(mockTx.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "outbox-1" }, data: expect.objectContaining({ processedAt: expect.any(Date) }) }),
    );
    expect(result.processedCount).toBe(1);
  });

  it("claims rows via a FOR UPDATE SKIP LOCKED raw query inside a transaction (Phase 6)", async () => {
    mockTx.$queryRaw.mockResolvedValue([]);

    await processOutboxBatch();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    const [sqlParts] = mockTx.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    const sql = sqlParts.join("");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain('"processedAt" IS NULL');
    expect(sql).toContain('ORDER BY "createdAt" ASC');
  });

  it("processes multiple rows in the order returned by the query", async () => {
    mockTx.$queryRaw.mockResolvedValue([row({ id: "outbox-1" }), row({ id: "outbox-2" })]);

    await processOutboxBatch();

    expect(mockTx.outboxEvent.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: "outbox-1" } }));
    expect(mockTx.outboxEvent.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { id: "outbox-2" } }));
  });

  it("leaves a row unprocessed for retry when dispatch throws, rather than marking it processed", async () => {
    mockTx.$queryRaw.mockResolvedValue([row()]);
    vi.mocked(commerceEventBus.emit).mockImplementationOnce(() => {
      throw new Error("subscriber exploded");
    });

    const result = await processOutboxBatch();

    expect(mockTx.outboxEvent.update).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });

  it("does not reprocess rows already marked processed (never fetched, since the query excludes them)", async () => {
    mockTx.$queryRaw.mockResolvedValue([]);

    const result = await processOutboxBatch();

    expect(commerceEventBus.emit).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });
});
