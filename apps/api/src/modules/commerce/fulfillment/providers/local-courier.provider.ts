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
 * Stub — a generic local-courier API integration is deferred to a future
 * sprint (there is no single "local courier" API; this would need to be
 * built per third-party courier service once one is chosen). Registered
 * now so the provider registry/connect flow is future-proof.
 */
export class LocalCourierProvider implements FulfillmentProviderAdapter {
  readonly providerType = FulfillmentProviderType.LOCAL_COURIER;
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
