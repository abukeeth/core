import type { FulfillmentMethod, FulfillmentProviderType } from "@prisma/client";
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

// PICKUP and RESTAURANT_DRIVER are internal flows (no external provider), so
// they're always selectable. Every other FulfillmentMethod maps 1:1 to a
// FulfillmentProviderType and is selectable only while its adapter is actually
// implemented. This is the single source of truth for "can this method be used
// on a real order?" — so bringing Uber Direct / DoorDash Drive online later is
// just flipping that adapter's `implemented` flag; nothing downstream (e.g.
// delivery-rule validation) needs to change.
const INTERNAL_FULFILLMENT_METHODS: ReadonlySet<FulfillmentMethod> = new Set<FulfillmentMethod>([
  "PICKUP",
  "RESTAURANT_DRIVER",
]);

export function isFulfillmentMethodAvailable(method: FulfillmentMethod): boolean {
  if (INTERNAL_FULFILLMENT_METHODS.has(method)) return true;
  const adapter = fulfillmentProviderRegistry.get(method as FulfillmentProviderType);
  return adapter?.implemented === true;
}
