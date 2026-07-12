import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    cart: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    cartItem: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    customerAddress: { findFirst: vi.fn() },
    menuItem: { findUnique: vi.fn() },
    menuItemInventory: { findUnique: vi.fn() },
    menuItemVariant: { findUnique: vi.fn() },
  },
}));

vi.mock("../menu-commerce/modifiers.service", () => ({
  listModifierGroupsForItem: vi.fn(),
}));

vi.mock("../qr-ordering/tables.service", () => ({
  resolveTableByToken: vi.fn(),
}));

import { prisma } from "../../../lib/prisma";
import { listModifierGroupsForItem } from "../menu-commerce/modifiers.service";
import { InvalidQrTokenError } from "../qr-ordering/qr-ordering.errors";
import { resolveTableByToken } from "../qr-ordering/tables.service";
import {
  CartItemNotFoundError,
  CartNotFoundError,
  CartRestaurantMismatchError,
  DeliveryAddressNotFoundError,
  InvalidModifierSelectionError,
  ItemNotOrderableError,
} from "./cart.errors";
import {
  addCartItem,
  bindCartToTable,
  cartSubtotalCents,
  getCartWithItems,
  getOrCreateActiveCart,
  setCartFulfillment,
  updateCartItemQuantity,
} from "./cart.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listModifierGroupsForItem).mockResolvedValue([]);
});

describe("getOrCreateActiveCart", () => {
  it("reuses an existing active cart for the same customer", async () => {
    mockPrisma.cart.findFirst.mockResolvedValue({ id: "cart-1" } as never);

    const cart = await getOrCreateActiveCart("r1", { customerId: "c1" });

    expect(cart.id).toBe("cart-1");
    expect(mockPrisma.cart.create).not.toHaveBeenCalled();
  });

  it("creates a new cart when none exists for the guest session", async () => {
    mockPrisma.cart.findFirst.mockResolvedValue(null as never);
    mockPrisma.cart.create.mockResolvedValue({ id: "cart-2" } as never);

    const cart = await getOrCreateActiveCart("r1", { guestSessionId: "guest-abc" });

    expect(cart.id).toBe("cart-2");
    expect(mockPrisma.cart.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ guestSessionId: "guest-abc" }) }),
    );
  });

  // Regression (Sprint 08 beta demo): the frontend's Cart type declares
  // `items` as required and reads `cart.items.length` immediately on the
  // menu page — a response missing it crashed that page on load. Confirms
  // both the found-existing and newly-created paths always request items.
  it("always includes items in both the existing-cart and new-cart queries", async () => {
    mockPrisma.cart.findFirst.mockResolvedValue({ id: "cart-1", items: [] } as never);
    await getOrCreateActiveCart("r1", { customerId: "c1" });
    expect(mockPrisma.cart.findFirst).toHaveBeenCalledWith(expect.objectContaining({ include: { items: true } }));

    mockPrisma.cart.findFirst.mockResolvedValue(null as never);
    mockPrisma.cart.create.mockResolvedValue({ id: "cart-2", items: [] } as never);
    await getOrCreateActiveCart("r1", { guestSessionId: "guest-abc" });
    expect(mockPrisma.cart.create).toHaveBeenCalledWith(expect.objectContaining({ include: { items: true } }));
  });
});

describe("addCartItem", () => {
  it("rejects a cart belonging to a different restaurant", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", restaurantId: "other", items: [] } as never);

    await expect(
      addCartItem("my-restaurant", "cart-1", { menuItemId: "item-1", quantity: 1, modifierOptionIds: [] }),
    ).rejects.toBeInstanceOf(CartRestaurantMismatchError);
  });

  it("rejects an unavailable menu item", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", restaurantId: "r1", items: [] } as never);
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item-1", restaurantId: "r1", isAvailable: false } as never);
    mockPrisma.menuItemInventory.findUnique.mockResolvedValue(null as never);

    await expect(
      addCartItem("r1", "cart-1", { menuItemId: "item-1", quantity: 1, modifierOptionIds: [] }),
    ).rejects.toBeInstanceOf(ItemNotOrderableError);
  });

  it("computes unitPriceCents from base price + variant delta + modifier deltas", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", restaurantId: "r1", items: [] } as never);
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item-1", restaurantId: "r1", isAvailable: true, priceCents: 1000 } as never);
    mockPrisma.menuItemInventory.findUnique.mockResolvedValue(null as never);
    mockPrisma.menuItemVariant.findUnique.mockResolvedValue({ id: "var-1", menuItemId: "item-1", priceDeltaCents: 200, name: "Large" } as never);
    vi.mocked(listModifierGroupsForItem).mockResolvedValue([
      {
        id: "mg-1",
        name: "Extras",
        isRequired: false,
        minSelections: 0,
        maxSelections: null,
        options: [{ id: "opt-1", name: "Cheese", priceDeltaCents: 150, isAvailable: true }],
      },
    ] as never);
    mockPrisma.cartItem.create.mockResolvedValue({ id: "ci-1", unitPriceCents: 1350 } as never);

    await addCartItem("r1", "cart-1", {
      menuItemId: "item-1",
      variantId: "var-1",
      quantity: 1,
      modifierOptionIds: ["opt-1"],
    });

    const call = mockPrisma.cartItem.create.mock.calls[0][0];
    expect(call.data.unitPriceCents).toBe(1350); // 1000 + 200 + 150
  });

  it("rejects when a required modifier group has no selection", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", restaurantId: "r1", items: [] } as never);
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item-1", restaurantId: "r1", isAvailable: true, priceCents: 1000 } as never);
    mockPrisma.menuItemInventory.findUnique.mockResolvedValue(null as never);
    vi.mocked(listModifierGroupsForItem).mockResolvedValue([
      { id: "mg-1", name: "Choose your sauce", isRequired: true, minSelections: 1, maxSelections: 1, options: [{ id: "opt-1", name: "BBQ", priceDeltaCents: 0, isAvailable: true }] },
    ] as never);

    await expect(
      addCartItem("r1", "cart-1", { menuItemId: "item-1", quantity: 1, modifierOptionIds: [] }),
    ).rejects.toBeInstanceOf(InvalidModifierSelectionError);
  });

  it("rejects selecting more options than maxSelections allows", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", restaurantId: "r1", items: [] } as never);
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item-1", restaurantId: "r1", isAvailable: true, priceCents: 1000 } as never);
    mockPrisma.menuItemInventory.findUnique.mockResolvedValue(null as never);
    vi.mocked(listModifierGroupsForItem).mockResolvedValue([
      {
        id: "mg-1",
        name: "Sauce",
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { id: "opt-1", name: "BBQ", priceDeltaCents: 0, isAvailable: true },
          { id: "opt-2", name: "Ranch", priceDeltaCents: 0, isAvailable: true },
        ],
      },
    ] as never);

    await expect(
      addCartItem("r1", "cart-1", { menuItemId: "item-1", quantity: 1, modifierOptionIds: ["opt-1", "opt-2"] }),
    ).rejects.toBeInstanceOf(InvalidModifierSelectionError);
  });
});

describe("updateCartItemQuantity ownership", () => {
  it("rejects an item that does not belong to the given cart", async () => {
    mockPrisma.cartItem.findUnique.mockResolvedValue({ id: "ci-1", cartId: "different-cart" } as never);
    await expect(updateCartItemQuantity("cart-1", "ci-1", 3)).rejects.toBeInstanceOf(CartItemNotFoundError);
  });
});

describe("setCartFulfillment — delivery address ownership", () => {
  it("rejects a deliveryAddressId belonging to a different customer", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", customerId: "c1", items: [] } as never);
    mockPrisma.customerAddress.findFirst.mockResolvedValue(null as never);

    await expect(
      setCartFulfillment("cart-1", { fulfillmentType: "DELIVERY", deliveryAddressId: "addr-owned-by-someone-else" }),
    ).rejects.toBeInstanceOf(DeliveryAddressNotFoundError);
    expect(mockPrisma.customerAddress.findFirst).toHaveBeenCalledWith({
      where: { id: "addr-owned-by-someone-else", customerId: "c1" },
    });
    expect(mockPrisma.cart.update).not.toHaveBeenCalled();
  });

  it("rejects any deliveryAddressId on a guest cart (no customerId)", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", customerId: null, items: [] } as never);

    await expect(
      setCartFulfillment("cart-1", { fulfillmentType: "DELIVERY", deliveryAddressId: "addr-1" }),
    ).rejects.toBeInstanceOf(DeliveryAddressNotFoundError);
    expect(mockPrisma.customerAddress.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.cart.update).not.toHaveBeenCalled();
  });

  it("accepts a deliveryAddressId that genuinely belongs to the cart's own customer", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", customerId: "c1", items: [] } as never);
    mockPrisma.customerAddress.findFirst.mockResolvedValue({ id: "addr-1", customerId: "c1" } as never);
    mockPrisma.cart.update.mockResolvedValue({ id: "cart-1", fulfillmentType: "DELIVERY", deliveryAddressId: "addr-1" } as never);

    await setCartFulfillment("cart-1", { fulfillmentType: "DELIVERY", deliveryAddressId: "addr-1" });

    expect(mockPrisma.cart.update).toHaveBeenCalledWith({
      where: { id: "cart-1" },
      data: { fulfillmentType: "DELIVERY", scheduledFor: undefined, deliveryAddressId: "addr-1" },
    });
  });

  it("skips the ownership check entirely when no deliveryAddressId is given (e.g. switching to pickup)", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", customerId: "c1", items: [] } as never);
    mockPrisma.cart.update.mockResolvedValue({ id: "cart-1", fulfillmentType: "PICKUP" } as never);

    await setCartFulfillment("cart-1", { fulfillmentType: "PICKUP" });

    expect(mockPrisma.customerAddress.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.cart.update).toHaveBeenCalled();
  });
});

describe("cartSubtotalCents", () => {
  it("sums unitPriceCents * quantity across items", () => {
    const items = [
      { unitPriceCents: 1000, quantity: 2 },
      { unitPriceCents: 500, quantity: 1 },
    ] as never;
    expect(cartSubtotalCents(items)).toBe(2500);
  });
});

describe("getCartWithItems", () => {
  it("throws CartNotFoundError for a missing cart", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue(null as never);
    await expect(getCartWithItems("missing")).rejects.toBeInstanceOf(CartNotFoundError);
  });
});

describe("bindCartToTable", () => {
  it("resolves the qrToken server-side and sets tableId + DINE_IN for a same-restaurant table", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", restaurantId: "r1", items: [] } as never);
    vi.mocked(resolveTableByToken).mockResolvedValue({ id: "table-1", restaurantId: "r1" } as never);
    mockPrisma.cart.update.mockResolvedValue({ id: "cart-1", tableId: "table-1", fulfillmentType: "DINE_IN" } as never);

    const result = await bindCartToTable("cart-1", "qr-token-abc");

    expect(resolveTableByToken).toHaveBeenCalledWith("qr-token-abc");
    expect(mockPrisma.cart.update).toHaveBeenCalledWith({
      where: { id: "cart-1" },
      data: { tableId: "table-1", fulfillmentType: "DINE_IN" },
    });
    expect(result.tableId).toBe("table-1");
  });

  it("rejects (CartRestaurantMismatchError) when the token resolves to a different restaurant's table", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", restaurantId: "r1", items: [] } as never);
    vi.mocked(resolveTableByToken).mockResolvedValue({ id: "table-1", restaurantId: "other-restaurant" } as never);

    await expect(bindCartToTable("cart-1", "qr-token-abc")).rejects.toBeInstanceOf(CartRestaurantMismatchError);
    expect(mockPrisma.cart.update).not.toHaveBeenCalled();
  });

  it("propagates InvalidQrTokenError for an invalid/expired token without mutating the cart", async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({ id: "cart-1", restaurantId: "r1", items: [] } as never);
    vi.mocked(resolveTableByToken).mockRejectedValue(new InvalidQrTokenError());

    await expect(bindCartToTable("cart-1", "bad-token")).rejects.toBeInstanceOf(InvalidQrTokenError);
    expect(mockPrisma.cart.update).not.toHaveBeenCalled();
  });
});
