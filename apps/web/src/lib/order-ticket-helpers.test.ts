import { describe, expect, it } from "vitest";
import { orderCustomerRef, orderLineModifiers, paymentMethodLabel, type OwnerOrder } from "./owner-commerce-api";
import { cartItemLabel, type CartItem } from "./commerce-api";

function order(overrides: Partial<OwnerOrder> = {}): OwnerOrder {
  return {
    id: "o1", orderNumber: 1, status: "CONFIRMED", paymentStatus: "UNPAID", fulfillmentType: "PICKUP",
    source: "WEBSITE", subtotalCents: 0, taxCents: 0, tipCents: 0, deliveryFeeCents: 0, serviceFeeCents: 0,
    discountCents: 0, totalCents: 0, placedAt: "", tableId: null, notes: null, items: [],
    customer: null, guestCustomer: null, payment: null, ...overrides,
  };
}

describe("paymentMethodLabel — derived from real state, never fabricated", () => {
  it("no payment row + unpaid → Cash · Unpaid", () => {
    expect(paymentMethodLabel(order({ payment: null, paymentStatus: "UNPAID" }))).toBe("Cash · Unpaid");
  });
  it("a payment row + paid → Card · Paid", () => {
    expect(paymentMethodLabel(order({ payment: { id: "p", status: "CAPTURED" }, paymentStatus: "PAID" }))).toBe("Card · Paid");
  });
  it("cash marked paid → Cash · Paid", () => {
    expect(paymentMethodLabel(order({ payment: null, paymentStatus: "PAID" }))).toBe("Cash · Paid");
  });
});

describe("orderCustomerRef — registered wins, else guest, else null", () => {
  it("prefers the registered customer", () => {
    expect(orderCustomerRef(order({ customer: { name: "Reg", phone: "1" }, guestCustomer: { name: "Guest", phone: "2" } }))?.name).toBe("Reg");
  });
  it("falls back to the guest", () => {
    expect(orderCustomerRef(order({ customer: null, guestCustomer: { name: "Guest", phone: "2" } }))?.name).toBe("Guest");
  });
  it("null when neither is present", () => {
    expect(orderCustomerRef(order())).toBeNull();
  });
});

describe("orderLineModifiers — variant + selected options, labels only", () => {
  it("lists the variant then each option", () => {
    const line = { id: "i", nameSnapshot: "Latte", variantNameSnapshot: "Large", quantity: 1, unitPriceCents: 500,
      modifiersSnapshot: { modifiers: [{ groupName: "Milk", optionName: "Oat" }, { groupName: "Shot", optionName: "Extra shot" }] } };
    expect(orderLineModifiers(line)).toEqual(["Large", "Oat", "Extra shot"]);
  });
  it("empty when there are no variant or modifiers", () => {
    expect(orderLineModifiers({ id: "i", nameSnapshot: "Bagel", variantNameSnapshot: null, quantity: 1, unitPriceCents: 300, modifiersSnapshot: null })).toEqual([]);
  });
});

describe("cartItemLabel — the customer can always tell what they added", () => {
  function item(snap: CartItem["modifiersSnapshot"]): CartItem {
    return { id: "c", cartId: "cart", menuItemId: "m", variantId: null, quantity: 1, unitPriceCents: 500, modifiersSnapshot: snap, notes: null };
  }
  it("name + variant", () => {
    expect(cartItemLabel(item({ name: "Latte", variantName: "Large", modifiers: [] }))).toBe("Latte — Large");
  });
  it("name only", () => {
    expect(cartItemLabel(item({ name: "Bagel", modifiers: [] }))).toBe("Bagel");
  });
  it("falls back to variant, then 'Item', for pre-existing carts without a stored name", () => {
    expect(cartItemLabel(item({ variantName: "Large", modifiers: [] }))).toBe("Large");
    expect(cartItemLabel(item(null))).toBe("Item");
  });
});
