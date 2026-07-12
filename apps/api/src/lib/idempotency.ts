import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotentReservation<T> =
  | { status: "fresh" }
  | { status: "completed"; response: T }
  | { status: "in_progress" };

/**
 * Reserves an idempotency key for an endpoint via a Postgres unique-
 * constraint race (create() throwing P2002 on conflict), not a
 * check-then-write race — this table must be backed by Postgres, never an
 * in-memory structure, since two server instances could otherwise each
 * "not find" the same key and double-charge a customer (Sprint 07 spec §16).
 */
export async function reserveIdempotencyKey<T>(
  key: string,
  endpoint: string,
  restaurantId?: string,
): Promise<IdempotentReservation<T>> {
  try {
    await prisma.idempotencyKey.create({
      data: {
        key,
        endpoint,
        restaurantId,
        status: "IN_PROGRESS",
        expiresAt: new Date(Date.now() + IDEMPOTENCY_KEY_TTL_MS),
      },
    });
    return { status: "fresh" };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
      throw err;
    }
    const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing?.status === "COMPLETED") {
      return { status: "completed", response: existing.responseSnapshot as T };
    }
    if (existing?.status === "FAILED") {
      // A prior attempt failed outright — allow this request to retry by
      // re-reserving in place, rather than wedging the key forever.
      await prisma.idempotencyKey.update({
        where: { key },
        data: { status: "IN_PROGRESS", expiresAt: new Date(Date.now() + IDEMPOTENCY_KEY_TTL_MS) },
      });
      return { status: "fresh" };
    }
    return { status: "in_progress" };
  }
}

export async function completeIdempotencyKey(key: string, response: unknown): Promise<void> {
  await prisma.idempotencyKey.update({
    where: { key },
    data: { status: "COMPLETED", responseSnapshot: response as Prisma.InputJsonValue },
  });
}

export async function failIdempotencyKey(key: string): Promise<void> {
  await prisma.idempotencyKey.update({ where: { key }, data: { status: "FAILED" } }).catch(() => undefined);
}
