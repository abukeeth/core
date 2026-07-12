import type { ImportSourceType } from "@prisma/client";
import { z } from "zod";

export interface FileImportInput {
  kind: "file";
  buffer: Buffer;
  mimeType: string;
}

export interface UrlImportInput {
  kind: "url";
  url: string;
}

/**
 * What an adapter receives. File-based sources (PDF, Image) get a buffer;
 * URL-based sources (Website, Google Maps, DoorDash, Uber Eats, Grubhub)
 * get a URL. Each adapter owns however it turns this into ExtractedMenuData.
 */
export type ImportSourceInput = FileImportInput | UrlImportInput;

export const extractedMenuDataSchema = z.object({
  categories: z.array(
    z.object({
      name: z.string().min(1),
      items: z.array(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          priceCents: z.number().int().nonnegative(),
          // 0-1. AI-extracted items (vision/text) carry the model's own
          // confidence when available; deterministic sources (CSV) set
          // this from how cleanly a row parsed. Absent means "not scored"
          // (e.g. older jobs, or a source that doesn't score at all) —
          // the review UI treats missing the same as fully confident.
          confidence: z.number().min(0).max(1).optional(),
        }),
      ),
    }),
  ),
  // Optional business-profile fields a source may surface alongside (or
  // instead of) menu items — e.g. Website/Google Maps. Named generically
  // rather than "restaurant profile" so the import engine's data shape
  // isn't tied to one business type.
  businessProfile: z
    .object({
      name: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      // Weekday-ordered display strings (e.g. "Monday: 9:00 AM - 9:00 PM"),
      // matching the shape Google's Places API already returns them in —
      // stored as-is rather than parsed into structured open/close times,
      // since this only ever feeds a human review screen, not scheduling.
      hours: z.array(z.string()).optional(),
      logoUrl: z.string().optional(),
      socialLinks: z
        .array(
          z.object({
            platform: z.string(),
            url: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type ExtractedMenuData = z.infer<typeof extractedMenuDataSchema>;

/**
 * The single extensibility seam: every import source, present or future,
 * implements this interface. The registry looks adapters up by sourceType;
 * nothing else in the request path branches on source type.
 *
 * `implemented` lets the controller return a synchronous 501 for
 * not-yet-built sources without ever hardcoding a list of which ones —
 * it just checks the flag the registered adapter reports.
 *
 * `inputKind` lets the controller decide whether to require a file
 * upload or a `sourceUrl` field, again without hardcoding a per-source
 * list — it just reads what the registered adapter declares it needs.
 */
export interface ImportAdapter {
  readonly sourceType: ImportSourceType;
  readonly implemented: boolean;
  readonly inputKind: "file" | "url";
  extract(input: ImportSourceInput): Promise<ExtractedMenuData>;
}
