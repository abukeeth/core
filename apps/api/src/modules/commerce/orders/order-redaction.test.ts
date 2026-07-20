import type { Order, OrderEvent, OrderItem, Payment } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { redactOrderEvent, redactOrderFinancials, redactOrderItem } from "./order-redaction";

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
});

describe("redactOrderItem", () => {
  it("drops unit and line money, keeps the rest", () => {
    const redacted = redactOrderItem(itemRow()) as Record<string, unknown>;
    expect(redacted).not.toHaveProperty("unitPriceCents");
    expect(redacted).not.toHaveProperty("lineTotalCents");
    expect(redacted).toMatchObject({ nameSnapshot: "Burger", quantity: 1 });
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
