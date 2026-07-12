import type { CustomerAddress } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { CustomerAddressNotFoundError } from "./customers.errors";
import type { CreateAddressInput, UpdateAddressInput } from "./customers.validation";

export async function listAddresses(customerId: string): Promise<CustomerAddress[]> {
  return prisma.customerAddress.findMany({ where: { customerId } });
}

export async function createAddress(customerId: string, input: CreateAddressInput): Promise<CustomerAddress> {
  return prisma.customerAddress.create({ data: { customerId, ...input } });
}

async function findOwnAddress(customerId: string, id: string): Promise<CustomerAddress> {
  const address = await prisma.customerAddress.findUnique({ where: { id } });
  if (!address || address.customerId !== customerId) {
    throw new CustomerAddressNotFoundError();
  }
  return address;
}

export async function updateAddress(
  customerId: string,
  id: string,
  input: UpdateAddressInput,
): Promise<CustomerAddress> {
  const address = await findOwnAddress(customerId, id);
  return prisma.customerAddress.update({ where: { id: address.id }, data: input });
}

export async function deleteAddress(customerId: string, id: string): Promise<void> {
  const address = await findOwnAddress(customerId, id);
  await prisma.customerAddress.delete({ where: { id: address.id } });
}
