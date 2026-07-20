import type { Order, OrderEvent, OrderItem, Payment } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { redactModifiersSnapshot, redactOrderEvent, redactOrderFinancials, redactOrderItem } from "./order-redaction";

const ORDER_MONEY = [
  "subtotalCents",
  "taxCents",
  "tipCents",
  "deliveryFeeCents",
  "serviceFeeCents",
  "discountCents",
  "totalCents",
] as const;

function orderRow(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    restaurantId: "rest-1",
    orderNumber: "A-001",
    status: "PENDING",
    subtotalCents: 1000,
    taxCents: 80,
    tipCents: 200,
    deliveryFeeCents: 300,
    serviceFeeCents: 50,
    discountCents: 100,
    totalCents: 1530,
    createdAt: new Date(),
    ...overrides,
  } as unknown as Order;
}

function itemRow(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "item-1",
    orderId: "order-1",
    menuItemId: "mi-1",
    nameSnapshot: "Burger",
    variantNameSnapshot: null,
    unitPriceCents: 900,
    quantity: 1,
    modifiersSnapshot: null,
    lineTotalCents: 900,
    createdAt: new Date(),
    ...overrides,
  } as unknown as OrderItem;
}

describe("redactOrderFinancials", () => {
  it("drops every order-level money field but keeps the ticket fields", () => {
    const redacted = redactOrderFinancials(orderRow()) as Record<string, unknown>;
    for (const field of ORDER_MONEY) {
      expect(redacted).not.toHaveProperty(field);
    }
    expect(redacted).toMatchObject({ id: "order-1", orderNumber: "A-001", status: "PENDING" });
  });

  it("redacts nested items (unit/line money dropped, name/qty/modifiers kept) when present", () => {
    const order = { ...orderRow(), items: [itemRow()], payment: null } as Order & {
      items: OrderItem[];
      payment: Payment | null;
    };
    const redacted = redactOrderFinancials(order) as unknown as { items: Array<Record<string, unknown>> };
    expect(redacted.items[0]).not.toHaveProperty("unitPriceCents");
    expect(redacted.items[0]).not.toHaveProperty("lineTotalCents");
    expect(redacted.items[0]).toMatchObject({ nameSnapshot: "Burger", quantity: 1 });
  });

  it("drops the payment object entirely when present", () => {
    const withPayment = { ...orderRow(), items: [itemRow()], payment: { id: "pay-1", amountCents: 1530 } } as unknown as Order & {
      items: OrderItem[];
      payment: Payment | null;
    };
    const redacted = redactOrderFinancials(withPayment) as unknown as { payment: null };
    expect(redacted.payment).toBeNull();
  });

  it("leaves list-shape orders (no items/payment keys) without inventing those keys", () => {
    const redacted = redactOrderFinancials(orderRow()) as Record<string, unknown>;
    expect(redacted).not.toHaveProperty("items");
    expect(redacted).not.toHaveProperty("payment");
  });

  it("leaves NO financial token anywhere on a full detail order (order + items + modifiers + payment)", () => {
    const detail = {
      ...orderRow(),
      items: [
        itemRow({
          modifiersSnapshot: {
            variantName: "L",
            modifiers: [{ groupName: "Cheese", optionName: "Cheddar", priceDeltaCents: 150 }],
          } as never,
        }),
      ],
      payment: { id: "pay-1", amountCents: 1530, authorizedAmountCents: 1530, capturedAmountCents: 1530, refundedAmountCents: 0 },
    } as unknown as Order & { items: OrderItem[]; payment: Payment | null };

    const json = JSON.stringify(redactOrderFinancials(detail));
    for (const token of [
      "subtotalCents",
      "taxCents",
      "tipCents",
      "deliveryFeeCents",
      "serviceFeeCents",
      "discountCents",
      "totalCents",
      "unitPriceCents",
      "lineTotalCents",
      "priceDeltaCents",
      "amountCents",
      "Cents",
    ]) {
      expect(json).not.toContain(token);
    }
    // The ticket labels survive.
    expect(json).toContain("Cheddar");
    expect(json).toContain("Burger");
  });
});

describe("redactOrderItem", () => {
  it("drops unit and line money, keeps the rest", () => {
    const redacted = redactOrderItem(itemRow()) as Record<string, unknown>;
    expect(redacted).not.toHaveProperty("unitPriceCents");
    expect(redacted).not.toHaveProperty("lineTotalCents");
    expect(redacted).toMatchObject({ nameSnapshot: "Burger", quantity: 1 });
  });

  it("strips priceDeltaCents from the modifiersSnapshot while keeping labels", () => {
    const item = itemRow({
      modifiersSnapshot: {
        variantName: "Large",
        modifiers: [
          { groupName: "Cheese", optionName: "Cheddar", priceDeltaCents: 150 },
          { groupName: "Sauce", optionName: "BBQ", priceDeltaCents: 0 },
        ],
      } as never,
    });
    const redacted = redactOrderItem(item) as unknown as { modifiersSnapshot: { variantName: string; modifiers: Array<Record<string, unknown>> } };
    expect(JSON.stringify(redacted.modifiersSnapshot)).not.toContain("priceDeltaCents");
    expect(redacted.modifiersSnapshot).toEqual({
      variantName: "Large",
      modifiers: [
        { groupName: "Cheese", optionName: "Cheddar" },
        { groupName: "Sauce", optionName: "BBQ" },
      ],
    });
  });

  it("does not mutate the original item's modifiersSnapshot", () => {
    const original = { variantName: "Large", modifiers: [{ groupName: "Cheese", optionName: "Cheddar", priceDeltaCents: 150 }] };
    const item = itemRow({ modifiersSnapshot: original as never });
    redactOrderItem(item);
    expect((original.modifiers[0] as Record<string, unknown>).priceDeltaCents).toBe(150);
  });
});

describe("redactModifiersSnapshot (null/empty/malformed safety)", () => {
  it("returns null for a null snapshot", () => {
    expect(redactModifiersSnapshot(null)).toBeNull();
  });

  it("returns null for a non-object (malformed) snapshot without throwing", () => {
    expect(redactModifiersSnapshot("oops" as never)).toBeNull();
    expect(redactModifiersSnapshot(42 as never)).toBeNull();
    expect(redactModifiersSnapshot([1, 2, 3] as never)).toBeNull();
  });

  it("tolerates missing/!array modifiers and non-object modifier entries, never leaking money", () => {
    expect(redactModifiersSnapshot({ variantName: "Small" } as never)).toEqual({ variantName: "Small" });
    const weird = redactModifiersSnapshot({ modifiers: [null, "x", { groupName: "G", optionName: "O", priceDeltaCents: 99 }] } as never);
    expect(JSON.stringify(weird)).not.toContain("priceDeltaCents");
    expect(weird).toEqual({ modifiers: [{}, {}, { groupName: "G", optionName: "O" }] });
  });

  it("drops any stray extra key (whitelist-only), keeping only variant/group/option labels", () => {
    const out = redactModifiersSnapshot({
      variantName: "V",
      surprise: 123,
      modifiers: [{ groupName: "G", optionName: "O", priceDeltaCents: 5, extraCents: 9 }],
    } as never) as Record<string, unknown>;
    expect(out).not.toHaveProperty("surprise");
    expect(JSON.stringify(out)).not.toContain("Cents");
    expect(out).toEqual({ variantName: "V", modifiers: [{ groupName: "G", optionName: "O" }] });
  });
});

describe("redactOrderEvent", () => {
  it("omits the payload (possible money) but keeps type/actor/timestamp", () => {
    const event = {
      id: "ev-1",
      orderId: "order-1",
      type: "PAID",
      payload: { amountCents: 1530 },
      actorType: "STAFF",
      actorId: "u1",
      createdAt: new Date(),
    } as unknown as OrderEvent;
    const redacted = redactOrderEvent(event) as Record<string, unknown>;
    expect(redacted).not.toHaveProperty("payload");
    expect(redacted).toMatchObject({ id: "ev-1", type: "PAID", actorType: "STAFF" });
  });
});
