import { getVerticalProfile } from "../../branding/vertical-profiles";
import { siteDefinitionSchema, type SiteDefinition } from "../../types";
import type { StorefrontAssets } from "../imagery/asset-planner";
import type { StorefrontCopy } from "../content/copy-writer";
import type { BusinessUnderstanding, StorefrontPlan } from "../contracts";

/**
 * Generation V2 — definition compiler (P2).
 *
 * StorefrontPlan (+ copy + this storefront's own assets) → SiteDefinition
 * schemaVersion 2: theme-free (no themeKey, no styleFamily), carrying its
 * complete visual identity in brandSettings/typography and its structure in
 * the planned pages. The renderer draws it through the theme carrier.
 */

export interface CompileDefinitionInput {
  understanding: BusinessUnderstanding;
  plan: StorefrontPlan;
  copy: StorefrontCopy;
  assets?: StorefrontAssets;
  /** The direction's own adjectives — surfaced (screened) as the picker's personality line. */
  personality?: string[];
}

/** Words that must never surface as customer-facing personality descriptors. */
const BANNED_DESCRIPTOR = /\b(theme|template|variation|identity|brief|archetype|style|premium|modern|luxury|local|minimal)\b/i;

/** "bold, elegant, timeless" → "Bold. Elegant. Timeless." (banned words dropped). */
function displayPersonality(adjectives: string[]): string | undefined {
  const words = adjectives
    .map((a) => a.trim().split(/\s+/)[0])
    .filter((a) => a.length > 2 && !BANNED_DESCRIPTOR.test(a))
    .slice(0, 3)
    .map((a) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase());
  return words.length > 0 ? `${words.join(". ")}.` : undefined;
}

export function compileDefinition(input: CompileDefinitionInput): SiteDefinition {
  const { understanding: u, plan, copy, assets } = input;
  const vocabulary = getVerticalProfile(u.identity.resolvedVertical).vocabulary;

  return siteDefinitionSchema.parse({
    schemaVersion: 2,
    restaurantName: u.identity.name,
    tagline: copy.tagline,
    cuisine: u.identity.positioning.slice(0, 60) || u.identity.resolvedVertical.toLowerCase(),
    businessType: u.identity.resolvedVertical,
    colorSeed: plan.tokens.primaryColor,
    typography: { display: plan.tokens.headingFont, body: plan.tokens.bodyFont },
    facts: {
      restaurantName: u.identity.name,
      address: plan.pages.find((p) => p.slug === "/contact")?.sections.find((s) => s.type === "contactInfo")?.props.address as string | undefined,
      phone: plan.pages.find((p) => p.slug === "/contact")?.sections.find((s) => s.type === "contactInfo")?.props.phone as string | undefined,
      hasOnlineOrdering: u.services.pickup || u.services.delivery,
      hasReservations: u.services.reservations,
    },
    brandSettings: {
      primaryColor: plan.tokens.primaryColor,
      accentColor: plan.tokens.accentColor,
      backgroundColor: plan.tokens.backgroundColor,
      textColor: plan.tokens.textColor,
      headingFont: plan.tokens.headingFont,
      bodyFont: plan.tokens.bodyFont,
      buttonStyle: plan.tokens.buttonStyle,
      borderRadius: plan.tokens.borderRadius,
      shadowIntensity: plan.tokens.shadowIntensity,
      contentSpacing: plan.tokens.contentSpacing,
    },
    // The reference experience: storefronts carry NO page-link header
    // (no Home/Menu/About words) — just the brand and the order action.
    header: { headerLayout: "minimal", showSearch: false, showCart: false, showAccount: false, showOrderButton: true },
    displayPersonality: displayPersonality(input.personality ?? []),
    // Vertical-correct language everywhere; the brief's conversion strategy
    // owns the primary CTA (chrome + hero + banners read this).
    vocabulary: { ...vocabulary, primaryCta: plan.vocabulary.primaryCta },
    aiAssets: assets ? { heroUrl: assets.heroUrl, categoryImages: assets.categoryImages, productImages: assets.productImages } : undefined,
    generation: { engine: "v2", briefId: plan.briefId },
    pages: plan.pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      metaDescription: page.metaDescription,
      sections: page.sections.map((s) => ({ type: s.type, variant: s.variant, props: s.props })),
    })),
  });
}
