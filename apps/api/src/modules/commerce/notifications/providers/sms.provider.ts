import { NotificationChannel } from "@prisma/client";
import { getNumberEnv, getOptionalEnv } from "../../../../config/env";
import { createLogger } from "../../../../lib/logger";
import type { NotificationProviderAdapter, SendNotificationInput, SendNotificationResult } from "../types";

/**
 * Real implementation — Twilio SMS via the REST API (no SDK dependency; a
 * single form-encoded POST). Used for driver-offer notifications and the
 * kitchen "order not accepted in time" fallback alert.
 *
 * Like the email provider, this is always `implemented` and resolves its
 * credentials at send time: when Twilio isn't configured it returns a soft
 * failure (never throws), so enabling SMS is purely an environment change
 * (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER) with no code or
 * flag flip. sendNotification() records every attempt in NotificationLog.
 */
export class SmsNotificationProviderAdapter implements NotificationProviderAdapter {
  readonly channel = NotificationChannel.SMS;
  readonly implemented = true;
  private readonly logger = createLogger("sms-provider");

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    const accountSid = getOptionalEnv("TWILIO_ACCOUNT_SID");
    const authToken = getOptionalEnv("TWILIO_AUTH_TOKEN");
    const fromNumber = getOptionalEnv("TWILIO_FROM_NUMBER");
    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: false,
        errorMessage: "SMS is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)",
      };
    }

    const startedAt = Date.now();
    try {
      const body = new URLSearchParams({ To: input.to, From: fromNumber, Body: input.body });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(getNumberEnv("SMS_REQUEST_TIMEOUT_MS", 10_000)),
      });

      const payload = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!response.ok) {
        const errorMessage = payload.message ?? `Twilio responded with status ${response.status}`;
        this.logger.warn(
          { channel: this.channel, notificationType: input.type, durationMs: Date.now() - startedAt, success: false, errorMessage },
          "SMS provider send failed",
        );
        return { success: false, errorMessage };
      }

      this.logger.info(
        { channel: this.channel, notificationType: input.type, durationMs: Date.now() - startedAt, success: true },
        "SMS provider send completed",
      );
      return { success: true, providerMessageId: payload.sid };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown SMS send error";
      this.logger.warn(
        { channel: this.channel, notificationType: input.type, durationMs: Date.now() - startedAt, success: false, errorMessage },
        "SMS provider send failed",
      );
      return { success: false, errorMessage };
    }
  }
}
