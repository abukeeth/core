// Owner-facing (dashboard) commerce API client (Sprint 07) — orders,
// payments, delivery, kitchen capacity, POS, tables, coupons management.
// Mirrors lib/api.ts's apiFetch pattern.

export interface OwnerOrder {
  id: string;
  orderNumber: number;
  status: string;
  paymentStatus: string;
  fulfillmentType: string;
  source: string;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
  placedAt: string;
  tableId: string | null;
}

export interface OwnerOrderDetail extends OwnerOrder {
  items: { id: string; menuItemNameSnapshot: string; quantity: number; unitPriceCents: number }[];
  payment: { id: string; status: string } | null;
  fulfillment:
    | {
        id: string;
        status: string;
        method: string;
        driverAssignment: DriverAssignment | null;
      }
    | null;
}

export interface OrderEvent {
  id: string;
  type: string;
  createdAt: string;
}

export interface PaymentProvider {
  id: string;
  providerType: string;
  displayName: string | null;
  status: string;
  implemented: boolean;
  priority: number;
  isDefault: boolean;
}

export interface PaymentMethod {
  id: string;
  methodType: string;
  isEnabled: boolean;
  providerId: string;
}

export interface DeliveryConfig {
  isDeliveryEnabled: boolean;
  isPickupEnabled: boolean;
  isDineInEnabled: boolean;
  deliveryRadiusMiles: number | null;
  maxDeliveryDistanceMiles: number | null;
  minOrderCentsForDelivery: number;
  minOrderCentsForPickup: number;
}

export interface KitchenCapacity {
  isAcceptingOrders: boolean;
  maxConcurrentOrders: number | null;
  avgPrepTimeMinutes: number | null;
}

export interface POSProvider {
  id: string;
  providerType: string;
  status: string;
  implemented: boolean;
  syncDirection: string;
}

export interface Table {
  id: string;
  label: string;
  qrToken: string;
  isActive: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_DELIVERY";
  value: number;
  isActive: boolean;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  maxRedemptionsPerCustomer: number | null;
}

export interface CreateCouponInput {
  code: string;
  type: string;
  value: number;
  isActive?: boolean;
  minOrderCents?: number;
  maxDiscountCents?: number;
  expiresAt?: string;
  maxRedemptions?: number;
  maxRedemptionsPerCustomer?: number;
}

export interface FulfillmentProvider {
  id: string;
  providerType: string;
  status: string;
  implemented: boolean;
}

export interface DriverAssignment {
  id: string;
  fulfillmentId: string;
  driverId: string;
  status: string;
  currentLat: number | null;
  currentLng: number | null;
}

/**
 * Eligible driver = this restaurant's staff. activeAssignmentCount is
 * already-derived "busy" info (same definition assignDriver's own
 * concurrency check uses) — the seam a future online/busy/offline
 * driver-status feature builds on directly, not a placeholder.
 */
export interface DriverCandidate {
  id: string;
  name: string;
  email: string;
  activeAssignmentCount: number;
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

// --- Orders --------------------------------------------------------------------

export function listOwnOrders(params: { status?: string; source?: string } = {}) {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  return apiFetch<{ orders: OwnerOrder[]; total: number }>(`/api/restaurants/me/orders${query ? `?${query}` : ""}`);
}

export function getOwnOrder(id: string) {
  return apiFetch<{ order: OwnerOrderDetail }>(`/api/restaurants/me/orders/${id}`);
}

export function getOrderEvents(id: string) {
  return apiFetch<{ events: OrderEvent[] }>(`/api/restaurants/me/orders/${id}/events`);
}

function transitionOrder(id: string, action: string) {
  return apiFetch<{ order: OwnerOrderDetail }>(`/api/restaurants/me/orders/${id}/${action}`, { method: "PATCH" });
}

export const startPreparing = (id: string) => transitionOrder(id, "start-preparing");
export const markReady = (id: string) => transitionOrder(id, "mark-ready");
export const markOutForDelivery = (id: string) => transitionOrder(id, "mark-out-for-delivery");
export const completeOrder = (id: string) => transitionOrder(id, "complete");
export const markPaidCash = (id: string) => transitionOrder(id, "mark-paid");

export function cancelOrder(id: string, reason?: string) {
  return apiFetch<{ order: OwnerOrderDetail }>(`/api/restaurants/me/orders/${id}/cancel`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
}

export function refundOrder(id: string, amountCents: number, reason: string) {
  return apiFetch<{ order: OwnerOrderDetail }>(`/api/restaurants/me/orders/${id}/refund`, {
    method: "POST",
    body: JSON.stringify({ amountCents, reason }),
  });
}

// --- Payments --------------------------------------------------------------------

export function listPaymentProviders() {
  return apiFetch<{ providers: PaymentProvider[] }>("/api/restaurants/me/payment-providers");
}

export function connectPaymentProvider(
  type: string,
  credentials: string,
  webhookSecret?: string,
  displayName?: string,
  publicKey?: string,
) {
  return apiFetch<{ provider: PaymentProvider }>(`/api/restaurants/me/payment-providers/${type}/connect`, {
    method: "POST",
    body: JSON.stringify({ credentials, webhookSecret, displayName, publicKey }),
  });
}

export function disconnectPaymentProvider(type: string) {
  return apiFetch<void>(`/api/restaurants/me/payment-providers/${type}`, { method: "DELETE" });
}

export function updatePaymentProviderPriority(type: string, priority?: number, isDefault?: boolean) {
  return apiFetch<{ provider: PaymentProvider }>(`/api/restaurants/me/payment-providers/${type}/priority`, {
    method: "PATCH",
    body: JSON.stringify({ priority, isDefault }),
  });
}

export function listPaymentMethods() {
  return apiFetch<{ methods: PaymentMethod[] }>("/api/restaurants/me/payment-methods");
}

export function updatePaymentMethod(methodType: string, isEnabled?: boolean, providerId?: string) {
  return apiFetch<{ method: PaymentMethod }>(`/api/restaurants/me/payment-methods/${methodType}`, {
    method: "PATCH",
    body: JSON.stringify({ isEnabled, providerId }),
  });
}

// --- Delivery config / kitchen capacity -------------------------------------------

export function getDeliveryConfig() {
  return apiFetch<{ deliveryConfig: DeliveryConfig }>("/api/restaurants/me/delivery-config");
}

export function updateDeliveryConfig(input: Partial<DeliveryConfig>) {
  return apiFetch<{ deliveryConfig: DeliveryConfig }>("/api/restaurants/me/delivery-config", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getKitchenCapacity() {
  return apiFetch<{ kitchenCapacity: KitchenCapacity }>("/api/restaurants/me/kitchen-capacity");
}

export function updateKitchenCapacity(input: Partial<KitchenCapacity>) {
  return apiFetch<{ kitchenCapacity: KitchenCapacity }>("/api/restaurants/me/kitchen-capacity", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// --- Fulfillment providers -----------------------------------------------------

export function listFulfillmentProviders() {
  return apiFetch<{ providers: FulfillmentProvider[] }>("/api/restaurants/me/fulfillment-providers");
}

export function listDriverCandidates() {
  return apiFetch<{ drivers: DriverCandidate[] }>("/api/restaurants/me/fulfillment/drivers");
}

/** Also the reassign action — assigning a fulfillment that already has a different active driver silently moves it to the new one (server-side upsert). */
export function assignDriver(fulfillmentId: string, driverId: string) {
  return apiFetch<{ assignment: DriverAssignment }>(`/api/restaurants/me/fulfillment/${fulfillmentId}/assign-driver`, {
    method: "POST",
    body: JSON.stringify({ driverId }),
  });
}

// --- POS -------------------------------------------------------------------------

export function listPOSProviders() {
  return apiFetch<{ posProviders: POSProvider[] }>("/api/restaurants/me/pos-providers");
}

// --- Tables (QR ordering) ------------------------------------------------------

export function listTables() {
  return apiFetch<{ tables: Table[] }>("/api/restaurants/me/tables");
}

export function createTable(label: string) {
  return apiFetch<{ table: Table }>("/api/restaurants/me/tables", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function updateTable(id: string, input: { label?: string; isActive?: boolean }) {
  return apiFetch<{ table: Table }>(`/api/restaurants/me/tables/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTable(id: string) {
  return apiFetch<void>(`/api/restaurants/me/tables/${id}`, { method: "DELETE" });
}

export function regenerateQrToken(id: string) {
  return apiFetch<{ table: Table }>(`/api/restaurants/me/tables/${id}/regenerate-qr-token`, { method: "POST" });
}

// --- Coupons ---------------------------------------------------------------------

export function listCoupons() {
  return apiFetch<{ coupons: Coupon[] }>("/api/restaurants/me/coupons");
}

export function createCoupon(input: CreateCouponInput) {
  return apiFetch<{ coupon: Coupon }>("/api/restaurants/me/coupons", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCoupon(id: string, input: Partial<CreateCouponInput>) {
  return apiFetch<{ coupon: Coupon }>(`/api/restaurants/me/coupons/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteCoupon(id: string) {
  return apiFetch<void>(`/api/restaurants/me/coupons/${id}`, { method: "DELETE" });
}

export interface LoyaltyProgram {
  id: string;
  restaurantId: string;
  pointsPerDollarCents: number;
  redemptionRateCentsPerPoint: number;
  isActive: boolean;
}

export function getLoyaltyProgram() {
  return apiFetch<{ program: LoyaltyProgram }>("/api/restaurants/me/loyalty-program");
}

export function updateLoyaltyProgram(input: Partial<Pick<LoyaltyProgram, "pointsPerDollarCents" | "redemptionRateCentsPerPoint" | "isActive">>) {
  return apiFetch<{ program: LoyaltyProgram }>("/api/restaurants/me/loyalty-program", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// --- Analytics -------------------------------------------------------------------

export interface RevenueSummary {
  totalRevenueCents: number;
  averageOrderValueCents: number;
  totalOrders: number;
  ordersByStatus: Record<string, number>;
}

export interface RevenueByDay {
  day: string;
  revenueCents: number;
  orderCount: number;
}

export interface TopItem {
  menuItemId: string;
  name: string;
  quantitySold: number;
  revenueCents: number;
}

export function getRevenueSummary(days = 30) {
  return apiFetch<RevenueSummary>(`/api/restaurants/me/analytics/summary?days=${days}`);
}

export function getRevenueByDay(days = 30) {
  return apiFetch<{ days: RevenueByDay[] }>(`/api/restaurants/me/analytics/revenue-by-day?days=${days}`);
}

export function getTopItems(days = 30, limit = 10) {
  return apiFetch<{ items: TopItem[] }>(`/api/restaurants/me/analytics/top-items?days=${days}&limit=${limit}`);
}
