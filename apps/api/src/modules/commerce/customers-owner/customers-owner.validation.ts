import { z } from "zod";

export const customerListSchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(200),
});

export type CustomerListInput = z.infer<typeof customerListSchema>;
