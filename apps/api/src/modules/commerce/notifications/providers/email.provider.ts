import { NotificationChannel } from "@prisma/client";
import nodemailer from "nodemailer";
import { requireEnv } from "../../../../config/env";
import type { NotificationProviderAdapter, SendNotificationInput, SendNotificationResult } from "../types";

/**
 * Real implementation — SMTP transport via nodemailer. Transactional
 * order emails only (confirmation, ready, out-for-delivery, delivered,
 * payment failed, refund issued, new-order staff alert). Plain text,
 * no HTML templating library needed for Sprint 07.
 */
export class EmailNotificationProviderAdapter implements NotificationProviderAdapter {
  readonly channel = NotificationChannel.EMAIL;
  readonly implemented = true;

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    try {
      const transporter = nodemailer.createTransport({
        host: requireEnv("SMTP_HOST"),
        port: Number(requireEnv("SMTP_PORT")),
        auth: { user: requireEnv("SMTP_USER"), pass: requireEnv("SMTP_PASSWORD") },
      });

      const info = await transporter.sendMail({
        from: requireEnv("SMTP_FROM_ADDRESS"),
        to: input.to,
        subject: input.subject,
        text: input.body,
      });

      return { success: true, providerMessageId: info.messageId };
    } catch (err) {
      return { success: false, errorMessage: err instanceof Error ? err.message : "Unknown email send error" };
    }
  }
}
