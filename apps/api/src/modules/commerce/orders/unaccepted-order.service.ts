import { getNumberEnv } from "../../../config/env";
import { createLogger } from "../../../lib/logger";
import { prisma } from "../../../lib/prisma";
import { sendKitchenUnacceptedAlert } from "../notifications/notifications.service";

const logger = createLogger("unaccepted-order-alerts");
const BATCH_SIZE = 50;

/**
 * How long a CONFIRMED (paid, sitting in the kitchen queue) order may go
 * unaccepted before the owner is SMSed. Default 60s; overridable for tests /
 * tuning via KITCHEN_UNACCEPTED_ALERT_MS.
 */
export function unacceptedAlertThresholdMs(): number {
  return getNumberEnv("KITCHEN_UNACCEPTED_ALERT_MS", 60_000);
}

export interface UnacceptedSweepResult {
  alertedCount: number;
}

/**
 * One sweep of the "order not accepted in time" fallback.
 *
 * Finds CONFIRMED orders whose acceptance deadline has passed and that haven't
 * been alerted, then for each performs an ATOMIC claim
 * (`UPDATE … WHERE status='CONFIRMED' AND unacceptedAlertSentAt IS NULL`) before
 * sending. The claim is what makes this:
 *  - idempotent — the marker is set once, so the same order is never alerted twice;
 *  - multi-instance safe — only the instance whose UPDATE flips the row (count===1) sends;
 *  - self-cancelling — an order accepted (→ PREPARING) or cancelled before the
 *    deadline is no longer CONFIRMED, so it never matches and never alerts.
 */
export async function dispatchUnacceptedOrderAlerts(now: Date = new Date()): Promise<UnacceptedSweepResult> {
  const cutoff = new Date(now.getTime() - unacceptedAlertThresholdMs());

  const candidates = await prisma.order.findMany({
    where: {
      status: "CONFIRMED",
      confirmedAt: { lte: cutoff },
      unacceptedAlertSentAt: null,
    },
    select: {
      id: true,
      orderNumber: true,
      restaurantId: true,
      restaurant: { select: { phone: true } },
    },
    take: BATCH_SIZE,
  });

  let alertedCount = 0;
  for (const order of candidates) {
    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: "CONFIRMED", unacceptedAlertSentAt: null },
      data: { unacceptedAlertSentAt: now },
    });
    if (count !== 1) continue; // lost the claim (accepted, or another instance won)

    const phone = order.restaurant?.phone?.trim();
    if (!phone) {
      // Claimed anyway so the sweep doesn't reprocess it every tick; there's no
      // number to reach. The at-placement email staff-alert already fired.
      logger.warn({ orderId: order.id, restaurantId: order.restaurantId }, "unaccepted-order alert skipped: no restaurant phone on file");
      continue;
    }

    // sendKitchenUnacceptedAlert → sendNotification never throws and records a
    // NotificationLog row (SENT/FAILED) itself.
    await sendKitchenUnacceptedAlert(order.id, order.restaurantId, phone, order.orderNumber);
    alertedCount += 1;
  }

  return { alertedCount };
}
