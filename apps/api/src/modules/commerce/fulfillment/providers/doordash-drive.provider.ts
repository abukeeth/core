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
 * Stub — DoorDash Drive integration is deferred to a future sprint.
 * Registered now so the provider registry/connect flow is future-proof.
 */
export class DoorDashDriveProvider implements FulfillmentProviderAdapter {
  readonly providerType = FulfillmentProviderType.DOORDASH_DRIVE;
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
