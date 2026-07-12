import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../restaurants/restaurant.service", () => ({ getOwnRestaurantId: vi.fn() }));
vi.mock("../sites/site.service", () => ({ revalidatePublishedSite: vi.fn() }));
vi.mock("./menu.service", () => ({
  createCategory: vi.fn(),
  createItem: vi.fn(),
  deleteCategory: vi.fn(),
  deleteItem: vi.fn(),
  listCategories: vi.fn(),
  updateCategory: vi.fn(),
  updateItem: vi.fn(),
}));

import { getOwnRestaurantId } from "../restaurants/restaurant.service";
import { revalidatePublishedSite } from "../sites/site.service";
import { createCategoryHandler, deleteItemHandler, updateItemHandler } from "./menu.controller";
import { createCategory, deleteItem, updateItem } from "./menu.service";

const mockGetOwnRestaurantId = vi.mocked(getOwnRestaurantId);
const mockRevalidate = vi.mocked(revalidatePublishedSite);
const mockCreateCategory = vi.mocked(createCategory);
const mockUpdateItem = vi.mocked(updateItem);
const mockDeleteItem = vi.mocked(deleteItem);

function mockRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.send = vi.fn(() => res);
  return res as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOwnRestaurantId.mockResolvedValue("restaurant-1");
  mockRevalidate.mockResolvedValue(undefined);
});

describe("menu.controller revalidation hook (§19.4)", () => {
  it("triggers revalidation after creating a category", async () => {
    mockCreateCategory.mockResolvedValue({ id: "c1" } as never);
    const req = { user: { id: "user-1" }, body: { name: "Mains" } } as never;

    await createCategoryHandler(req, mockRes());

    expect(mockRevalidate).toHaveBeenCalledWith("restaurant-1");
  });

  it("triggers revalidation after updating an item (price change)", async () => {
    mockUpdateItem.mockResolvedValue({ id: "i1" } as never);
    const req = { user: { id: "user-1" }, params: { id: "i1" }, body: { priceCents: 1800 } } as never;

    await updateItemHandler(req, mockRes());

    expect(mockRevalidate).toHaveBeenCalledWith("restaurant-1");
  });

  it("triggers revalidation after deleting an item", async () => {
    mockDeleteItem.mockResolvedValue(undefined);
    const req = { user: { id: "user-1" }, params: { id: "i1" } } as never;

    await deleteItemHandler(req, mockRes());

    expect(mockRevalidate).toHaveBeenCalledWith("restaurant-1");
  });

  it("swallows a revalidation failure rather than failing the request", async () => {
    mockCreateCategory.mockResolvedValue({ id: "c1" } as never);
    mockRevalidate.mockRejectedValue(new Error("render failed"));
    const req = { user: { id: "user-1" }, body: { name: "Mains" } } as never;
    const res = mockRes();

    await expect(createCategoryHandler(req, res)).resolves.toBeUndefined();
  });
});
