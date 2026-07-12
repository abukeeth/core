// Client-only helper — the active cart id for a given restaurant, persisted
// in localStorage. Cart *identity* (guest vs customer) is resolved
// server-side from cookies; this just remembers which Cart row the browser
// is currently working with so repeat visits don't spawn duplicate carts.

function storageKey(restaurantId: string): string {
  return `ordervora_cart_${restaurantId}`;
}

export function getStoredCartId(restaurantId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(storageKey(restaurantId));
}

export function setStoredCartId(restaurantId: string, cartId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(restaurantId), cartId);
}

export function clearStoredCartId(restaurantId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(restaurantId));
}

function centsKey(): string {
  return "ordervora_idempotency_key";
}

/** Reused across retries of the same place-order attempt; cleared on success. */
export function getOrCreateIdempotencyKey(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  const existing = window.sessionStorage.getItem(centsKey());
  if (existing) return existing;
  const key = crypto.randomUUID();
  window.sessionStorage.setItem(centsKey(), key);
  return key;
}

export function clearIdempotencyKey(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(centsKey());
}
