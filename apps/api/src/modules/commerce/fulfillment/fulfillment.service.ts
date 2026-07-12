import type { DriverAssignment, Fulfillment, FulfillmentDetailStatus } from "@prisma/client";
import { DriverAssignmentStatus, Role } from "@prisma/client";
import { getNumberEnv } from "../../../config/env";
import { errorTracker } from "../../../lib/error-tracker";
import { createLogger } from "../../../lib/logger";
import { prisma } from "../../../lib/prisma";
import { emitOrderEvent, writeOrderEvent } from "../events/record-order-event";
import { sendDriverAssignmentOfferNotification, sendDriverReassignedAwayNotification } from "../notifications/notifications.service";
import {
  DriverAlreadyBusyError,
  DriverAssignmentNotFoundError,
  DriverNotOnStaffError,
  FulfillmentNotFoundError,
} from "./fulfillment.errors";

const logger = createLogger("fulfillment-service");

/** Non-terminal Fulfillment statuses — used to scope "currently active" driver-assignment counts. */
const TERMINAL_FULFILLMENT_STATUSES: FulfillmentDetailStatus[] = [
  "DELIVERED",
  "PICKED_UP_BY_CUSTOMER",
  "FAILED",
  "CANCELLED",
];

/** Statuses that mean "this driver currently has the job" for busy-driver concurrency checks (§7 Smart Routing). */
const BUSY_DRIVER_ASSIGNMENT_STATUSES: DriverAssignmentStatus[] = [
  DriverAssignmentStatus.OFFERED,
  DriverAssignmentStatus.ACCEPTED,
  DriverAssignmentStatus.EN_ROUTE,
];

/** How long an OFFERED assignment waits for a driver response before expireStaleOffers reclaims it (Sprint 07.6 C-11). */
const OFFER_TIMEOUT_MS = getNumberEnv("DRIVER_OFFER_TIMEOUT_MS", 3 * 60_000);

export interface DriverCandidate {
  id: string;
  name: string;
  email: string;
  activeAssignmentCount: number;
}

/**
 * Staff eligible to be assigned as a driver for this restaurant, each with
 * their current busy-assignment count — the same "busy" definition
 * assignDriver's own concurrency check uses. This count is the seam a
 * future online/busy/offline driver-status feature can build on directly
 * (busy is already derived here); it does not require a new endpoint.
 */
export async function listDriverCandidates(restaurantId: string): Promise<DriverCandidate[]> {
  const staff = await prisma.user.findMany({
    where: { restaurantId, role: Role.RESTAURANT_STAFF },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  if (staff.length === 0) return [];

  const counts = await prisma.driverAssignment.groupBy({
    by: ["driverId"],
    where: { driverId: { in: staff.map((s) => s.id) }, status: { in: BUSY_DRIVER_ASSIGNMENT_STATUSES } },
    _count: { _all: true },
  });
  const countByDriverId = new Map(counts.map((c) => [c.driverId, c._count._all]));

  return staff.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    activeAssignmentCount: countByDriverId.get(s.id) ?? 0,
  }));
}

export async function getFulfillment(restaurantId: string, fulfillmentId: string): Promise<Fulfillment> {
  const fulfillment = await prisma.fulfillment.findUnique({ where: { id: fulfillmentId } });
  if (!fulfillment || fulfillment.restaurantId !== restaurantId) {
    throw new FulfillmentNotFoundError();
  }
  return fulfillment;
}

export async function updateFulfillmentStatus(
  restaurantId: string,
  fulfillmentId: string,
  status: FulfillmentDetailStatus,
): Promise<Fulfillment> {
  const fulfillment = await getFulfillment(restaurantId, fulfillmentId);
  return prisma.fulfillment.update({ where: { id: fulfillment.id }, data: { status } });
}

/**
 * Count of a specific driver's currently-busy (OFFERED/ACCEPTED/EN_ROUTE)
 * assignments, optionally excluding one fulfillment's own assignment row —
 * so reassigning a fulfillment to the driver it's already on isn't blocked
 * by its own existing row (Sprint 07.6 C-9).
 */
export async function countActiveAssignmentsForDriver(driverId: string, excludeFulfillmentId?: string): Promise<number> {
  return prisma.driverAssignment.count({
    where: {
      driverId,
      status: { in: BUSY_DRIVER_ASSIGNMENT_STATUSES },
      ...(excludeFulfillmentId ? { fulfillmentId: { not: excludeFulfillmentId } } : {}),
    },
  });
}

export async function assignDriver(
  restaurantId: string,
  fulfillmentId: string,
  driverId: string,
): Promise<DriverAssignment> {
  const fulfillment = await getFulfillment(restaurantId, fulfillmentId);

  const driver = await prisma.user.findUnique({ where: { id: driverId } });
  if (!driver || driver.restaurantId !== restaurantId || driver.role !== Role.RESTAURANT_STAFF) {
    throw new DriverNotOnStaffError();
  }

  const busyCount = await countActiveAssignmentsForDriver(driverId, fulfillment.id);
  if (busyCount > 0) {
    throw new DriverAlreadyBusyError();
  }

  // Captured before the upsert overwrites it — if this fulfillment already
  // had a *different*, still-active driver assigned, that driver needs to
  // be told the job is no longer theirs (Sprint 07.7 H-8), since the
  // upsert below silently replaces their row otherwise.
  const existingAssignment = await prisma.driverAssignment.findUnique({ where: { fulfillmentId: fulfillment.id } });
  const previousDriverId =
    existingAssignment &&
    existingAssignment.driverId !== driverId &&
    BUSY_DRIVER_ASSIGNMENT_STATUSES.includes(existingAssignment.status)
      ? existingAssignment.driverId
      : undefined;

  const offerExpiresAt = new Date(Date.now() + OFFER_TIMEOUT_MS);
  const assignment = await prisma.driverAssignment.upsert({
    where: { fulfillmentId: fulfillment.id },
    create: {
      fulfillmentId: fulfillment.id,
      driverId,
      status: DriverAssignmentStatus.OFFERED,
      offerExpiresAt,
    },
    update: {
      driverId,
      status: DriverAssignmentStatus.OFFERED,
      acceptedAt: null,
      offerExpiresAt,
    },
  });

  // Best-effort — a notification failure must never prevent the
  // assignment itself from being considered successfully created
  // (Sprint 07.6 C-10, mirroring the C-2/C-15 post-success pattern).
  if (driver.phone) {
    try {
      const orderNumber = await orderNumberForFulfillment(fulfillment.id);
      await sendDriverAssignmentOfferNotification(fulfillment.orderId, restaurantId, driver.phone, orderNumber);
    } catch (err) {
      logger.error({ err }, "assignDriver: driver offer notification failed");
      errorTracker.captureException(err);
    }
  }

  if (previousDriverId) {
    try {
      const previousDriver = await prisma.user.findUnique({ where: { id: previousDriverId } });
      if (previousDriver?.phone) {
        const orderNumber = await orderNumberForFulfillment(fulfillment.id);
        await sendDriverReassignedAwayNotification(fulfillment.orderId, restaurantId, previousDriver.phone, orderNumber);
      }
    } catch (err) {
      logger.error({ err }, "assignDriver: driver reassignment notification failed");
      errorTracker.captureException(err);
    }
  }

  return assignment;
}

async function orderNumberForFulfillment(fulfillmentId: string): Promise<number> {
  const fulfillment = await prisma.fulfillment.findUniqueOrThrow({
    where: { id: fulfillmentId },
    include: { order: true },
  });
  return fulfillment.order.orderNumber;
}

async function findOwnDriverAssignment(driverId: string, driverAssignmentId: string): Promise<DriverAssignment> {
  const assignment = await prisma.driverAssignment.findUnique({ where: { id: driverAssignmentId } });
  if (!assignment || assignment.driverId !== driverId) {
    throw new DriverAssignmentNotFoundError();
  }
  return assignment;
}

export async function respondToAssignment(
  driverId: string,
  driverAssignmentId: string,
  accept: boolean,
): Promise<DriverAssignment> {
  const assignment = await findOwnDriverAssignment(driverId, driverAssignmentId);
  return prisma.driverAssignment.update({
    where: { id: assignment.id },
    data: accept
      ? { status: DriverAssignmentStatus.ACCEPTED, acceptedAt: new Date() }
      : { status: DriverAssignmentStatus.DECLINED },
  });
}

export async function getDriverAssignmentByFulfillment(fulfillmentId: string): Promise<DriverAssignment | null> {
  return prisma.driverAssignment.findUnique({ where: { fulfillmentId } });
}

/** The driver app's own queue — this restaurant's non-terminal assignments for the calling staff member. */
export async function listMyDriverAssignments(restaurantId: string, driverId: string) {
  return prisma.driverAssignment.findMany({
    where: {
      driverId,
      status: { in: BUSY_DRIVER_ASSIGNMENT_STATUSES },
      fulfillment: { restaurantId, status: { notIn: TERMINAL_FULFILLMENT_STATUSES } },
    },
    include: { fulfillment: { include: { order: true } } },
    orderBy: { assignedAt: "asc" },
  });
}

/**
 * Writes an append-only history row (DriverLocationPing) and the
 * denormalized "current position" fields on DriverAssignment in the same
 * call — both must stay in sync (§2 schema note).
 */
export async function recordLocationPing(
  driverAssignmentId: string,
  lat: number,
  lng: number,
): Promise<DriverAssignment> {
  const assignment = await prisma.driverAssignment.findUnique({ where: { id: driverAssignmentId } });
  if (!assignment) {
    throw new DriverAssignmentNotFoundError();
  }

  const recordedAt = new Date();
  const [, updated] = await prisma.$transaction([
    prisma.driverLocationPing.create({ data: { driverAssignmentId, lat, lng, recordedAt } }),
    prisma.driverAssignment.update({
      where: { id: driverAssignmentId },
      data: { currentLat: lat, currentLng: lng, lastLocationAt: recordedAt },
    }),
  ]);
  return updated;
}

/**
 * Count of DriverAssignments currently "busy" (OFFERED/ACCEPTED/EN_ROUTE)
 * for this restaurant's active (non-terminal) Fulfillments. Exposed for
 * the Smart Routing Engine's busy-driver concurrency check (§7) — a
 * different module built separately.
 */
export async function countActiveDriverAssignments(restaurantId: string): Promise<number> {
  return prisma.driverAssignment.count({
    where: {
      status: { in: BUSY_DRIVER_ASSIGNMENT_STATUSES },
      fulfillment: {
        restaurantId,
        status: { notIn: TERMINAL_FULFILLMENT_STATUSES },
      },
    },
  });
}

interface ExpiredAssignmentRow {
  id: string;
  fulfillmentId: string;
  driverId: string;
  orderId: string;
  restaurantId: string;
}

/**
 * Transitions every OFFERED assignment whose offer has timed out to
 * EXPIRED, and alerts staff via an OrderEvent that the fulfillment needs
 * manual reassignment (Sprint 07.6 C-11). Intended to run on an interval —
 * see stale-offer-scheduler.ts. Never throws for an individual row failure;
 * one bad row does not stop the sweep from processing the rest.
 *
 * Multi-instance-safe as of Production Hardening Phase 6: claiming and
 * expiring happen in one atomic `UPDATE ... FROM ... RETURNING` statement,
 * whose subquery uses `FOR UPDATE SKIP LOCKED` so concurrently-running
 * sweeps each claim a disjoint set of rows. Unlike outbox-worker.ts's
 * claim-then-dispatch shape, no separate held transaction is needed here:
 * the claim *is* the state transition (OFFERED -> EXPIRED) — by the time
 * this statement returns, the returned rows are already durably EXPIRED
 * and cannot be re-claimed by a concurrent sweep, whether or not the
 * per-row event-recording loop below succeeds for all of them.
 */
export async function expireStaleOffers(): Promise<{ expiredCount: number }> {
  const expired = await prisma.$queryRaw<ExpiredAssignmentRow[]>`
    UPDATE "DriverAssignment" AS da
    SET status = 'EXPIRED', "updatedAt" = now()
    FROM "Fulfillment" AS f
    WHERE da.id IN (
      SELECT id FROM "DriverAssignment"
      WHERE status = 'OFFERED' AND "offerExpiresAt" < now()
      FOR UPDATE SKIP LOCKED
    )
    AND f.id = da."fulfillmentId"
    RETURNING da.id, da."fulfillmentId", da."driverId", f."orderId", f."restaurantId"
  `;

  let expiredCount = 0;
  for (const assignment of expired) {
    try {
      await writeOrderEvent({
        orderId: assignment.orderId,
        restaurantId: assignment.restaurantId,
        type: "DRIVER_OFFER_EXPIRED",
        payload: { fulfillmentId: assignment.fulfillmentId, driverId: assignment.driverId },
      });
      emitOrderEvent({
        orderId: assignment.orderId,
        restaurantId: assignment.restaurantId,
        type: "DRIVER_OFFER_EXPIRED",
        payload: { fulfillmentId: assignment.fulfillmentId, driverId: assignment.driverId },
      });
      expiredCount += 1;
    } catch (err) {
      logger.error({ err, assignmentId: assignment.id }, "expireStaleOffers: failed to record expiry event");
      errorTracker.captureException(err, { assignmentId: assignment.id });
    }
  }

  return { expiredCount };
}
