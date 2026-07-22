import { z } from "zod";

export const notificationListSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type NotificationListInput = z.infer<typeof notificationListSchema>;
