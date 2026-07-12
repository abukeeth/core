import type { PaymentMethod, PaymentMethodType } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { PaymentMethodNotFoundError, PaymentProviderNotFoundError } from "./payments.errors";
import type { UpdatePaymentMethodInput } from "./payments.validation";

export async function listMethods(restaurantId: string): Promise<PaymentMethod[]> {
  return prisma.paymentMethod.findMany({ where: { restaurantId } });
}

async function findOwnMethod(restaurantId: string, methodType: PaymentMethodType): Promise<PaymentMethod> {
  const method = await prisma.paymentMethod.findUnique({
    where: { restaurantId_methodType: { restaurantId, methodType } },
  });
  if (!method || method.restaurantId !== restaurantId) {
    throw new PaymentMethodNotFoundError();
  }
  return method;
}

/**
 * Enables/disables a method and optionally repoints its primary provider.
 * Lazily creates the row on first enable — a restaurant only has
 * PaymentMethod rows for methods it has ever configured.
 */
export async function setMethodEnabled(
  restaurantId: string,
  methodType: PaymentMethodType,
  input: UpdatePaymentMethodInput,
): Promise<PaymentMethod> {
  let providerId = input.providerId;
  if (providerId) {
    const provider = await prisma.paymentProvider.findUnique({ where: { id: providerId } });
    if (!provider || provider.restaurantId !== restaurantId) {
      throw new PaymentProviderNotFoundError();
    }
  }

  const existing = await prisma.paymentMethod.findUnique({
    where: { restaurantId_methodType: { restaurantId, methodType } },
  });

  if (!existing) {
    if (!providerId) {
      // First-time enable requires a provider to route through — CASH
      // methods are the one exception, they never touch a provider at
      // authorization time, but still need a PaymentProvider row to
      // satisfy the schema's FK; callers must pass a providerId even for
      // cash (any CONNECTED provider works, or a dedicated one) — this is
      // documented at the controller/route level.
      const defaultProvider = await prisma.paymentProvider.findFirst({ where: { restaurantId } });
      if (!defaultProvider) {
        throw new PaymentProviderNotFoundError();
      }
      providerId = defaultProvider.id;
    }
    return prisma.paymentMethod.create({
      data: { restaurantId, methodType, providerId, isEnabled: input.isEnabled ?? true },
    });
  }

  await findOwnMethod(restaurantId, methodType);
  return prisma.paymentMethod.update({
    where: { id: existing.id },
    data: { isEnabled: input.isEnabled, providerId },
  });
}
