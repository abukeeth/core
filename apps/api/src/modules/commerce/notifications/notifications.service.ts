import type { NotificationChannel, NotificationType } from "@prisma/client";
import { createLogger } from "../../../lib/logger";
import { prisma } from "../../../lib/prisma";
import { notificationProviderRegistry } from "./registry";
import type { SendNotificationResult } from "./types";

const logger = createLogger("notifications");

export interface SendNotificationParams {
  type: NotificationType;
  channel: NotificationChannel;
  to: string;
  subject?: string;
  body: string;
  orderId?: string;
  restaurantId?: string;
  customerId?: string;
}

/**
 * The main integration surface the orders/checkout module calls directly.
 * Never throws — a notification failure must never break the caller's
 * flow, mirroring the codebase's existing fire-and-forget
 * revalidatePublishedSite philosophy. Always writes a NotificationLog row
 * so gaps (including a disabled channel) are auditable. Returns the send
 * result so callers that need to know whether it actually went out (e.g.
 * an owner explicitly clicking "Resend verification email") can react —
 * most callers still fire-and-forget by simply not checking it.
 */
export async function sendNotification(params: SendNotificationParams): Promise<SendNotificationResult> {
  const adapter = notificationProviderRegistry.get(params.channel);

  if (!adapter?.implemented) {
    await prisma.notificationLog.create({
      data: {
        orderId: params.orderId,
        restaurantId: params.restaurantId,
        customerId: params.customerId,
        channel: params.channel,
        type: params.type,
        status: "SKIPPED_CHANNEL_DISABLED",
      },
    });
    return { success: false, errorMessage: `${params.channel} channel is not implemented` };
  }

  const result = await adapter.send({ type: params.type, to: params.to, subject: params.subject, body: params.body });

  await prisma.notificationLog.create({
    data: {
      orderId: params.orderId,
      restaurantId: params.restaurantId,
      customerId: params.customerId,
      channel: params.channel,
      type: params.type,
      status: result.success ? "SENT" : "FAILED",
      providerMessageId: result.providerMessageId,
      error: result.errorMessage,
    },
  });

  if (!result.success) {
    logger.warn({ channel: params.channel, type: params.type, errorMessage: result.errorMessage }, "Notification send failed");
  }

  return result;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Sent to the customer immediately after an order is placed and payment authorized. */
export async function sendOrderConfirmation(
  orderId: string,
  restaurantId: string,
  customerEmail: string,
  orderNumber: number,
  totalCents: number,
): Promise<void> {
  await sendNotification({
    type: "ORDER_CONFIRMATION",
    channel: "EMAIL",
    to: customerEmail,
    subject: `Order #${orderNumber} confirmed`,
    body: `Your order #${orderNumber} has been confirmed. Total: ${formatDollars(totalCents)}.`,
    orderId,
    restaurantId,
  });
}

/** Sent when the kitchen marks an order ready (pickup) or ready for handoff (delivery). */
export async function sendOrderReadyNotification(
  orderId: string,
  restaurantId: string,
  customerEmail: string,
  orderNumber: number,
): Promise<void> {
  await sendNotification({
    type: "ORDER_READY",
    channel: "EMAIL",
    to: customerEmail,
    subject: `Order #${orderNumber} is ready`,
    body: `Your order #${orderNumber} is ready.`,
    orderId,
    restaurantId,
  });
}

/** Sent when a delivery order leaves the restaurant. */
export async function sendOrderOutForDeliveryNotification(
  orderId: string,
  restaurantId: string,
  customerEmail: string,
  orderNumber: number,
): Promise<void> {
  await sendNotification({
    type: "ORDER_OUT_FOR_DELIVERY",
    channel: "EMAIL",
    to: customerEmail,
    subject: `Order #${orderNumber} is on its way`,
    body: `Your order #${orderNumber} is out for delivery.`,
    orderId,
    restaurantId,
  });
}

/** Sent when a delivery order is marked delivered or a pickup order is collected. */
export async function sendOrderDeliveredNotification(
  orderId: string,
  restaurantId: string,
  customerEmail: string,
  orderNumber: number,
): Promise<void> {
  await sendNotification({
    type: "ORDER_DELIVERED",
    channel: "EMAIL",
    to: customerEmail,
    subject: `Order #${orderNumber} delivered`,
    body: `Your order #${orderNumber} has been delivered. Enjoy!`,
    orderId,
    restaurantId,
  });
}

/** Sent when every payment provider candidate fails to authorize — prompts the customer to retry. */
export async function sendPaymentFailedNotification(
  orderId: string,
  restaurantId: string,
  customerEmail: string,
  orderNumber: number,
): Promise<void> {
  await sendNotification({
    type: "PAYMENT_FAILED",
    channel: "EMAIL",
    to: customerEmail,
    subject: `Payment failed for order #${orderNumber}`,
    body: `We couldn't process payment for order #${orderNumber}. Please try again with a different payment method.`,
    orderId,
    restaurantId,
  });
}

/** Sent when a refund (full or partial) is issued. */
export async function sendRefundIssuedNotification(
  orderId: string,
  restaurantId: string,
  customerEmail: string,
  orderNumber: number,
  amountCents: number,
): Promise<void> {
  await sendNotification({
    type: "REFUND_ISSUED",
    channel: "EMAIL",
    to: customerEmail,
    subject: `Refund issued for order #${orderNumber}`,
    body: `A refund of ${formatDollars(amountCents)} has been issued for order #${orderNumber}.`,
    orderId,
    restaurantId,
  });
}

/** Sent to restaurant staff the moment a new order is placed — closes the "missed order" gap flagged in the Sprint 06.5 audit. */
export async function sendNewOrderStaffAlert(
  orderId: string,
  restaurantId: string,
  staffEmail: string,
  orderNumber: number,
): Promise<void> {
  await sendNotification({
    type: "NEW_ORDER_STAFF_ALERT",
    channel: "EMAIL",
    to: staffEmail,
    subject: `New order #${orderNumber}`,
    body: `A new order #${orderNumber} has been placed.`,
    orderId,
    restaurantId,
  });
}

/** Sent to a driver the moment they're offered a new delivery (Sprint 07.6 C-10). SMS is the realistic channel for a driver who may not have the dashboard open. */
export async function sendDriverAssignmentOfferNotification(
  orderId: string,
  restaurantId: string,
  driverPhone: string,
  orderNumber: number,
): Promise<void> {
  await sendNotification({
    type: "DRIVER_ASSIGNMENT_OFFER",
    channel: "SMS",
    to: driverPhone,
    body: `You've been offered a new delivery for order #${orderNumber}. Open the app to accept or decline.`,
    orderId,
    restaurantId,
  });
}

/** Sent to the previously-assigned driver when a delivery is reassigned to someone else — closes the "job silently vanished" confusion (Sprint 07.7 H-8). */
export async function sendDriverReassignedAwayNotification(
  orderId: string,
  restaurantId: string,
  driverPhone: string,
  orderNumber: number,
): Promise<void> {
  await sendNotification({
    type: "DRIVER_REASSIGNED_AWAY",
    channel: "SMS",
    to: driverPhone,
    body: `Order #${orderNumber} has been reassigned to another driver and is no longer yours to deliver.`,
    orderId,
    restaurantId,
  });
}

/** Sent when a customer requests a password reset (Sprint 07.7 H-6) — no orderId/restaurantId context, just the customer's own identity. */
export async function sendPasswordResetEmail(customerId: string, customerEmail: string, resetLink: string): Promise<SendNotificationResult> {
  return sendNotification({
    type: "PASSWORD_RESET_REQUESTED",
    channel: "EMAIL",
    to: customerEmail,
    subject: "Reset your password",
    body: `Use the link below to reset your password. This link expires in 1 hour.\n\n${resetLink}`,
    customerId,
  });
}

/** Sent when a restaurant owner/staff account (the User table, distinct from Customer) requests a password reset (Sprint 18). */
export async function sendOwnerPasswordResetEmail(ownerEmail: string, resetLink: string): Promise<SendNotificationResult> {
  return sendNotification({
    type: "PASSWORD_RESET_REQUESTED",
    channel: "EMAIL",
    to: ownerEmail,
    subject: "Reset your password",
    body: `Use the link below to reset your password. This link expires in 1 hour.\n\n${resetLink}`,
  });
}

/** Sent to verify a restaurant owner/staff account's email address (Sprint 18). */
export async function sendEmailVerificationEmail(ownerEmail: string, verifyLink: string): Promise<SendNotificationResult> {
  return sendNotification({
    type: "EMAIL_VERIFICATION_REQUESTED",
    channel: "EMAIL",
    to: ownerEmail,
    subject: "Verify your email",
    body: `Use the link below to verify your email address. This link expires in 24 hours.\n\n${verifyLink}`,
  });
}
