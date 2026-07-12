import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    menuCategory: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    menuItem: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../lib/prisma";
import { CategoryNotFoundError, ItemNotFoundError } from "./menu.errors";
import { deleteCategory, deleteItem, updateCategory, updateItem } from "./menu.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant isolation", () => {
  it("rejects updating a category that belongs to a different restaurant", async () => {
    mockPrisma.menuCategory.findUnique.mockResolvedValue({
      id: "cat-1",
      restaurantId: "other-restaurant",
    } as never);

    await expect(updateCategory("my-restaurant", "cat-1", { name: "Hacked" })).rejects.toBeInstanceOf(
      CategoryNotFoundError,
    );
    expect(mockPrisma.menuCategory.update).not.toHaveBeenCalled();
  });

  it("rejects deleting a category that belongs to a different restaurant", async () => {
    mockPrisma.menuCategory.findUnique.mockResolvedValue({
      id: "cat-1",
      restaurantId: "other-restaurant",
    } as never);

    await expect(deleteCategory("my-restaurant", "cat-1")).rejects.toBeInstanceOf(CategoryNotFoundError);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects updating an item that belongs to a different restaurant", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({
      id: "item-1",
      restaurantId: "other-restaurant",
    } as never);

    await expect(updateItem("my-restaurant", "item-1", { name: "Hacked" })).rejects.toBeInstanceOf(
      ItemNotFoundError,
    );
    expect(mockPrisma.menuItem.update).not.toHaveBeenCalled();
  });

  it("rejects deleting an item that belongs to a different restaurant", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({
      id: "item-1",
      restaurantId: "other-restaurant",
    } as never);

    await expect(deleteItem("my-restaurant", "item-1")).rejects.toBeInstanceOf(ItemNotFoundError);
    expect(mockPrisma.menuItem.delete).not.toHaveBeenCalled();
  });

  it("allows updating a category that belongs to the caller's own restaurant", async () => {
    mockPrisma.menuCategory.findUnique.mockResolvedValue({ id: "cat-1", restaurantId: "my-restaurant" } as never);
    mockPrisma.menuCategory.update.mockResolvedValue({ id: "cat-1", name: "Updated" } as never);

    const result = await updateCategory("my-restaurant", "cat-1", { name: "Updated" });

    expect(result).toEqual({ id: "cat-1", name: "Updated" });
    expect(mockPrisma.menuCategory.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: { name: "Updated" },
    });
  });
});
