import type { POSProvider, POSProviderType, POSSyncLog } from "@prisma/client";
import { ProviderConnectionStatus } from "@prisma/client";
import { encryptSecret } from "../../../lib/encryption";
import { prisma } from "../../../lib/prisma";
import { POSProviderNotFoundError, POSProviderNotImplementedError } from "./pos.errors";
import { posProviderRegistry } from "./registry";
import type { ConnectPOSProviderInput } from "./pos.validation";

export async function listProviders(restaurantId: string): Promise<POSProvider[]> {
  return prisma.pOSProvider.findMany({ where: { restaurantId } });
}

export async function connectProvider(
  restaurantId: string,
  providerType: POSProviderType,
  input: ConnectPOSProviderInput,
): Promise<POSProvider> {
  const adapter = posProviderRegistry.get(providerType);
  if (!adapter || !adapter.implemented) {
    throw new POSProviderNotImplementedError(providerType);
  }

  const credentialsEncrypted = encryptSecret(input.credentials);
  return prisma.pOSProvider.upsert({
    where: { restaurantId_providerType: { restaurantId, providerType } },
    create: {
      restaurantId,
      providerType,
      credentialsEncrypted,
      syncDirection: input.syncDirection ?? "MENU_IMPORT",
      implemented: adapter.implemented,
      status: ProviderConnectionStatus.CONNECTED,
      connectedAt: new Date(),
    },
    update: {
      credentialsEncrypted,
      syncDirection: input.syncDirection,
      status: ProviderConnectionStatus.CONNECTED,
      connectedAt: new Date(),
    },
  });
}

async function findOwnProvider(restaurantId: string, providerType: POSProviderType): Promise<POSProvider> {
  const provider = await prisma.pOSProvider.findUnique({
    where: { restaurantId_providerType: { restaurantId, providerType } },
  });
  if (!provider || provider.restaurantId !== restaurantId) {
    throw new POSProviderNotFoundError();
  }
  return provider;
}

export async function disconnectProvider(restaurantId: string, providerType: POSProviderType): Promise<POSProvider> {
  const provider = await findOwnProvider(restaurantId, providerType);
  return prisma.pOSProvider.update({
    where: { id: provider.id },
    data: { status: ProviderConnectionStatus.DISCONNECTED },
  });
}

export async function updateSyncDirection(
  restaurantId: string,
  providerType: POSProviderType,
  syncDirection: POSProvider["syncDirection"],
): Promise<POSProvider> {
  const provider = await findOwnProvider(restaurantId, providerType);
  return prisma.pOSProvider.update({ where: { id: provider.id }, data: { syncDirection } });
}

/**
 * Always throws today (every provider is a stub) — still writes a FAILED
 * POSSyncLog row so the logging plumbing is proven ahead of a real
 * integration, and failed sync attempts are visible to the owner rather
 * than silently absent.
 */
export async function triggerSync(restaurantId: string, providerType: POSProviderType): Promise<never> {
  const provider = await findOwnProvider(restaurantId, providerType);
  const adapter = posProviderRegistry.get(providerType);

  try {
    if (!adapter?.implemented) {
      throw new POSProviderNotImplementedError(providerType);
    }
    // Unreachable until a real adapter ships, kept for shape completeness.
    throw new Error("Unexpected: adapter reported implemented but has no real sync logic yet");
  } catch (err) {
    await prisma.pOSSyncLog.create({
      data: {
        posProviderId: provider.id,
        direction: provider.syncDirection,
        status: "FAILED",
        itemsSynced: 0,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

export async function listSyncLogs(restaurantId: string, providerType: POSProviderType): Promise<POSSyncLog[]> {
  const provider = await findOwnProvider(restaurantId, providerType);
  return prisma.pOSSyncLog.findMany({ where: { posProviderId: provider.id }, orderBy: { syncedAt: "desc" } });
}
