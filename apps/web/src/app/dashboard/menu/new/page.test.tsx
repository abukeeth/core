import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockListCategories = vi.fn();
const mockCreateItem = vi.fn();
vi.mock("@/lib/api", () => ({
  listMenuCategories: (...a: unknown[]) => mockListCategories(...a),
  createItem: (...a: unknown[]) => mockCreateItem(...a),
}));

import NewProductPage from "./page";

const category = { id: "cat-1", name: "Burgers", sortOrder: 0, imageKey: null, imageUrl: null, items: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockListCategories.mockResolvedValue({ categories: [category] });
  mockCreateItem.mockResolvedValue({ item: { id: "new-1", categoryId: "cat-1", name: "Fries", description: null, priceCents: 499, isAvailable: true, sortOrder: 0, imageKey: null, imageUrl: null } });
});

describe("NewProductPage — create flow", () => {
  it("creates an item via createItem and continues to its editor", async () => {
    render(<NewProductPage />);
    const nameInput = await screen.findByPlaceholderText("e.g. Classic Cheeseburger");
    fireEvent.change(nameInput, { target: { value: "Fries" } });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "4.99" } });
    fireEvent.submit(nameInput.closest("form")!);

    await waitFor(() =>
      expect(mockCreateItem).toHaveBeenCalledWith(expect.objectContaining({
        categoryId: "cat-1", name: "Fries", priceCents: 499,
      })),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard/menu/new-1"));
  });
});
