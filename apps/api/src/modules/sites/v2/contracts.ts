import { z } from "zod";

/**
 * Generation V2 — data contracts (P0).
 *
 * The approved pipeline: Business source → BusinessUnderstanding → three
 * ORIGINAL CreativeBriefs → three independent StorefrontPlans → independent
 * copy & imagery → render → the customer chooses a storefront.
 *
 * HARD BOUNDARY (enforced by module-boundary.test.ts): nothing in `v2/` may
 * import the legacy theme system — theme-catalog, theme-matching,
 * identity-packs, assemble, the V1 generator, or style-family tone adaptation.
 * Briefs are INVENTED per business from its own data; they are never selected
 * from a catalog and never map to fixed archetypes.
 *
 * INTERNAL-ONLY VOCABULARY (product rule, locked): CreativeBriefs — and the
 * words "brief", "theme", "identity", "archetype", "style family" — are
 * internal generation tooling. The customer only ever sees complete
 * storefronts. No API response shaped for the storefront-selection UI and no
 * customer-facing copy may carry these concepts; `INTERNAL_ONLY_TERMS` below
 * is the canonical list the UI guard tests assert against.
 */

export const INTERNAL_ONLY_TERMS = ["theme", "identity", "brief", "archetype", "style family", "template", "variation"] as const;

// ---------------------------------------------------------------------------
// BusinessUnderstanding — everything V2 knows about the business, with the
// evidence for every inference. Built deterministically from real data.
// ---------------------------------------------------------------------------

export const evidenceSourceSchema = z.enum(["MENU", "PRICES", "PRODUCTS", "PHOTOS", "NAME", "DESCRIPTION", "URL", "GOOGLE", "SERVICES", "MANUAL"]);

export const evidenceSchema = z.object({
  claim: z.string().min(1),
  source: evidenceSourceSchema,
  /** 0..1 — how strongly the source supports the claim. */
  confidence: z.number().min(0).max(1),
});

export const understoodCategorySchema = z.object({
  name: z.string().min(1),
  itemCount: z.number().int().min(0),
  priceRangeCents: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  representativeItems: z.array(z.string().min(1)).max(6),
});

export const businessUnderstandingSchema = z.object({
  schemaVersion: z.literal(1),
  identity: z.object({
    name: z.string().min(1),
    resolvedVertical: z.string().min(1),
    positioning: z.string().min(1),
    priceTier: z.enum(["budget", "casual", "premium-casual", "premium", "mixed"]),
  }),
  catalog: z.object({
    categories: z.array(understoodCategorySchema).min(1),
    flagshipProducts: z.array(z.string().min(1)).max(8),
    menuBreadth: z.object({ categoryCount: z.number().int().min(0), itemCount: z.number().int().min(0) }),
    hasPhotos: z.boolean(),
  }),
  services: z.object({
    pickup: z.boolean(),
    delivery: z.boolean(),
    dineIn: z.boolean(),
    reservations: z.boolean(),
  }),
  sourceSignals: z.object({
    sourceType: z.enum(["menu-image", "pdf", "url", "google", "manual", "mixed", "unknown"]),
    description: z.string().optional(),
    locale: z.string().default("en"),
  }),
  /** Every non-obvious inference above must be backed by at least one entry here. */
  evidence: z.array(evidenceSchema).min(1),
});

export type BusinessUnderstanding = z.infer<typeof businessUnderstandingSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;

// ---------------------------------------------------------------------------
// CreativeBrief — one ORIGINAL design direction, invented for this business.
// Free-form creative fields; the only enumerations are physical renderer
// capabilities (which hero compositions/menu layouts/typefaces are actually
// loadable+renderable), never design archetypes.
// ---------------------------------------------------------------------------

/** The renderer's real hero compositions — a capability inventory, not styles. */
export const heroCompositionSchema = z.enum([
  "cinematic",
  "fullbleed-image",
  "bold-block",
  "split",
  "minimal-typographic",
  "editorial-split",
  "warm-frame",
]);

/** The renderer's real catalog presentation layouts. */
export const productLayoutSchema = z.enum(["two-column-elegant", "card-grid", "classic-list", "editorial-rows", "warm-cards", "bold-grid"]);

export const creativeBriefSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  centralIdea: z.string().min(1),
  targetCustomer: z.string().min(1),
  brandPersonality: z.array(z.string().min(1)).min(2).max(6),
  valueProposition: z.string().min(1),
  differentiator: z.string().min(1),
  copyVoice: z.object({
    voice: z.string().min(1),
    sampleHeadline: z.string().min(1),
    sampleCta: z.string().min(1),
  }),
  photography: z.object({
    treatment: z.string().min(1),
    lighting: z.string().min(1),
    backdrop: z.string().min(1),
    subjects: z.array(z.string().min(1)).min(1),
  }),
  typography: z.object({
    /** Must be renderer-loadable (validated against the web-fonts whitelist at plan time). */
    display: z.string().min(1),
    body: z.string().min(1),
  }),
  colorLogic: z.object({
    rationale: z.string().min(1),
    ground: z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), luminanceClass: z.enum(["dark", "light", "tinted"]) }),
    ink: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    brand: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  heroConcept: z.object({
    composition: heroCompositionSchema,
    headline: z.string().min(1),
    subhead: z.string().min(1),
    imageSubject: z.string().min(1),
  }),
  productPresentation: z.object({
    layout: productLayoutSchema,
    emphasis: z.string().min(1),
  }),
  conversionStrategy: z.object({
    primaryCta: z.string().min(1),
    trustSignals: z.array(z.string().min(1)).max(5),
    secondaryPath: z.string().optional(),
  }),
  structure: z.object({
    /** Ordered home sections, chosen freely from the renderer's registry. */
    home: z.array(z.string().min(1)).min(3),
  }),
});

export type CreativeBrief = z.infer<typeof creativeBriefSchema>;

// ---------------------------------------------------------------------------
// StorefrontPlan — one brief resolved against real data availability into a
// concrete, renderable page program. Compiles to SiteDefinition schemaVersion 2
// (no themeKey, no styleFamily).
// ---------------------------------------------------------------------------

export const plannedSectionSchema = z.object({
  type: z.string().min(1),
  variant: z.string().optional(),
  props: z.record(z.string(), z.unknown()).default({}),
});

export const storefrontPlanSchema = z.object({
  schemaVersion: z.literal(1),
  briefId: z.string().min(1),
  pages: z
    .array(
      z.object({
        slug: z.string().min(1),
        title: z.string().min(1),
        metaDescription: z.string().min(1),
        sections: z.array(plannedSectionSchema).min(1),
      }),
    )
    .min(1),
  tokens: z.object({
    headingFont: z.string().min(1),
    bodyFont: z.string().min(1),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    buttonStyle: z.enum(["rounded", "pill", "square"]),
    borderRadius: z.number().int().min(0).max(32),
    shadowIntensity: z.enum(["none", "soft", "medium", "strong"]),
    contentSpacing: z.enum(["compact", "comfortable", "spacious"]),
  }),
  vocabulary: z.object({
    catalogNoun: z.string().min(1),
    itemPlural: z.string().min(1),
    primaryCta: z.string().min(1),
  }),
});

export type StorefrontPlan = z.infer<typeof storefrontPlanSchema>;

// ---------------------------------------------------------------------------
// GeneratedAssetPlan — the imagery program: independent prompts per storefront
// (per-brief hero + category prompts). No storefront ever shares a hero.
// ---------------------------------------------------------------------------

export const imagePromptSchema = z.object({
  surface: z.enum(["hero", "category", "marketing"]),
  categoryName: z.string().optional(),
  prompt: z.string().min(1),
  negativePrompt: z.string().min(1),
  aspect: z.enum(["square", "landscape", "portrait"]),
  /** briefHash × grounding × surface — distinct per storefront by construction. */
  cacheKey: z.string().min(1),
});

export const generatedAssetPlanSchema = z.object({
  schemaVersion: z.literal(1),
  perStorefront: z
    .array(
      z.object({
        briefId: z.string().min(1),
        hero: imagePromptSchema,
        categoryImages: z.array(imagePromptSchema).max(8),
      }),
    )
    .min(1),
  budget: z.number().int().min(1),
});

export type GeneratedAssetPlan = z.infer<typeof generatedAssetPlanSchema>;
