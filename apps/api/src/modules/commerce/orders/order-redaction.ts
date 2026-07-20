import type { Order, OrderEvent, OrderItem, Payment } from "@prisma/client";

/**
 * BOS Phase 2 (P2.6.1) — kitchen financial firewall: response-field redaction.
 *
 * Pure helpers that strip money from order/ticket payloads for a financially
 * restricted (kitchen) actor, returning the *ticket* — items, quantities,
 * modifiers, status, timestamps — with all money absent (fields OMITTED, not
 * zeroed, so a kitchen UI can't render a misleading "$0.00"). Whether to apply
 * these is decided by evaluateFinancialFirewall (flag + predicate); these
 * functions do the stripping only. There is no central order serializer, so each
 * REDACT call site (orders.controller) invokes these explicitly.
 */

/** Order-level frozen money snapshots (schema: Order). */
const ORDER_MONEY_FIELDS = [
  "subtotalCents",
  "taxCents",
  "tipCents",
  "deliveryFeeCents",
  "serviceFeeCents",
  "discountCents",
  "totalCents",
] as const satisfies readonly (keyof Order)[];

/** Per-line money on OrderItem. */
const ORDER_ITEM_MONEY_FIELDS = ["unitPriceCents", "lineTotalCents"] as const satisfies readonly (keyof OrderItem)[];

function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const clone = { ...obj };
  for (const key of keys) {
    delete clone[key];
  }
  return clone;
}

export type RedactedOrderItem = Omit<OrderItem, (typeof ORDER_ITEM_MONEY_FIELDS)[number]>;

/** Keep name/variant/quantity/modifiers; drop unit + line money. */
export function redactOrderItem(item: OrderItem): RedactedOrderItem {
  return omit(item, ORDER_ITEM_MONEY_FIELDS);
}

export type RedactedOrder<T extends Order> = Omit<T, (typeof ORDER_MONEY_FIELDS)[number] | "items" | "payment"> & {
  items?: RedactedOrderItem[];
  payment?: null;
};

/**
 * Strip all financial fields from an order. Works for both the list shape (a
 * bare `Order`) and the detail shape (`Order` + `items` + `payment`):
 *   - order: drop the 7 money snapshots;
 *   - items (when present): drop unit/line money, keep the ticket;
 *   - payment (when present): dropped entirely (kitchen sees no payment at all).
 */
export function redactOrderFinancials<T extends Order & { items?: OrderItem[]; payment?: Payment | null }>(
  order: T,
): RedactedOrder<T> {
  const base = omit(order, ORDER_MONEY_FIELDS) as unknown as RedactedOrder<T>;
  if (order.items !== undefined) {
    base.items = order.items.map(redactOrderItem);
  }
  if ("payment" in order) {
    base.payment = null;
  }
  return base;
}

/** Omit the free-form `payload` (which may embed amounts on PAID/REFUNDED events); keep type/actor/timestamp. */
export function redactOrderEvent(event: OrderEvent): Omit<OrderEvent, "payload"> {
  return omit(event, ["payload"]);
}
