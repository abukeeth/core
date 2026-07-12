import { NotificationChannel } from "@prisma/client";
import type { NotificationProviderAdapter, SendNotificationInput, SendNotificationResult } from "../types";

/** Stub — see sms.provider.ts for the shared soft-failure rationale. */
export class PushNotificationProviderAdapter implements NotificationProviderAdapter {
  readonly channel = NotificationChannel.PUSH;
  readonly implemented = false;

  async send(_input: SendNotificationInput): Promise<SendNotificationResult> {
    return { success: false, errorMessage: "Push notifications are not yet implemented" };
  }
}
