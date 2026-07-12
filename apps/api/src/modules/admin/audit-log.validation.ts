import { z } from "zod";

export const listAuditLogSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type ListAuditLogInput = z.infer<typeof listAuditLogSchema>;
