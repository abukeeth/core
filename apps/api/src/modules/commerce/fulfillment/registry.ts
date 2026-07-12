import type { FulfillmentProviderType } from "@prisma/client";
import { DoorDashDriveProvider } from "./providers/doordash-drive.provider";
import { LocalCourierProvider } from "./providers/local-courier.provider";
import { UberDirectProvider } from "./providers/uber-direct.provider";
import type { FulfillmentProviderAdapter } from "./types";

class FulfillmentProviderRegistry {
  private readonly adapters = new Map<FulfillmentProviderType, FulfillmentProviderAdapter>();

  register(adapter: FulfillmentProviderAdapter): void {
    this.adapters.set(adapter.providerType, adapter);
  }

  get(providerType: FulfillmentProviderType): FulfillmentProviderAdapter | undefined {
    return this.adapters.get(providerType);
  }
}

export const fulfillmentProviderRegistry = new FulfillmentProviderRegistry();

// Registered once, at module load. PICKUP and RESTAURANT_DRIVER are
// internal flows and deliberately have no adapter here — see types.ts.
fulfillmentProviderRegistry.register(new UberDirectProvider());
fulfillmentProviderRegistry.register(new DoorDashDriveProvider());
fulfillmentProviderRegistry.register(new LocalCourierProvider());
