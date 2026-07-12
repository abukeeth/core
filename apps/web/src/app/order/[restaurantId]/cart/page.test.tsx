import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ restaurantId: "r1" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock("@/lib/cart-storage", () => ({
  getStoredCartId: vi.fn(() => "cart-1"),
}));

const mockGetCart = vi.fn();
const mockSetCartFulfillment = vi.fn();
const mockCustomerMe = vi.fn();
const mockListAddresses = vi.fn();
const mockCreateAddress = vi.fn();
vi.mock("@/lib/commerce-api", () => ({
  getCart: (...args: unknown[]) => mockGetCart(...args),
  setCartFulfillment: (...args: unknown[]) => mockSetCartFulfillment(...args),
  customerMe: (...args: unknown[]) => mockCustomerMe(...args),
  listAddresses: (...args: unknown[]) => mockListAddresses(...args),
  createAddress: (...args: unknown[]) => mockCreateAddress(...args),
  removeCartItem: vi.fn(),
  updateCartItemQuantity: vi.fn(),
  applyCoupon: vi.fn(),
  removeCoupon: vi.fn(),
  getLoyaltyBalance: vi.fn().mockResolvedValue({ program: null, pointsBalance: 0 }),
  applyLoyaltyRedemption: vi.fn(),
  removeLoyaltyRedemption: vi.fn(),
}));

import CartPage from "./page";

function baseCart(overrides: Record<string, unknown> = {}) {
  return {
    id: "cart-1",
    restaurantId: "r1",
    fulfillmentType: "PICKUP",
    deliveryAddressId: null,
    couponCode: null,
    items: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCart.mockResolvedValue({ cart: baseCart(), subtotalCents: 0 });
  mockSetCartFulfillment.mockResolvedValue({ cart: baseCart({ fulfillmentType: "DELIVERY" }) });
});

describe("CartPage — delivery address picker (Sprint 08.1)", () => {
  it("prompts a guest (not logged in) to log in instead of showing an address list", async () => {
    mockCustomerMe.mockRejectedValue(new Error("unauthenticated"));
    mockGetCart.mockResolvedValue({ cart: baseCart({ fulfillmentType: "DELIVERY" }), subtotalCents: 0 });

    render(<CartPage />);
    await screen.findByText(/Log in/);

    expect(screen.getByText(/to deliver to a saved address/)).toBeInTheDocument();
    expect(mockListAddresses).not.toHaveBeenCalled();
  });

  it("lets a logged-in customer pick a saved address, sending deliveryAddressId to setCartFulfillment", async () => {
    mockCustomerMe.mockResolvedValue({ customer: { id: "c1", email: "a@b.com", name: "A", phone: null } });
    mockListAddresses.mockResolvedValue({
      addresses: [
        { id: "addr-1", customerId: "c1", label: null, line1: "1 Main St", line2: null, city: "Springfield", state: "IL", postalCode: "62701", country: "US", lat: null, lng: null, isDefault: true },
      ],
    });
    mockGetCart.mockResolvedValue({ cart: baseCart({ fulfillmentType: "DELIVERY" }), subtotalCents: 0 });

    render(<CartPage />);
    const addressButton = await screen.findByText(/1 Main St/);
    fireEvent.click(addressButton);

    await waitFor(() =>
      expect(mockSetCartFulfillment).toHaveBeenCalledWith("cart-1", {
        fulfillmentType: "DELIVERY",
        deliveryAddressId: "addr-1",
      }),
    );
  });

  it("creates a new address and immediately selects it as the cart's delivery address", async () => {
    mockCustomerMe.mockResolvedValue({ customer: { id: "c1", email: "a@b.com", name: "A", phone: null } });
    mockListAddresses.mockResolvedValue({ addresses: [] });
    mockCreateAddress.mockResolvedValue({
      address: { id: "addr-new", customerId: "c1", label: null, line1: "2 Oak Ave", line2: null, city: "Springfield", state: "IL", postalCode: "62702", country: "US", lat: null, lng: null, isDefault: false },
    });
    mockGetCart.mockResolvedValue({ cart: baseCart({ fulfillmentType: "DELIVERY" }), subtotalCents: 0 });

    render(<CartPage />);
    fireEvent.click(await screen.findByText(/Add a new address/));

    fireEvent.change(screen.getByPlaceholderText("Street address"), { target: { value: "2 Oak Ave" } });
    fireEvent.change(screen.getByPlaceholderText("City"), { target: { value: "Springfield" } });
    fireEvent.change(screen.getByPlaceholderText("State"), { target: { value: "IL" } });
    fireEvent.change(screen.getByPlaceholderText("ZIP"), { target: { value: "62702" } });
    fireEvent.click(screen.getByText("Save address"));

    await waitFor(() => expect(mockCreateAddress).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockSetCartFulfillment).toHaveBeenCalledWith("cart-1", {
        fulfillmentType: "DELIVERY",
        deliveryAddressId: "addr-new",
      }),
    );
  });

  it("does not show the address picker at all for pickup", async () => {
    mockCustomerMe.mockResolvedValue({ customer: { id: "c1", email: "a@b.com", name: "A", phone: null } });
    mockListAddresses.mockResolvedValue({ addresses: [] });
    mockGetCart.mockResolvedValue({ cart: baseCart({ fulfillmentType: "PICKUP" }), subtotalCents: 0 });

    render(<CartPage />);
    await screen.findByText("Fulfillment");

    expect(screen.queryByText(/Deliver to/)).not.toBeInTheDocument();
  });
});
