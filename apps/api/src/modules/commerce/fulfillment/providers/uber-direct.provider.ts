import { FulfillmentProviderType } from "@prisma/client";
import { FulfillmentProviderNotImplementedError } from "../fulfillment.errors";
import type {
  CancelDeliveryResult,
  FulfillmentProviderAdapter,
  NormalizedFulfillmentWebhookEvent,
  ProviderDeliveryStatus,
  RequestDeliveryInput,
  RequestDeliveryResult,
} from "../types";

/**
 * Stub — Uber Direct integration is deferred to a future sprint. Registered
 * now so the provider registry/connect flow is future-proof, mirroring how
 * DoorDash/UberEats/Grubhub import adapters are stubbed in the imports module.
 */
export class UberDirectProvider implements FulfillmentProviderAdapter {
  readonly providerType = FulfillmentProviderType.UBER_DIRECT;
  readonly implemented = false;

  async requestDelivery(_input: RequestDeliveryInput, _credentials: string): Promise<RequestDeliveryResult> {
    throw new FulfillmentProviderNotImplementedError(this.providerType);
  }

  async cancelDelivery(_externalDeliveryId: string, _credentials: string): Promise<CancelDeliveryResult> {
    throw new FulfillmentProviderNotImplementedError(this.providerType);
  }

  async getDeliveryStatus(_externalDeliveryId: string, _credentials: string): Promise<ProviderDeliveryStatus> {
    throw new FulfillmentProviderNotImplementedError(this.providerType);
  }

  parseWebhookEvent(_payload: unknown): NormalizedFulfillmentWebhookEvent {
    throw new FulfillmentProviderNotImplementedError(this.providerType);
  }
}
