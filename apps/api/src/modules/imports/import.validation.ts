import { ImportSourceType } from "@prisma/client";
import { z } from "zod";

export const createImportSchema = z.object({
  sourceType: z.enum(ImportSourceType),
  sourceUrl: z.url().optional(),
});

export type CreateImportInput = z.infer<typeof createImportSchema>;
