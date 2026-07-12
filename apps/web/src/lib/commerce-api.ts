// Customer-facing commerce API client (Sprint 07) — cart, checkout,
// orders, and customer-account calls. Mirrors lib/api.ts's apiFetch
// pattern (relative /api/* paths proxied to the API by next.config.ts).

export type FulfillmentType = "PICKUP" | "DELIVERY" | "DINE_IN";

export interface PublicMenuVariant {
  id: string;
  name: string;
  priceDeltaCents: number;
  isDefault: boolean;
}

export interface PublicMenuModifierOption {
  id: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
}

export interface PublicMenuModifierGroup {
  id: string;
  name: string;
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  options: PublicMenuModifierOption[];
}

export interface PublicMenuItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  isOrderable: boolean;
  variants: PublicMenuVariant[];
  modifierGroups: PublicMenuModifierGroup[];
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  items: PublicMenuItem[];
}

export interface PublicMenu {
  restaurant: { id: string; name: string; description: string | null; address: string | null };
  categories: PublicMenuCategory[];
}

export interface CartItem {
  id: string;
  cartId: string;
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  unitPriceCents: number;
  modifiersSnapshot: { variantName?: string; modifiers: { groupName: string; optionName: string; priceDeltaCents: number }[] } | null;
  notes: string | null;
}

export interface Cart {
  id: string;
  restaurantId: string;
  customerId: string | null;
  guestSessionId: string | null;
  fulfillmentType: FulfillmentType;
  status: string;
  scheduledFor: string | null;
  deliveryAddressId: string | null;
  tableId: string | null;
  couponCode: string | null;
  loyaltyPointsToRedeem: number | null;
  notes: string | null;
  items: CartItem[];
}

export interface CheckoutQuote {
  eligible: boolean;
  reason?: string;
  resolvedFulfillmentMethod?: string;
  distanceMiles?: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
}

export type PaymentMethodType =
  | "APPLE_PAY"
  | "GOOGLE_PAY"
  | "VISA"
  | "MASTERCARD"
  | "AMEX"
  | "DISCOVER"
  | "CASH_ON_DELIVERY"
  | "CASH_AT_PICKUP";

export interface PlaceOrderInput {
  tipCents?: number;
  methodType: PaymentMethodType;
  methodToken?: string;
  guestEmail?: string;
  guestName?: string;
  guestPhone?: string;
  deliveryInstructions?: string;
  notes?: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  restaurantId: string;
  status: string;
  paymentStatus: string;
  fulfillmentType: FulfillmentType;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
  placedAt: string;
  items?: { id: string; menuItemNameSnapshot: string; quantity: number; unitPriceCents: number }[];
}

export interface OrderTimelineEntry {
  id: string;
  orderId: string;
  milestone: string;
  occurredAt: string;
}

export interface PublicCustomer {
  id: string;
  email: string;
  name: string;
  phone: string | null;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
}

export interface CustomerFavorite {
  id: string;
  customerId: string;
  restaurantId: string;
  menuItemId: string;
  menuItem: {
    id: string;
    name: string;
    priceCents: number;
    isAvailable: boolean;
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error ?? "Request failed");
  }

  return data as T;
}

// --- Public menu ------------------------------------------------------------

export function getPublicMenu(restaurantId: string) {
  return apiFetch<PublicMenu>(`/api/public/restaurants/${restaurantId}/menu`);
}

// --- QR ordering ---------------------------------------------------------------

export function resolveTableByQrToken(qrToken: string) {
  return apiFetch<{ table: { id: string; restaurantId: string; label: string } }>(`/api/public/tables/${qrToken}`);
}

// --- Cart --------------------------------------------------------------------

export function createCart(restaurantId: string, fulfillmentType: FulfillmentType = "PICKUP") {
  return apiFetch<{ cart: Cart }>(`/api/public/restaurants/${restaurantId}/cart`, {
    method: "POST",
    body: JSON.stringify({ fulfillmentType }),
  });
}

/** Binds a cart to a table via a scanned QR token — the only way a cart's
 * tableId is ever set (never a raw client-supplied tableId). */
export function bindCartToTable(cartId: string, qrToken: string) {
  return apiFetch<{ cart: Cart }>(`/api/public/cart/${cartId}/bind-table`, {
    method: "POST",
    body: JSON.stringify({ qrToken }),
  });
}

export function getCart(cartId: string) {
  return apiFetch<{ cart: Cart; subtotalCents: number }>(`/api/public/cart/${cartId}`);
}

export function addCartItem(
  cartId: string,
  input: { menuItemId: string; variantId?: string; quantity?: number; modifierOptionIds?: string[]; notes?: string },
) {
  return apiFetch<{ item: CartItem }>(`/api/public/cart/${cartId}/items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCartItemQuantity(cartId: string, itemId: string, quantity: number) {
  return apiFetch<{ item: CartItem }>(`/api/public/cart/${cartId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
}

export function removeCartItem(cartId: string, itemId: string) {
  return apiFetch<void>(`/api/public/cart/${cartId}/items/${itemId}`, { method: "DELETE" });
}

export function setCartFulfillment(
  cartId: string,
  input: { fulfillmentType: FulfillmentType; scheduledFor?: string; deliveryAddressId?: string; tableId?: string },
) {
  return apiFetch<{ cart: Cart }>(`/api/public/cart/${cartId}/fulfillment`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function applyCoupon(cartId: string, code: string) {
  return apiFetch<{ cart: Cart; discountCents: number }>(`/api/public/cart/${cartId}/coupon`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function removeCoupon(cartId: string) {
  return apiFetch<{ cart: Cart }>(`/api/public/cart/${cartId}/coupon`, { method: "DELETE" });
}

export interface LoyaltyAccountSummary {
  program: { isActive: boolean; pointsPerDollarCents: number; redemptionRateCentsPerPoint: number } | null;
  pointsBalance: number;
}

export function getLoyaltyBalance(restaurantId: string) {
  return apiFetch<LoyaltyAccountSummary>(`/api/customer/loyalty/${restaurantId}`);
}

export function applyLoyaltyRedemption(cartId: string, points: number) {
  return apiFetch<{ cart: Cart; discountCents: number }>(`/api/public/cart/${cartId}/loyalty`, {
    method: "POST",
    body: JSON.stringify({ points }),
  });
}

export function removeLoyaltyRedemption(cartId: string) {
  return apiFetch<{ cart: Cart }>(`/api/public/cart/${cartId}/loyalty`, { method: "DELETE" });
}

// --- Checkout ------------------------------------------------------------------

export function getCheckoutQuote(cartId: string, tipCents = 0) {
  return apiFetch<{ quote: CheckoutQuote }>(`/api/public/checkout/${cartId}/quote`, {
    method: "POST",
    body: JSON.stringify({ tipCents }),
  });
}

export interface RequiresAction {
  clientSecret: string;
}

export function placeOrder(cartId: string, input: PlaceOrderInput, idempotencyKey: string) {
  return apiFetch<{ order: Order; requiresAction?: RequiresAction }>(`/api/public/checkout/${cartId}/place-order`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Resumes checkout after the customer completes a 3DS/SCA challenge client-side (Sprint 07.6 C-6). */
export function confirmCardPayment(cartId: string) {
  return apiFetch<{ order: Order }>(`/api/public/checkout/${cartId}/confirm-payment`, {
    method: "POST",
  });
}

// --- Payment config (Stripe Elements bootstrap) --------------------------------

export interface PublicPaymentConfig {
  providerType: string;
  publicKey: string;
}

export function getPublicPaymentConfig(restaurantId: string) {
  return apiFetch<{ config: PublicPaymentConfig | null }>(`/api/public/restaurants/${restaurantId}/payment-config`);
}

// --- Order tracking -----------------------------------------------------------

export function getPublicOrder(orderId: string) {
  return apiFetch<{ order: Order }>(`/api/public/orders/${orderId}`);
}

export function getPublicOrderTimeline(orderId: string) {
  return apiFetch<{ timeline: OrderTimelineEntry[] }>(`/api/public/orders/${orderId}/timeline`);
}

// --- Customer account -----------------------------------------------------------

export function customerRegister(email: string, password: string, name: string, phone?: string) {
  return apiFetch<{ customer: PublicCustomer }>("/api/customer/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name, phone }),
  });
}

export function customerLogin(email: string, password: string) {
  return apiFetch<{ customer: PublicCustomer }>("/api/customer/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function customerLogout() {
  return apiFetch<{ ok: true }>("/api/customer/auth/logout", { method: "POST" });
}

export function customerMe() {
  return apiFetch<{ customer: PublicCustomer }>("/api/customer/auth/me");
}

export function listAddresses() {
  return apiFetch<{ addresses: CustomerAddress[] }>("/api/customer/addresses");
}

export interface CreateAddressInput {
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  lat?: number;
  lng?: number;
  isDefault?: boolean;
}

export function createAddress(input: CreateAddressInput) {
  return apiFetch<{ address: CustomerAddress }>("/api/customer/addresses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteAddress(id: string) {
  return apiFetch<void>(`/api/customer/addresses/${id}`, { method: "DELETE" });
}

export function listFavorites() {
  return apiFetch<{ favorites: CustomerFavorite[] }>("/api/customer/favorites");
}

export function createFavorite(restaurantId: string, menuItemId: string) {
  return apiFetch<{ favorite: CustomerFavorite }>("/api/customer/favorites", {
    method: "POST",
    body: JSON.stringify({ restaurantId, menuItemId }),
  });
}

export function deleteFavorite(id: string) {
  return apiFetch<void>(`/api/customer/favorites/${id}`, { method: "DELETE" });
}

export interface CustomerSavedPaymentMethod {
  id: string;
  providerId: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

export function listPaymentMethods() {
  return apiFetch<{ paymentMethods: CustomerSavedPaymentMethod[] }>("/api/customer/payment-methods");
}

export function deletePaymentMethod(id: string) {
  return apiFetch<void>(`/api/customer/payment-methods/${id}`, { method: "DELETE" });
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: number;
  status: string;
  totalCents: number;
  createdAt: string;
  restaurant: { id: string; name: string };
}

export function listCustomerOrders() {
  return apiFetch<{ orders: CustomerOrderSummary[] }>("/api/customer/orders");
}

// --- Reviews --------------------------------------------------------------

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface PublicReview extends Review {
  customerFirstName: string;
}

export function getOwnReview(orderId: string) {
  return apiFetch<{ review: Review | null }>(`/api/customer/orders/${orderId}/review`);
}

export function submitReview(orderId: string, input: { rating: number; comment?: string }) {
  return apiFetch<{ review: Review }>(`/api/customer/orders/${orderId}/review`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRestaurantReviews(restaurantId: string) {
  return apiFetch<{ reviews: PublicReview[]; averageRating: number | null; reviewCount: number }>(
    `/api/public/restaurants/${restaurantId}/reviews`,
  );
}
