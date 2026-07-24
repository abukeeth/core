import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRestaurant = vi.fn();
const mockUpdateRestaurant = vi.fn();

vi.mock("@/lib/api", () => ({
  getRestaurant: (...a: unknown[]) => mockGetRestaurant(...a),
  updateRestaurant: (...a: unknown[]) => mockUpdateRestaurant(...a),
}));

import { ConfirmDetailsScreen } from "./confirm-details-screen";

function store(overrides: Record<string, unknown> = {}) {
  return { restaurant: { id: "r1", name: "My Business", address: null, businessType: "PIZZA", ...overrides } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateRestaurant.mockResolvedValue({ restaurant: {} });
});

describe("ConfirmDetailsScreen", () => {
  it("treats the 'My Business' placeholder as empty so the owner must name it", async () => {
    mockGetRestaurant.mockResolvedValue(store({ name: "My Business" }));
    render(<ConfirmDetailsScreen onConfirmed={vi.fn()} />);
    const nameInput = (await screen.findByPlaceholderText(/Marlowe/)) as HTMLInputElement;
    expect(nameInput.value).toBe("");
  });

  it("prefills a real (e.g. AI-extracted) name and address", async () => {
    mockGetRestaurant.mockResolvedValue(store({ name: "Bella Pizzeria", address: "12 Market St" }));
    render(<ConfirmDetailsScreen onConfirmed={vi.fn()} />);
    expect(((await screen.findByPlaceholderText(/Marlowe/)) as HTMLInputElement).value).toBe("Bella Pizzeria");
    expect((screen.getByPlaceholderText("Street, city, state") as HTMLInputElement).value).toBe("12 Market St");
  });

  it("saves the confirmed name + address and hands off", async () => {
    mockGetRestaurant.mockResolvedValue(store());
    const onConfirmed = vi.fn();
    render(<ConfirmDetailsScreen onConfirmed={onConfirmed} />);
    const nameInput = await screen.findByPlaceholderText(/Marlowe/);

    fireEvent.change(nameInput, { target: { value: "Forno Rossi" } });
    fireEvent.change(screen.getByPlaceholderText("Street, city, state"), { target: { value: "210 Grand Ave" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & build my storefront" }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(mockUpdateRestaurant).toHaveBeenCalledWith({ name: "Forno Rossi", address: "210 Grand Ave" });
  });

  it("blocks an empty business name (never hands off without one)", async () => {
    mockGetRestaurant.mockResolvedValue(store({ name: "My Business" }));
    const onConfirmed = vi.fn();
    render(<ConfirmDetailsScreen onConfirmed={onConfirmed} />);
    await screen.findByPlaceholderText(/Marlowe/);

    expect(screen.getByRole("button", { name: "Confirm & build my storefront" })).toBeDisabled();
    expect(mockUpdateRestaurant).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
