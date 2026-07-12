import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    table: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { InvalidQrTokenError, TableNotFoundError } from "./qr-ordering.errors";
import { deleteTable, regenerateQrToken, resolveTableByToken, updateTable } from "./tables.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant isolation", () => {
  it("rejects updating a table belonging to another restaurant", async () => {
    mockPrisma.table.findUnique.mockResolvedValue({ id: "t1", restaurantId: "other" } as never);
    await expect(updateTable("my-restaurant", "t1", { label: "Hacked" })).rejects.toBeInstanceOf(
      TableNotFoundError,
    );
  });

  it("rejects deleting a table belonging to another restaurant", async () => {
    mockPrisma.table.findUnique.mockResolvedValue({ id: "t1", restaurantId: "other" } as never);
    await expect(deleteTable("my-restaurant", "t1")).rejects.toBeInstanceOf(TableNotFoundError);
  });
});

describe("regenerateQrToken", () => {
  it("issues a new token distinct from the old one", async () => {
    mockPrisma.table.findUnique.mockResolvedValue({ id: "t1", restaurantId: "r1", qrToken: "old-token" } as never);
    mockPrisma.table.update.mockResolvedValue({ id: "t1", qrToken: "new-token" } as never);

    const result = await regenerateQrToken("r1", "t1");

    const updateCall = mockPrisma.table.update.mock.calls[0][0];
    expect(updateCall.data.qrToken).not.toBe("old-token");
    expect(result.qrToken).toBe("new-token");
  });
});

describe("resolveTableByToken", () => {
  it("rejects a nonexistent token", async () => {
    mockPrisma.table.findUnique.mockResolvedValue(null as never);
    await expect(resolveTableByToken("nope")).rejects.toBeInstanceOf(InvalidQrTokenError);
  });

  it("rejects an inactive table's token with the same error type as a nonexistent one", async () => {
    mockPrisma.table.findUnique.mockResolvedValue({ id: "t1", isActive: false } as never);
    await expect(resolveTableByToken("valid-but-inactive")).rejects.toBeInstanceOf(InvalidQrTokenError);
  });

  it("resolves an active table", async () => {
    mockPrisma.table.findUnique.mockResolvedValue({ id: "t1", isActive: true, label: "Table 5" } as never);
    const table = await resolveTableByToken("valid-token");
    expect(table.label).toBe("Table 5");
  });
});
