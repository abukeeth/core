import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../restaurants/restaurant.service", () => ({ getOwnRestaurantId: vi.fn() }));
vi.mock("../sites/site.service", () => ({ revalidatePublishedSite: vi.fn() }));
vi.mock("../sites/renderer/asset-url", () => ({ assetUrl: vi.fn((key: string) => `/assets/${key}`) }));
vi.mock("./menu.service", () => ({
  createCategory: vi.fn(),
  createItem: vi.fn(),
  deleteCategory: vi.fn(),
  deleteItem: vi.fn(),
  listCategories: vi.fn(),
  updateCategory: vi.fn(),
  updateItem: vi.fn(),
  uploadCategoryImage: vi.fn(),
  uploadItemImage: vi.fn(),
}));

import { getOwnRestaurantId } from "../restaurants/restaurant.service";
import { revalidatePublishedSite } from "../sites/site.service";
import {
  createCategoryHandler,
  deleteItemHandler,
  updateItemHandler,
  uploadCategoryImageHandler,
  uploadItemImageHandler,
} from "./menu.controller";
import { createCategory, deleteItem, updateItem, uploadCategoryImage, uploadItemImage } from "./menu.service";
import { CategoryNotFoundError, ItemNotFoundError } from "./menu.errors";

const mockGetOwnRestaurantId = vi.mocked(getOwnRestaurantId);
const mockRevalidate = vi.mocked(revalidatePublishedSite);
const mockCreateCategory = vi.mocked(createCategory);
const mockUpdateItem = vi.mocked(updateItem);
const mockDeleteItem = vi.mocked(deleteItem);
const mockUploadCategoryImage = vi.mocked(uploadCategoryImage);
const mockUploadItemImage = vi.mocked(uploadItemImage);

type MockResponse = { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };

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

describe("§Website Builder — menu image upload handlers", () => {
  it("resolves a category's imageKey to a real imageUrl in the response", async () => {
    mockCreateCategory.mockResolvedValue({ id: "c1", imageKey: null } as never);
    const req = { user: { id: "user-1" }, body: { name: "Mains" } } as never;
    const res = mockRes() as unknown as MockResponse;

    await createCategoryHandler(req, res as never);

    expect(res.json).toHaveBeenCalledWith({ category: { id: "c1", imageKey: null, imageUrl: null } });
  });

  it("uploads a category image and returns the resolved imageUrl", async () => {
    mockUploadCategoryImage.mockResolvedValue({ id: "c1", imageKey: "/uploads/cat.png" } as never);
    const req = {
      user: { id: "user-1" },
      params: { id: "c1" },
      file: { buffer: Buffer.from("x"), originalname: "photo.png" },
    } as never;
    const res = mockRes() as unknown as MockResponse;

    await uploadCategoryImageHandler(req, res as never);

    expect(mockUploadCategoryImage).toHaveBeenCalledWith("restaurant-1", "c1", { buffer: Buffer.from("x"), originalName: "photo.png" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ category: { id: "c1", imageKey: "/uploads/cat.png", imageUrl: "/assets//uploads/cat.png" } });
    expect(mockRevalidate).toHaveBeenCalledWith("restaurant-1");
  });

  it("rejects a category image upload with no file", async () => {
    const req = { user: { id: "user-1" }, params: { id: "c1" } } as never;
    const res = mockRes() as unknown as MockResponse;

    await uploadCategoryImageHandler(req, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUploadCategoryImage).not.toHaveBeenCalled();
  });

  it("404s a category image upload for a category the caller doesn't own", async () => {
    mockUploadCategoryImage.mockRejectedValue(new CategoryNotFoundError());
    const req = {
      user: { id: "user-1" },
      params: { id: "c1" },
      file: { buffer: Buffer.from("x"), originalname: "photo.png" },
    } as never;
    const res = mockRes() as unknown as MockResponse;

    await uploadCategoryImageHandler(req, res as never);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("uploads an item image and returns the resolved imageUrl", async () => {
    mockUploadItemImage.mockResolvedValue({ id: "i1", imageKey: "/uploads/item.png" } as never);
    const req = {
      user: { id: "user-1" },
      params: { id: "i1" },
      file: { buffer: Buffer.from("x"), originalname: "photo.png" },
    } as never;
    const res = mockRes() as unknown as MockResponse;

    await uploadItemImageHandler(req, res as never);

    expect(mockUploadItemImage).toHaveBeenCalledWith("restaurant-1", "i1", { buffer: Buffer.from("x"), originalName: "photo.png" });
    expect(res.json).toHaveBeenCalledWith({ item: { id: "i1", imageKey: "/uploads/item.png", imageUrl: "/assets//uploads/item.png" } });
  });

  it("404s an item image upload for an item the caller doesn't own", async () => {
    mockUploadItemImage.mockRejectedValue(new ItemNotFoundError());
    const req = {
      user: { id: "user-1" },
      params: { id: "i1" },
      file: { buffer: Buffer.from("x"), originalname: "photo.png" },
    } as never;
    const res = mockRes() as unknown as MockResponse;

    await uploadItemImageHandler(req, res as never);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
