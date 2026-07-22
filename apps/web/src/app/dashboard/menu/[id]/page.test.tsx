import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "item-1" }),
  useRouter: () => ({ push: mockPush }),
}));

const mockListCategories = vi.fn();
const mockListGroups = vi.fn();
const mockUpdateItem = vi.fn();
const mockDeleteItem = vi.fn();
vi.mock("@/lib/api", () => ({
  listMenuCategories: (...a: unknown[]) => mockListCategories(...a),
  listModifierGroups: (...a: unknown[]) => mockListGroups(...a),
  updateItem: (...a: unknown[]) => mockUpdateItem(...a),
  deleteItem: (...a: unknown[]) => mockDeleteItem(...a),
  uploadMenuItemImage: vi.fn(),
}));
// Stub the variants/modifiers sub-editor so it makes no network calls in tests.
vi.mock("../item-detail-editor", () => ({ ItemDetailEditor: () => null }));

import ProductEditorPage from "./page";

const item = {
  id: "item-1", categoryId: "cat-1", name: "Classic Cheeseburger",
  description: "tasty", priceCents: 999, isAvailable: true, sortOrder: 0, imageKey: null, imageUrl: null,
};
const category = { id: "cat-1", name: "Burgers", sortOrder: 0, imageKey: null, imageUrl: null, items: [item] };

beforeEach(() => {
  vi.clearAllMocks();
  mockListCategories.mockResolvedValue({ categories: [category] });
  mockListGroups.mockResolvedValue({ modifierGroups: [] });
  mockUpdateItem.mockResolvedValue({ item: { ...item, name: "Deluxe Burger" } });
  mockDeleteItem.mockResolvedValue(undefined);
});

describe("ProductEditorPage — critical CRUD", () => {
  it("loads the item and saves edits via updateItem", async () => {
    render(<ProductEditorPage />);
    const nameInput = await screen.findByDisplayValue("Classic Cheeseburger");
    fireEvent.change(nameInput, { target: { value: "Deluxe Burger" } });
    fireEvent.submit(nameInput.closest("form")!);

    await waitFor(() =>
      expect(mockUpdateItem).toHaveBeenCalledWith("item-1", expect.objectContaining({
        name: "Deluxe Burger", priceCents: 999, categoryId: "cat-1", isAvailable: true,
      })),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard/menu"));
  });

  it("deletes the item via deleteItem when confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProductEditorPage />);
    await screen.findByDisplayValue("Classic Cheeseburger");
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(mockDeleteItem).toHaveBeenCalledWith("item-1"));
  });
});
