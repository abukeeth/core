import type { NotificationChannel } from "@prisma/client";
import { EmailNotificationProviderAdapter } from "./providers/email.provider";
import { PushNotificationProviderAdapter } from "./providers/push.provider";
import { SmsNotificationProviderAdapter } from "./providers/sms.provider";
import type { NotificationProviderAdapter } from "./types";

class NotificationProviderRegistry {
  private readonly adapters = new Map<NotificationChannel, NotificationProviderAdapter>();

  register(adapter: NotificationProviderAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  get(channel: NotificationChannel): NotificationProviderAdapter | undefined {
    return this.adapters.get(channel);
  }
}

export const notificationProviderRegistry = new NotificationProviderRegistry();

notificationProviderRegistry.register(new EmailNotificationProviderAdapter());
notificationProviderRegistry.register(new SmsNotificationProviderAdapter());
notificationProviderRegistry.register(new PushNotificationProviderAdapter());
