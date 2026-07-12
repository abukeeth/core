import type { HoursDayOfWeek, RestaurantHours } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import type { HoursRowInput } from "./hours.validation";

export async function listHours(restaurantId: string): Promise<RestaurantHours[]> {
  return prisma.restaurantHours.findMany({
    where: { restaurantId },
    orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
  });
}

/**
 * Replace-all-for-restaurant semantics: the entire weekly schedule is
 * deleted and re-inserted in one transaction, mirroring how the owner
 * dashboard's hours editor submits the full week at once rather than
 * diffing individual rows.
 */
export async function setHours(restaurantId: string, rows: HoursRowInput[]): Promise<RestaurantHours[]> {
  return prisma.$transaction(async (tx) => {
    await tx.restaurantHours.deleteMany({ where: { restaurantId } });
    if (rows.length > 0) {
      await tx.restaurantHours.createMany({
        data: rows.map((row) => ({ restaurantId, ...row })),
      });
    }
    return tx.restaurantHours.findMany({
      where: { restaurantId },
      orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
    });
  });
}

// JS Date#getDay(): 0 = Sunday ... 6 = Saturday.
const DAY_BY_JS_INDEX: HoursDayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

/**
 * PURE — no DB access. Checked directly against an already-fetched
 * `RestaurantHours[]` array and a JS `Date`, evaluated in the server's
 * local timezone (this schema carries no restaurant-timezone field yet).
 * This is the function the checkout module imports directly for
 * scheduling validation (spec §3 step 2).
 */
export function isRestaurantOpenAt(hours: RestaurantHours[], at: Date): boolean {
  const dayOfWeek = DAY_BY_JS_INDEX[at.getDay()];
  const minutesSinceMidnight = at.getHours() * 60 + at.getMinutes();

  return hours.some(
    (row) =>
      !row.isClosed &&
      row.dayOfWeek === dayOfWeek &&
      minutesSinceMidnight >= row.opensAt &&
      minutesSinceMidnight < row.closesAt,
  );
}
