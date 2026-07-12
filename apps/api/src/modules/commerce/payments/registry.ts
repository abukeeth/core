import type { PaymentProviderType } from "@prisma/client";
import type { PaymentProviderAdapter } from "./types";
import { AdyenPaymentProviderAdapter } from "./providers/adyen.provider";
import { AuthorizeNetPaymentProviderAdapter } from "./providers/authorize-net.provider";
import { CloverPaymentProviderAdapter } from "./providers/clover.provider";
import { FiservPaymentProviderAdapter } from "./providers/fiserv.provider";
import { SquarePaymentProviderAdapter } from "./providers/square.provider";
import { StripePaymentProviderAdapter } from "./providers/stripe.provider";

/**
 * Mirrors modules/imports/adapters/registry.ts exactly: one map from
 * provider type to adapter, each declaring `implemented`. Orchestration
 * code (orchestrator.ts, webhook.service.ts) only ever calls through this
 * registry — nothing outside payments/providers/*.ts references a
 * specific provider's SDK or API shape (Sprint 07 spec §1).
 */
class PaymentProviderRegistry {
  private readonly adapters = new Map<PaymentProviderType, PaymentProviderAdapter>();

  register(adapter: PaymentProviderAdapter): void {
    this.adapters.set(adapter.providerType, adapter);
  }

  get(providerType: PaymentProviderType): PaymentProviderAdapter | undefined {
    return this.adapters.get(providerType);
  }
}

export const paymentProviderRegistry = new PaymentProviderRegistry();

// Registered once, at module load. Adding a new provider later is: write
// one adapter class + one `.register(new XAdapter())` line here.
paymentProviderRegistry.register(new StripePaymentProviderAdapter());
paymentProviderRegistry.register(new CloverPaymentProviderAdapter());
paymentProviderRegistry.register(new SquarePaymentProviderAdapter());
paymentProviderRegistry.register(new AuthorizeNetPaymentProviderAdapter());
paymentProviderRegistry.register(new AdyenPaymentProviderAdapter());
paymentProviderRegistry.register(new FiservPaymentProviderAdapter());
