import { getVerticalProfile } from "../../branding/vertical-profiles";
import { filterSectionsByAvailability } from "../../section-rules";
import { buildMetaDescription, buildPageTitle, guessCityFromAddress } from "../../seo";
import type { IngestData, MenuItemSummary, SectionType } from "../../types";
import type { StorefrontCopy } from "../content/copy-writer";
import { availableSections } from "../briefs/capabilities";
import { storefrontPlanSchema, type BusinessUnderstanding, type CreativeBrief, type StorefrontPlan } from "../contracts";

/**
 * Generation V2 — the storefront planner (P2).
 *
 * Resolves ONE brief into a concrete, renderable page program. There are no
 * section recipes here: the home sequence comes from the BRIEF's own
 * structure (which the generator invented for this business), then reality is
 * applied — sections the business has no data for are dropped, sections its
 * services/compliance require are added (age gate for nicotine verticals),
 * and the conversion strategy decides where the CTA banner sits. Two briefs
 * with different structures produce genuinely different page programs.
 */

/** Sections that render live commerce data and self-omit without it — kept out
 * of generated plans so a brand-new business never shows an empty band. */
const LIVE_DATA_SECTIONS = new Set(["bestSellers", "offers", "loyalty", "reviews", "appPromotion", "newsletter"]);

const AGE_GATED_VERTICALS = new Set(["VAPE_SHOP"]);

function groupMenuByCategory(menu: MenuItemSummary[]) {
  const order: string[] = [];
  const byCategory = new Map<string, { name: string; description?: string; priceCents: number }[]>();
  for (const item of menu) {
    if (!byCategory.has(item.categoryName)) {
      order.push(item.categoryName);
      byCategory.set(item.categoryName, []);
    }
    byCategory.get(item.categoryName)!.push({ name: item.name, description: item.description, priceCents: item.priceCents });
  }
  return order.map((name) => ({ name, items: byCategory.get(name)! }));
}

function pickSignatureItems(menu: MenuItemSummary[]) {
  const seen = new Set<string>();
  const picks: MenuItemSummary[] = [];
  for (const item of menu) {
    if (seen.has(item.categoryName)) continue;
    seen.add(item.categoryName);
    picks.push(item);
    if (picks.length >= 6) break;
  }
  return picks.map(({ name, description, priceCents }) => ({ name, description, priceCents }));
}

function sectionProps(
  type: SectionType,
  brief: CreativeBrief,
  copy: StorefrontCopy,
  u: BusinessUnderstanding,
  ingest: IngestData,
): { variant?: string; props: Record<string, unknown> } {
  switch (type) {
    case "hero":
      return {
        variant: brief.heroConcept.composition,
        props: { headline: copy.heroHeadline, subhead: copy.heroSubhead, ctaLabel: brief.conversionStrategy.primaryCta },
      };
    case "featuredProducts":
      return { props: { title: copy.featuredTitle, eyebrow: copy.featuredEyebrow } };
    case "featuredCategories":
      return { props: { title: copy.featuredTitle, eyebrow: copy.featuredEyebrow } };
    case "signatureDishes":
      return { props: { intro: copy.signatureIntro, items: pickSignatureItems(ingest.menu) } };
    case "aboutTeaser":
      return { props: { excerpt: copy.aboutStory.slice(0, 280), linkTo: "/about" } };
    case "aboutStory":
      return { props: { story: copy.aboutStory } };
    case "gallery":
      return { props: { intro: copy.galleryIntro } };
    case "menu":
      return { variant: brief.productPresentation.layout, props: { categories: groupMenuByCategory(ingest.menu) } };
    case "ctaBanner":
      return { props: { label: copy.ctaBannerLabel } };
    case "hoursLocation":
      return { props: { address: ingest.address, phone: ingest.phone } };
    case "footer":
      return { props: { restaurantName: u.identity.name } };
    default:
      return { props: {} };
  }
}

export interface PlanStorefrontInput {
  understanding: BusinessUnderstanding;
  brief: CreativeBrief;
  copy: StorefrontCopy;
  ingest: IngestData;
}

export function planStorefront(input: PlanStorefrontInput): StorefrontPlan {
  const { understanding: u, brief, copy, ingest } = input;
  const registry = new Set(availableSections());
  const city = guessCityFromAddress(ingest.address);

  // 1. The BRIEF's invented structure is the starting sequence.
  let home = brief.structure.home.filter((s) => registry.has(s) && !LIVE_DATA_SECTIONS.has(s)) as SectionType[];
  if (home[0] !== "hero") home = ["hero" as SectionType, ...home.filter((s) => s !== "hero")];
  if (!home.includes("footer" as SectionType)) home = [...home, "footer" as SectionType];

  // 2. Reality filter: drop what the business has no data for.
  home = filterSectionsByAvailability(home, {
    hasMenuItems: ingest.menu.length > 0,
    hasPhotos: u.catalog.hasPhotos,
    hasHoursOrLocation: Boolean(ingest.address),
  });
  if (!u.catalog.hasPhotos) home = home.filter((s) => s !== "gallery");

  // 3. Conversion strategy places the CTA banner: a secondaryPath keeps it
  //    late (a closing ask); without one it reinforces mid-page.
  if (!home.includes("ctaBanner" as SectionType) && ingest.menu.length > 0) {
    const at = brief.conversionStrategy.secondaryPath ? home.length - 1 : Math.min(3, home.length - 1);
    home = [...home.slice(0, at), "ctaBanner" as SectionType, ...home.slice(at)];
  }

  // 4. Compliance is non-negotiable per vertical, never per design.
  if (AGE_GATED_VERTICALS.has(u.identity.resolvedVertical) && !home.includes("ageGate" as SectionType)) {
    home = ["ageGate" as SectionType, ...home];
  }

  const homeSections = home.map((type) => {
    const { variant, props } = sectionProps(type, brief, copy, u, ingest);
    return { type: type as string, variant, props };
  });

  const profile = getVerticalProfile(u.identity.resolvedVertical);
  const catalogNoun = profile.vocabulary.catalogNoun;

  const pages: StorefrontPlan["pages"] = [
    {
      slug: "/",
      title: buildPageTitle("Home", u.identity.name, ingest.description || u.identity.resolvedVertical.toLowerCase(), city),
      metaDescription: buildMetaDescription(copy.tagline, u.identity.positioning, city),
      sections: homeSections,
    },
    {
      slug: "/menu",
      title: buildPageTitle(catalogNoun, u.identity.name, u.identity.positioning, city),
      metaDescription: buildMetaDescription(`${u.identity.name}'s full ${catalogNoun.toLowerCase()}.`, u.identity.positioning, city),
      sections: [
        { type: "menu", variant: brief.productPresentation.layout, props: { categories: groupMenuByCategory(ingest.menu) } },
        { type: "footer", props: { restaurantName: u.identity.name } },
      ],
    },
    {
      slug: "/about",
      title: buildPageTitle("About", u.identity.name, u.identity.positioning, city),
      metaDescription: buildMetaDescription(`The story behind ${u.identity.name}.`, u.identity.positioning, city),
      sections: [
        { type: "aboutStory", props: { story: copy.aboutStory } },
        { type: "footer", props: { restaurantName: u.identity.name } },
      ],
    },
    {
      slug: "/contact",
      title: buildPageTitle("Contact", u.identity.name, u.identity.positioning, city),
      metaDescription: buildMetaDescription(`Get in touch with ${u.identity.name}.`, u.identity.positioning, city),
      sections: [
        { type: "contactInfo", props: { address: ingest.address, phone: ingest.phone } },
        { type: "contactForm", props: {} },
        { type: "footer", props: { restaurantName: u.identity.name } },
      ],
    },
  ];

  return storefrontPlanSchema.parse({
    schemaVersion: 1,
    briefId: brief.id,
    pages,
    tokens: {
      headingFont: brief.typography.display,
      bodyFont: brief.typography.body,
      primaryColor: brief.colorLogic.brand,
      accentColor: brief.colorLogic.accent,
      backgroundColor: brief.colorLogic.ground.hex,
      textColor: brief.colorLogic.ink,
      buttonStyle: brief.shape.buttonStyle,
      borderRadius: brief.shape.borderRadius,
      shadowIntensity: brief.shape.shadowIntensity,
      contentSpacing: "spacious",
    },
    vocabulary: {
      catalogNoun: profile.vocabulary.catalogNoun,
      itemPlural: profile.vocabulary.itemPlural,
      primaryCta: brief.conversionStrategy.primaryCta,
    },
  });
}
