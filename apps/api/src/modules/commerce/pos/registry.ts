import type { POSProviderType } from "@prisma/client";
import { CloverPOSProviderAdapter } from "./providers/clover-pos.provider";
import { GenericPOSProviderAdapter } from "./providers/generic.provider";
import { LightspeedPOSProviderAdapter } from "./providers/lightspeed.provider";
import { SquarePOSProviderAdapter } from "./providers/square-pos.provider";
import { ToastPOSProviderAdapter } from "./providers/toast.provider";
import type { POSProviderAdapter } from "./types";

class POSProviderRegistry {
  private readonly adapters = new Map<POSProviderType, POSProviderAdapter>();

  register(adapter: POSProviderAdapter): void {
    this.adapters.set(adapter.providerType, adapter);
  }

  get(providerType: POSProviderType): POSProviderAdapter | undefined {
    return this.adapters.get(providerType);
  }
}

export const posProviderRegistry = new POSProviderRegistry();

// All five registered as stubs (implemented: false) — see pos.errors.ts
// and each provider file's comment for the deliberate scope boundary.
posProviderRegistry.register(new SquarePOSProviderAdapter());
posProviderRegistry.register(new CloverPOSProviderAdapter());
posProviderRegistry.register(new ToastPOSProviderAdapter());
posProviderRegistry.register(new LightspeedPOSProviderAdapter());
posProviderRegistry.register(new GenericPOSProviderAdapter());
