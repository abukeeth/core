import type { Table } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { InvalidQrTokenError, TableNotFoundError } from "./qr-ordering.errors";
import { generateQrToken } from "./qr-token";
import type { CreateTableInput, UpdateTableInput } from "./qr-ordering.validation";

export async function listTables(restaurantId: string): Promise<Table[]> {
  return prisma.table.findMany({ where: { restaurantId } });
}

export async function createTable(restaurantId: string, input: CreateTableInput): Promise<Table> {
  return prisma.table.create({ data: { restaurantId, label: input.label, qrToken: generateQrToken() } });
}

async function findOwnTable(restaurantId: string, id: string): Promise<Table> {
  const table = await prisma.table.findUnique({ where: { id } });
  if (!table || table.restaurantId !== restaurantId) {
    throw new TableNotFoundError();
  }
  return table;
}

export async function updateTable(restaurantId: string, id: string, input: UpdateTableInput): Promise<Table> {
  const table = await findOwnTable(restaurantId, id);
  return prisma.table.update({ where: { id: table.id }, data: input });
}

export async function deleteTable(restaurantId: string, id: string): Promise<void> {
  const table = await findOwnTable(restaurantId, id);
  await prisma.table.delete({ where: { id: table.id } });
}

/** Issues a NEW token, invalidating the old printed QR code — for a lost/stolen/misprinted code. */
export async function regenerateQrToken(restaurantId: string, id: string): Promise<Table> {
  const table = await findOwnTable(restaurantId, id);
  return prisma.table.update({ where: { id: table.id }, data: { qrToken: generateQrToken() } });
}

/**
 * Public resolution — never trusts a client-supplied table id directly,
 * only ever resolves via the opaque token. Same error for "doesn't exist"
 * and "inactive" to avoid enumeration.
 */
export async function resolveTableByToken(qrToken: string): Promise<Table> {
  const table = await prisma.table.findUnique({ where: { qrToken } });
  if (!table || !table.isActive) {
    throw new InvalidQrTokenError();
  }
  return table;
}
