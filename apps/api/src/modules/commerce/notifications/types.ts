import type { NotificationChannel, NotificationType } from "@prisma/client";

export interface SendNotificationInput {
  type: NotificationType;
  /** Email address, phone number, or push token, depending on channel. */
  to: string;
  subject?: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SendNotificationResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

/**
 * The single extensibility seam for notification channels. EMAIL is
 * implemented in Sprint 07; SMS and PUSH are registered stubs
 * (`implemented: false`) so NotificationLog and this interface are
 * proven now without a future migration.
 */
export interface NotificationProviderAdapter {
  readonly channel: NotificationChannel;
  readonly implemented: boolean;
  send(input: SendNotificationInput): Promise<SendNotificationResult>;
}
