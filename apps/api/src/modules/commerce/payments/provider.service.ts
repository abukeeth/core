import type { PaymentProvider, PaymentProviderType } from "@prisma/client";
import { ProviderConnectionStatus } from "@prisma/client";
import { encryptSecret } from "../../../lib/encryption";
import { prisma } from "../../../lib/prisma";
import { PaymentProviderNotFoundError, PaymentProviderNotImplementedError } from "./payments.errors";
import type { ConnectProviderInput, UpdateProviderPriorityInput } from "./payments.validation";
import { paymentProviderRegistry } from "./registry";

/** CRUD for PaymentProvider — the owner-facing BYOP connection management surface (Sprint 07 spec §21). */

export async function listProviders(restaurantId: string): Promise<PaymentProvider[]> {
  return prisma.paymentProvider.findMany({
    where: { restaurantId },
    orderBy: { priority: "asc" },
  });
}

async function findOwnProvider(restaurantId: string, providerType: PaymentProviderType): Promise<PaymentProvider> {
  const provider = await prisma.paymentProvider.findUnique({
    where: { restaurantId_providerType: { restaurantId, providerType } },
  });
  if (!provider || provider.restaurantId !== restaurantId) {
    throw new PaymentProviderNotFoundError();
  }
  return provider;
}

/**
 * Connects (or reconnects) a BYOP provider. Rejects up front — before ever
 * touching the credentials — if the adapter isn't implemented (spec §4:
 * "Stripe ships implemented: true; Clover/Square/Authorize.net/Adyen/Fiserv
 * are registered stub adapters"). Credentials and webhook secret are
 * envelope-encrypted before storage; plaintext never touches the database.
 */
export async function connectProvider(
  restaurantId: string,
  providerType: PaymentProviderType,
  input: ConnectProviderInput,
): Promise<PaymentProvider> {
  const adapter = paymentProviderRegistry.get(providerType);
  if (!adapter || !adapter.implemented) {
    throw new PaymentProviderNotImplementedError(providerType);
  }

  const credentialsEncrypted = encryptSecret(input.credentials);
  const webhookSecretEncrypted = input.webhookSecret ? encryptSecret(input.webhookSecret) : undefined;

  return prisma.paymentProvider.upsert({
    where: { restaurantId_providerType: { restaurantId, providerType } },
    create: {
      restaurantId,
      providerType,
      displayName: input.displayName,
      credentialsEncrypted,
      webhookSecretEncrypted,
      publicKey: input.publicKey,
      status: ProviderConnectionStatus.CONNECTED,
      implemented: adapter.implemented,
      connectedAt: new Date(),
    },
    update: {
      displayName: input.displayName,
      credentialsEncrypted,
      webhookSecretEncrypted,
      publicKey: input.publicKey,
      status: ProviderConnectionStatus.CONNECTED,
      implemented: adapter.implemented,
      connectedAt: new Date(),
    },
  });
}

export async function disconnectProvider(restaurantId: string, providerType: PaymentProviderType): Promise<void> {
  const provider = await findOwnProvider(restaurantId, providerType);
  await prisma.paymentProvider.update({
    where: { id: provider.id },
    data: { status: ProviderConnectionStatus.DISCONNECTED },
  });
}

/**
 * Sets failover priority (lower tried first, spec §4) and/or the default
 * flag for a connected provider. Setting `isDefault: true` on one provider
 * doesn't automatically clear it on others here — the orchestrator only
 * ever uses `isDefault` as a tiebreak among equal-priority candidates, so
 * multiple `isDefault` rows degrade gracefully rather than corrupting
 * routing; callers (the controller) are expected to clear the previous
 * default explicitly if strict single-default enforcement is desired.
 */
export async function setProviderPriority(
  restaurantId: string,
  providerType: PaymentProviderType,
  input: UpdateProviderPriorityInput,
): Promise<PaymentProvider> {
  const provider = await findOwnProvider(restaurantId, providerType);
  return prisma.paymentProvider.update({
    where: { id: provider.id },
    data: {
      priority: input.priority,
      isDefault: input.isDefault,
    },
  });
}

export async function getOwnProviderById(restaurantId: string, providerId: string): Promise<PaymentProvider> {
  const provider = await prisma.paymentProvider.findUnique({ where: { id: providerId } });
  if (!provider || provider.restaurantId !== restaurantId) {
    throw new PaymentProviderNotFoundError();
  }
  return provider;
}
