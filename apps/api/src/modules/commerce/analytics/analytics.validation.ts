import { z } from "zod";

export const analyticsRangeSchema = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
});

export type AnalyticsRangeInput = z.infer<typeof analyticsRangeSchema>;

export const topItemsSchema = analyticsRangeSchema.extend({
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export type TopItemsInput = z.infer<typeof topItemsSchema>;
