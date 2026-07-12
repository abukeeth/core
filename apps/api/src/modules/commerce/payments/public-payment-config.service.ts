import { PaymentProviderType, ProviderConnectionStatus } from "@prisma/client";
import { prisma } from "../../../lib/prisma";

export interface PublicPaymentConfig {
  providerType: PaymentProviderType;
  publicKey: string;
}

/**
 * The only payment-provider data ever exposed to an unauthenticated
 * checkout request — providerType + publicKey (a Stripe publishable key,
 * safe by design to expose client-side). Never returns
 * credentialsEncrypted/webhookSecretEncrypted or any other provider field
 * (Sprint 07.6 C-1); returning more than this shape would reopen a version
 * of the M-2 finding.
 */
export async function getPublicPaymentConfig(restaurantId: string): Promise<PublicPaymentConfig | null> {
  const provider = await prisma.paymentProvider.findFirst({
    where: {
      restaurantId,
      providerType: PaymentProviderType.STRIPE,
      status: ProviderConnectionStatus.CONNECTED,
      publicKey: { not: null },
    },
    orderBy: [{ priority: "asc" }, { isDefault: "desc" }],
  });

  if (!provider?.publicKey) {
    return null;
  }

  return { providerType: provider.providerType, publicKey: provider.publicKey };
}
