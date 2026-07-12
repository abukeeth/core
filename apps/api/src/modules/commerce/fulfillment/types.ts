import type { FulfillmentProviderType } from "@prisma/client";

export interface DeliveryAddressInput {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  lat?: number;
  lng?: number;
}

export interface RequestDeliveryInput {
  fulfillmentId: string;
  pickupAddress: DeliveryAddressInput;
  dropoffAddress: DeliveryAddressInput;
  readyTime: Date;
}

export interface RequestDeliveryResult {
  success: boolean;
  externalDeliveryId?: string;
  estimatedDeliveryAt?: Date;
  failureMessage?: string;
}

export interface CancelDeliveryResult {
  success: boolean;
  failureMessage?: string;
}

export type ProviderDeliveryStatus =
  | "pending"
  | "en_route_to_pickup"
  | "picked_up"
  | "en_route_to_dropoff"
  | "delivered"
  | "failed"
  | "cancelled";

export interface NormalizedFulfillmentWebhookEvent {
  externalEventId: string;
  externalDeliveryId: string;
  status: ProviderDeliveryStatus;
  lat?: number;
  lng?: number;
  raw: unknown;
}

/**
 * The single extensibility seam for delivery providers, mirroring
 * PaymentProviderAdapter exactly. PICKUP and RESTAURANT_DRIVER need no
 * adapter (they're internal flows, not external providers) — this
 * interface exists for the BYO-delivery providers only.
 */
export interface FulfillmentProviderAdapter {
  readonly providerType: FulfillmentProviderType;
  readonly implemented: boolean;

  requestDelivery(input: RequestDeliveryInput, credentials: string): Promise<RequestDeliveryResult>;
  cancelDelivery(externalDeliveryId: string, credentials: string): Promise<CancelDeliveryResult>;
  getDeliveryStatus(externalDeliveryId: string, credentials: string): Promise<ProviderDeliveryStatus>;
  parseWebhookEvent(payload: unknown): NormalizedFulfillmentWebhookEvent;
}
