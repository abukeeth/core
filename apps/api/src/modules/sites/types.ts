import { z } from "zod";

/**
 * Every renderable section a generated site can use. The Layout Engine's
 * component registry maps each of these to a component; unknown values
 * (e.g. from an older theme/definition version) degrade gracefully rather
 * than crashing the renderer — see layout-engine.ts.
 */
export const sectionTypeSchema = z.enum([
  "hero",
  "signatureDishes",
  // Sprint 20A Task 5 — Website Customization Studio additions. Each new
  // type has a real data source (see renderer/components/*.ts's doc
  // comments for exactly which): featuredCategories/featuredProducts read
  // the live menu like "menu" already does; bestSellers reads real order
  // history via analytics.service.ts's getTopItems; offers reads real
  // active Coupon rows; loyalty reads the real LoyaltyProgram row;
  // newsletter is a real, persisted signup capture. "reviews" and
  // "appPromotion" and "customTextImage" are owner-authored static content
  // (this data model has no customer-review or app-store-metadata source
  // to pull from — same documented gap "testimonials" already had; owner
  // typing the words in is the real, non-fabricated content here, not a
  // placeholder).
  "featuredCategories",
  "featuredProducts",
  "bestSellers",
  "offers",
  "aboutTeaser",
  "aboutStory",
  "hoursLocation",
  "testimonials",
  "reviews",
  "gallery",
  "loyalty",
  "appPromotion",
  "ctaBanner",
  "menu",
  "contactInfo",
  "contactForm",
  "newsletter",
  "customTextImage",
  "footer",
]);
export type SectionType = z.infer<typeof sectionTypeSchema>;

export const sectionBlockSchema = z.object({
  type: sectionTypeSchema,
  variant: z.string().optional(),
  props: z.record(z.string(), z.unknown()),
  // Section Management (Task 5 §5) — Hide keeps the block (and its props)
  // in the definition but skips it at render time; distinct from Remove,
  // which drops the array entry entirely. Defaults to visible (false/
  // absent) so every pre-Task-5 definition renders exactly as before.
  hidden: z.boolean().optional(),
});
export type SectionBlock = z.infer<typeof sectionBlockSchema>;

export const sitePageSchema = z.object({
  slug: z.enum(["/", "/menu", "/about", "/contact", "/gallery"]),
  title: z.string().min(1).max(70),
  metaDescription: z.string().min(1).max(160),
  sections: z.array(sectionBlockSchema).min(1),
});
export type SitePage = z.infer<typeof sitePageSchema>;

/**
 * Facts the LLM is never allowed to invent — copied verbatim from the
 * restaurant's own structured data. Prose is written *around* these values,
 * never as a substitute for them (§2 Guardrails).
 */
export const siteFactsSchema = z.object({
  restaurantName: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  hours: z.string().optional(),
  hasOnlineOrdering: z.boolean(),
  hasReservations: z.boolean(),
});
export type SiteFacts = z.infer<typeof siteFactsSchema>;

export const styleFamilySchema = z.enum(["LUXURY", "MODERN", "MINIMAL"]);
export type StyleFamilyValue = z.infer<typeof styleFamilySchema>;

// ---------------------------------------------------------------------------
// Website Customization Studio (Sprint 20A Task 5) — every field below is
// optional and every consumer (theme-css.ts, chrome.ts, footer.ts,
// menu-section.ts) falls back to the existing theme-derived default when
// absent, so every SiteDefinition persisted before this task still parses
// and renders identically (§9 "safe defaults for existing sites").
// ---------------------------------------------------------------------------

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color");

export const buttonStyleSchema = z.enum(["rounded", "pill", "square"]);
export type ButtonStyle = z.infer<typeof buttonStyleSchema>;

export const shadowIntensitySchema = z.enum(["none", "soft", "medium", "strong"]);
export type ShadowIntensity = z.infer<typeof shadowIntensitySchema>;

export const pageWidthSchema = z.enum(["narrow", "standard", "wide", "full"]);
export type PageWidth = z.infer<typeof pageWidthSchema>;

export const contentSpacingSchema = z.enum(["compact", "comfortable", "spacious"]);
export type ContentSpacing = z.infer<typeof contentSpacingSchema>;

export const brandSettingsSchema = z.object({
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  backgroundColor: hexColorSchema.optional(),
  textColor: hexColorSchema.optional(),
  headingFont: z.string().min(1).max(60).optional(),
  bodyFont: z.string().min(1).max(60).optional(),
  buttonStyle: buttonStyleSchema.optional(),
  borderRadius: z.number().min(0).max(32).optional(),
  shadowIntensity: shadowIntensitySchema.optional(),
  pageWidth: pageWidthSchema.optional(),
  contentSpacing: contentSpacingSchema.optional(),
});
export type BrandSettings = z.infer<typeof brandSettingsSchema>;

export const announcementBarSchema = z.object({
  enabled: z.boolean(),
  text: z.string().max(160).optional(),
  link: z.string().max(300).optional(),
});

export const headerSettingsSchema = z.object({
  logoPosition: z.enum(["left", "center"]).optional(),
  headerLayout: z.enum(["standard", "minimal", "centered"]).optional(),
  stickyHeader: z.boolean().optional(),
  announcementBar: announcementBarSchema.optional(),
  showSearch: z.boolean().optional(),
  showCart: z.boolean().optional(),
  showAccount: z.boolean().optional(),
  showOrderButton: z.boolean().optional(),
  mobileNavStyle: z.enum(["drawer", "bottomTabs"]).optional(),
});
export type HeaderSettings = z.infer<typeof headerSettingsSchema>;

export const socialLinkSchema = z.object({
  platform: z.enum(["instagram", "facebook", "tiktok", "x", "youtube", "website"]),
  url: z.string().min(1).max(300),
});
export type SocialLink = z.infer<typeof socialLinkSchema>;

export const legalLinkSchema = z.object({ label: z.string().min(1).max(60), url: z.string().min(1).max(300) });
export type LegalLink = z.infer<typeof legalLinkSchema>;

export const footerSettingsSchema = z.object({
  description: z.string().max(400).optional(),
  showContactInfo: z.boolean().optional(),
  socialLinks: z.array(socialLinkSchema).max(8).optional(),
  legalLinks: z.array(legalLinkSchema).max(8).optional(),
  showHours: z.boolean().optional(),
  newsletterEnabled: z.boolean().optional(),
  copyrightText: z.string().max(200).optional(),
});
export type FooterSettings = z.infer<typeof footerSettingsSchema>;

/**
 * Deliberately excludes "image ratio" and "dietary badges" from Task 5's
 * requested list — MenuItem has neither an image field nor a dietary-tag
 * field in this data model (menu-section.ts's own doc comment already
 * flags the latter gap). Adding those two toggles would be exactly the
 * "editable control disconnected from the real storefront" the task
 * explicitly forbids, since toggling either would change nothing visible.
 */
export const productPresentationSchema = z.object({
  categoryNavStyle: z.enum(["sticky", "simple"]).optional(),
  cardLayout: z.enum(["grid", "list"]).optional(),
  infoDensity: z.enum(["compact", "detailed"]).optional(),
  showModifiersBadge: z.boolean().optional(),
  priceStyle: z.enum(["standard", "bold", "minimal"]).optional(),
  outOfStockAppearance: z.enum(["dimmed", "hidden", "badge"]).optional(),
  addToCartStyle: z.enum(["button", "iconButton", "stepper"]).optional(),
});
export type ProductPresentation = z.infer<typeof productPresentationSchema>;

export const siteDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  restaurantName: z.string().min(1),
  tagline: z.string().min(1),
  cuisine: z.string().min(1),
  businessType: z.string().min(1),
  styleFamily: styleFamilySchema,
  themeKey: z.string().min(1),
  themeVersion: z.number().int().positive(),
  colorSeed: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "colorSeed must be a 6-digit hex color"),
  typography: z.object({ display: z.string().min(1), body: z.string().min(1) }),
  // Human-readable reasons the theme selector picked this design (from
  // ThemeFitResult.reasons in theme-matching.ts) — persisted here so the
  // Variation Picker can still show "why this design" after generation,
  // not just during it. Optional so hand-built definitions (e.g. in
  // tests) don't need to supply it.
  designRationale: z.array(z.string()).optional(),
  facts: siteFactsSchema,
  brandSettings: brandSettingsSchema.optional(),
  header: headerSettingsSchema.optional(),
  footer: footerSettingsSchema.optional(),
  productPresentation: productPresentationSchema.optional(),
  pages: z.array(sitePageSchema).min(1),
});
export type SiteDefinition = z.infer<typeof siteDefinitionSchema>;

// ---------------------------------------------------------------------------
// Brand Profile (§2b) — LLM-produced, so every field is schema-validated and
// carries a confidence score; low-confidence fields fall back to safe
// defaults upstream in brand-analysis.ts rather than trusting a weak guess.
// ---------------------------------------------------------------------------

export const brandPersonalitySchema = z.object({
  traditionalContemporary: z.number().min(0).max(1),
  casualFormal: z.number().min(0).max(1),
  playfulSerious: z.number().min(0).max(1),
  understatedBold: z.number().min(0).max(1),
  rusticPolished: z.number().min(0).max(1),
});
export type BrandPersonality = z.infer<typeof brandPersonalitySchema>;

export const brandProfileSchema = z.object({
  cuisine: z.string().min(1),
  businessType: z.string().min(1),
  priceTier: z.number().int().min(1).max(4),
  personality: brandPersonalitySchema,
  signalsUsed: z.array(z.string()),
  confidence: z.object({
    cuisine: z.number().min(0).max(1),
    businessType: z.number().min(0).max(1),
    priceTier: z.number().min(0).max(1),
    personality: z.number().min(0).max(1),
  }),
});
export type BrandProfile = z.infer<typeof brandProfileSchema>;

// ---------------------------------------------------------------------------
// Content generation
// ---------------------------------------------------------------------------

/** The single shared content core generated once per batch (§2 stage 4). */
export const contentCoreSchema = z.object({
  tagline: z.string().min(1),
  heroHeadline: z.string().min(1),
  heroSubhead: z.string().min(1),
  aboutStory: z.string().min(1),
  signatureDishesIntro: z.string().min(1),
  galleryIntro: z.string().min(1),
  ctaLabel: z.string().min(1),
});
export type ContentCore = z.infer<typeof contentCoreSchema>;

/** Same shape as ContentCore — a per-variation tone-adaptation rewrite. */
export const toneAdaptedCopySchema = contentCoreSchema;
export type ToneAdaptedCopy = z.infer<typeof toneAdaptedCopySchema>;

// ---------------------------------------------------------------------------
// Scoring (§2c)
// ---------------------------------------------------------------------------

export const scoreDimensionSchema = z.enum(["seo", "performance", "accessibility", "brandConsistency", "conversion"]);
export type ScoreDimension = z.infer<typeof scoreDimensionSchema>;

export const suggestionSchema = z.object({
  id: z.string(),
  dimension: scoreDimensionSchema,
  issue: z.string(),
  impact: z.enum(["high", "medium", "low"]),
  suggestion: z.string(),
  autoFixKind: z.enum(["missingAltText", "heroContrast", "missingMetaDescription"]).optional(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export interface DimensionScore {
  dimension: ScoreDimension;
  score: number;
  suggestions: Suggestion[];
}

export interface WebsiteScore {
  overall: number;
  seo: number;
  performance: number;
  accessibility: number;
  brandConsistency: number;
  conversion: number;
  suggestions: Suggestion[];
}

// ---------------------------------------------------------------------------
// Theme catalog (stored in the Theme table; this is the in-code shape of
// its JSON columns, mirrored 1:1 into the DB by the seed script)
// ---------------------------------------------------------------------------

export interface ThemeTokens {
  colorSeed: string;
  typography: { display: string; body: string };
  radius: "sharp" | "soft" | "rounded";
  motion: "none" | "subtle" | "energetic";
  typeScaleRatio: number;
}

export interface ThemeVariants {
  hero: ("fullbleed-image" | "split" | "minimal-typographic")[];
  menuLayout: ("classic-list" | "card-grid" | "two-column-elegant")[];
}

export interface ThemeLayouts {
  home: SectionType[];
}

export interface ThemeConstraints {
  minPhotos?: number;
}

export interface ThemeCatalogEntry {
  key: string;
  version: number;
  styleFamily: StyleFamilyValue;
  personalityVector: BrandPersonality;
  cuisineAffinities: Record<string, number>;
  constraints: ThemeConstraints;
  tokens: ThemeTokens;
  variants: ThemeVariants;
  layouts: ThemeLayouts;
}

// ---------------------------------------------------------------------------
// Ingest input — what the generator reads from existing Sprint 01-05 data
// ---------------------------------------------------------------------------

export interface MenuItemSummary {
  categoryName: string;
  name: string;
  description?: string;
  priceCents: number;
}

export interface IngestData {
  restaurantId: string;
  restaurantName: string;
  description?: string;
  address?: string;
  phone?: string;
  menu: MenuItemSummary[];
  photoCount: number;
  logoColorSeed?: string;
}

// ---------------------------------------------------------------------------
// Scoring context — summarized SiteAsset state, passed into the scorers
// without them needing direct DB access (keeps them pure and unit-testable).
// ---------------------------------------------------------------------------

export interface AssetSummary {
  totalPhotoAssets: number;
  altTextMissingCount: number;
  unprocessedRenditionsCount: number;
}

