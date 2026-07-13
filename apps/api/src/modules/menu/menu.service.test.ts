import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    menuCategory: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    menuItem: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../lib/file-storage", () => ({
  fileStorage: { save: vi.fn(), read: vi.fn() },
}));

import { fileStorage } from "../../lib/file-storage";
import { prisma } from "../../lib/prisma";
import { CategoryNotFoundError, ItemNotFoundError } from "./menu.errors";
import { deleteCategory, deleteItem, updateCategory, updateItem, uploadCategoryImage, uploadItemImage } from "./menu.service";

const mockPrisma = vi.mocked(prisma, { deep: true });
const mockFileStorage = vi.mocked(fileStorage, { deep: true });

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

describe("§Website Builder — uploadCategoryImage / uploadItemImage", () => {
  it("rejects uploading an image for a category owned by a different restaurant", async () => {
    mockPrisma.menuCategory.findUnique.mockResolvedValue({ id: "cat-1", restaurantId: "other-restaurant" } as never);

    await expect(
      uploadCategoryImage("my-restaurant", "cat-1", { buffer: Buffer.from("x"), originalName: "photo.png" }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    expect(mockFileStorage.save).not.toHaveBeenCalled();
  });

  it("saves the file through fileStorage and persists its storage key as imageKey", async () => {
    mockPrisma.menuCategory.findUnique.mockResolvedValue({ id: "cat-1", restaurantId: "my-restaurant" } as never);
    mockFileStorage.save.mockResolvedValue({ path: "/uploads/abc123.png" });
    mockPrisma.menuCategory.update.mockResolvedValue({ id: "cat-1", imageKey: "/uploads/abc123.png" } as never);

    const result = await uploadCategoryImage("my-restaurant", "cat-1", { buffer: Buffer.from("x"), originalName: "photo.png" });

    expect(mockFileStorage.save).toHaveBeenCalledWith(Buffer.from("x"), "photo.png");
    expect(mockPrisma.menuCategory.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: { imageKey: "/uploads/abc123.png" },
    });
    expect(result).toEqual({ id: "cat-1", imageKey: "/uploads/abc123.png" });
  });

  it("rejects uploading an image for an item owned by a different restaurant", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item-1", restaurantId: "other-restaurant" } as never);

    await expect(
      uploadItemImage("my-restaurant", "item-1", { buffer: Buffer.from("x"), originalName: "photo.png" }),
    ).rejects.toBeInstanceOf(ItemNotFoundError);
    expect(mockFileStorage.save).not.toHaveBeenCalled();
  });

  it("saves the item's file through fileStorage and persists its storage key as imageKey", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item-1", restaurantId: "my-restaurant" } as never);
    mockFileStorage.save.mockResolvedValue({ path: "/uploads/def456.png" });
    mockPrisma.menuItem.update.mockResolvedValue({ id: "item-1", imageKey: "/uploads/def456.png" } as never);

    const result = await uploadItemImage("my-restaurant", "item-1", { buffer: Buffer.from("x"), originalName: "photo.png" });

    expect(mockPrisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { imageKey: "/uploads/def456.png" },
    });
    expect(result).toEqual({ id: "item-1", imageKey: "/uploads/def456.png" });
  });
});
