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

/**
 * `OrderItem.modifiersSnapshot` is a Json blob written as
 * `{ variantName, modifiers: [{ groupName, optionName, priceDeltaCents }] }`
 * (see cart.service), so it EMBEDS money (`priceDeltaCents`). Rebuild it keeping
 * only the non-financial ticket labels — variantName, and each modifier's
 * groupName/optionName — and drop every price field. Whitelist-based, so any
 * unexpected/extra key (including a stray money field) is dropped, not leaked.
 * Null/empty/malformed snapshots are handled safely (→ null), and the original
 * object is never mutated (a fresh value is always returned).
 */
export function redactModifiersSnapshot(snapshot: OrderItem["modifiersSnapshot"]): OrderItem["modifiersSnapshot"] {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const snap = snapshot as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  // variantName is a label (string) or absent — never money; preserve when a string.
  if (typeof snap.variantName === "string") {
    result.variantName = snap.variantName;
  }
  if (Array.isArray(snap.modifiers)) {
    result.modifiers = snap.modifiers.map((entry) => {
      const mod = entry !== null && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const cleaned: Record<string, unknown> = {};
      if (typeof mod.groupName === "string") cleaned.groupName = mod.groupName;
      if (typeof mod.optionName === "string") cleaned.optionName = mod.optionName;
      return cleaned;
    });
  }
  return result as OrderItem["modifiersSnapshot"];
}

/** Keep name/variant/quantity + non-financial modifier labels; drop unit + line money and every modifier priceDeltaCents. */
export function redactOrderItem(item: OrderItem): RedactedOrderItem {
  const base = omit(item, ORDER_ITEM_MONEY_FIELDS);
  return { ...base, modifiersSnapshot: redactModifiersSnapshot(item.modifiersSnapshot) };
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
