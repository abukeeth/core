import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    adminAuditLog: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma";
import { listAuditLog, recordAuditLog } from "./audit-log.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordAuditLog", () => {
  it("creates an entry with the given fields", async () => {
    mockPrisma.adminAuditLog.create.mockResolvedValue({ id: "log-1" } as never);

    await recordAuditLog("admin-1", "RESTAURANT_SUSPENDED", "Restaurant", "rest-1", { reason: "ToS violation" });

    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: "admin-1",
        action: "RESTAURANT_SUSPENDED",
        targetType: "Restaurant",
        targetId: "rest-1",
        metadata: { reason: "ToS violation" },
      },
    });
  });
});

describe("listAuditLog", () => {
  it("flattens the admin relation into an adminName field", async () => {
    mockPrisma.adminAuditLog.findMany.mockResolvedValue([
      {
        id: "log-1",
        action: "RESTAURANT_SUSPENDED",
        targetType: "Restaurant",
        targetId: "rest-1",
        metadata: null,
        createdAt: new Date("2026-01-01"),
        admin: { name: "Alice Admin" },
      },
    ] as never);

    const result = await listAuditLog(50);

    expect(result).toEqual([
      {
        id: "log-1",
        action: "RESTAURANT_SUSPENDED",
        targetType: "Restaurant",
        targetId: "rest-1",
        metadata: null,
        createdAt: new Date("2026-01-01"),
        adminName: "Alice Admin",
      },
    ]);
    expect(mockPrisma.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, include: { admin: { select: { name: true } } } }),
    );
  });
});
