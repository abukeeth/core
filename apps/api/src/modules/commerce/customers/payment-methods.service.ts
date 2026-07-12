import type { CustomerPaymentMethod } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { CustomerPaymentMethodNotFoundError } from "./customers.errors";
import type { CreatePaymentMethodInput } from "./customers.validation";

export type CustomerPaymentMethodDisplay = Pick<
  CustomerPaymentMethod,
  "id" | "providerId" | "brand" | "last4" | "expMonth" | "expYear" | "isDefault"
>;

/**
 * Simple CRUD for records of ALREADY-tokenized saved methods — the
 * frontend obtains `providerToken` from the provider's client-side SDK
 * (e.g. Stripe Elements) before ever calling this. This module never
 * touches raw card data or performs tokenization itself.
 */
export async function listPaymentMethods(customerId: string): Promise<CustomerPaymentMethodDisplay[]> {
  return prisma.customerPaymentMethod.findMany({
    where: { customerId },
    select: { id: true, providerId: true, brand: true, last4: true, expMonth: true, expYear: true, isDefault: true },
  });
}

export async function createPaymentMethod(
  customerId: string,
  input: CreatePaymentMethodInput,
): Promise<CustomerPaymentMethod> {
  return prisma.customerPaymentMethod.create({ data: { customerId, ...input } });
}

export async function deletePaymentMethod(customerId: string, id: string): Promise<void> {
  const method = await prisma.customerPaymentMethod.findUnique({ where: { id } });
  if (!method || method.customerId !== customerId) {
    throw new CustomerPaymentMethodNotFoundError();
  }
  await prisma.customerPaymentMethod.delete({ where: { id: method.id } });
}
