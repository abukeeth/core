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
    // Vertical-correct language everywhere; the brief's conversion strategy
    // owns the primary CTA (chrome + hero + banners read this).
    vocabulary: { ...vocabulary, primaryCta: plan.vocabulary.primaryCta },
    aiAssets: assets ? { heroUrl: assets.heroUrl, categoryImages: assets.categoryImages } : undefined,
    generation: { engine: "v2", briefId: plan.briefId },
    pages: plan.pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      metaDescription: page.metaDescription,
      sections: page.sections.map((s) => ({ type: s.type, variant: s.variant, props: s.props })),
    })),
  });
}
