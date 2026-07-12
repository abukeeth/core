import { AssetKind } from "@prisma/client";
import { z } from "zod";
import { siteDefinitionSchema, suggestionSchema } from "./types";

export const updateSiteSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only")
    .optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateSiteBody = z.infer<typeof updateSiteSchema>;

/** Constrained editor (§12): partial updates to the draft's own SiteDefinition shape. */
export const patchDraftSchema = siteDefinitionSchema.partial();
export type PatchDraftBody = z.infer<typeof patchDraftSchema>;

/** Customization Studio (Sprint 20A Task 5) — a full, unsaved candidate definition to render for live preview, never persisted by this request. */
export const renderPreviewSchema = z.object({
  definition: siteDefinitionSchema,
  path: z.string().min(1).max(20).optional(),
});
export type RenderPreviewBody = z.infer<typeof renderPreviewSchema>;

export const applySuggestionSchema = suggestionSchema;

export const uploadAssetKindSchema = z.object({ kind: z.enum(AssetKind) });

export const updateAssetSchema = z.object({
  altText: z.string().max(300).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateAssetBody = z.infer<typeof updateAssetSchema>;

export const addDomainSchema = z.object({
  hostname: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, "Invalid hostname"),
});
export type AddDomainBody = z.infer<typeof addDomainSchema>;

export const contactMessageSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.email(),
  message: z.string().min(1).max(2000),
  // Honeypot: real users never see or fill this field in the UI.
  honeypot: z.string().max(200).optional(),
});
export type ContactMessageBody = z.infer<typeof contactMessageSchema>;

export const newsletterSubscribeSchema = z.object({
  email: z.email(),
  // Honeypot: real users never see or fill this field in the UI.
  honeypot: z.string().max(200).optional(),
});
export type NewsletterSubscribeBody = z.infer<typeof newsletterSubscribeSchema>;
