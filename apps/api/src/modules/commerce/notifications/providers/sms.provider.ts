import { NotificationChannel } from "@prisma/client";
import type { NotificationProviderAdapter, SendNotificationInput, SendNotificationResult } from "../types";

/**
 * Stub — returns a soft failure (not a thrown error) so a caller that
 * optimistically tries all channels records SKIPPED_CHANNEL_DISABLED
 * rather than crashing.
 */
export class SmsNotificationProviderAdapter implements NotificationProviderAdapter {
  readonly channel = NotificationChannel.SMS;
  readonly implemented = false;

  async send(_input: SendNotificationInput): Promise<SendNotificationResult> {
    return { success: false, errorMessage: "SMS notifications are not yet implemented" };
  }
}
