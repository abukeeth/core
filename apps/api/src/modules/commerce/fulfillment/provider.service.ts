import type { FulfillmentProvider, FulfillmentProviderType } from "@prisma/client";
import { ProviderConnectionStatus } from "@prisma/client";
import { decryptSecret, encryptSecret } from "../../../lib/encryption";
import { prisma } from "../../../lib/prisma";
import { FulfillmentProviderNotFoundError, FulfillmentProviderNotImplementedError } from "./fulfillment.errors";
import { fulfillmentProviderRegistry } from "./registry";

export async function listProviders(restaurantId: string): Promise<FulfillmentProvider[]> {
  return prisma.fulfillmentProvider.findMany({ where: { restaurantId } });
}

export async function connectProvider(
  restaurantId: string,
  providerType: FulfillmentProviderType,
  credentials: string,
): Promise<FulfillmentProvider> {
  const adapter = fulfillmentProviderRegistry.get(providerType);
  if (!adapter || !adapter.implemented) {
    throw new FulfillmentProviderNotImplementedError(providerType);
  }

  const credentialsEncrypted = encryptSecret(credentials);

  return prisma.fulfillmentProvider.upsert({
    where: { restaurantId_providerType: { restaurantId, providerType } },
    create: {
      restaurantId,
      providerType,
      credentialsEncrypted,
      implemented: adapter.implemented,
      status: ProviderConnectionStatus.CONNECTED,
    },
    update: {
      credentialsEncrypted,
      status: ProviderConnectionStatus.CONNECTED,
    },
  });
}

async function findOwnProvider(
  restaurantId: string,
  providerType: FulfillmentProviderType,
): Promise<FulfillmentProvider> {
  const provider = await prisma.fulfillmentProvider.findUnique({
    where: { restaurantId_providerType: { restaurantId, providerType } },
  });
  if (!provider || provider.restaurantId !== restaurantId) {
    throw new FulfillmentProviderNotFoundError();
  }
  return provider;
}

export async function disconnectProvider(
  restaurantId: string,
  providerType: FulfillmentProviderType,
): Promise<FulfillmentProvider> {
  const provider = await findOwnProvider(restaurantId, providerType);
  return prisma.fulfillmentProvider.update({
    where: { id: provider.id },
    data: { status: ProviderConnectionStatus.DISCONNECTED, credentialsEncrypted: null },
  });
}

/** Exposed for other modules (e.g. the delivery-request flow) that need the decrypted credential. */
export async function getDecryptedCredentials(
  restaurantId: string,
  providerType: FulfillmentProviderType,
): Promise<string> {
  const provider = await findOwnProvider(restaurantId, providerType);
  if (!provider.credentialsEncrypted) {
    throw new FulfillmentProviderNotFoundError();
  }
  return decryptSecret(provider.credentialsEncrypted);
}
