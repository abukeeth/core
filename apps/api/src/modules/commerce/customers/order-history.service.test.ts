import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    order: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { listCustomerOrders } from "./order-history.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listCustomerOrders", () => {
  it("scopes the query to the given customerId, newest first", async () => {
    mockPrisma.order.findMany.mockResolvedValue([]);

    await listCustomerOrders("cust-1");

    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: "cust-1" },
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});
