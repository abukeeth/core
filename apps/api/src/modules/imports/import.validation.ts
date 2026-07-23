import { ImportSourceType } from "@prisma/client";
import { z } from "zod";

export const createImportSchema = z.object({
  sourceType: z.enum(ImportSourceType),
  sourceUrl: z.url().optional(),
});

export type CreateImportInput = z.infer<typeof createImportSchema>;

// Onboarding V3 — the "Create Your Business" screen posts files as multipart
// plus optional URL text fields. Multipart text fields arrive as strings, so an
// empty field is normalized to undefined before URL validation.
const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const consolidatedImportSchema = z.object({
  websiteUrl: z.preprocess(emptyToUndefined, z.url().optional()),
  googleMapsUrl: z.preprocess(emptyToUndefined, z.url().optional()),
});

export type ConsolidatedImportInput = z.infer<typeof consolidatedImportSchema>;
