import { computeCtaLabel } from "./cta";
import { filterSectionsByAvailability } from "./section-rules";
import { buildMetaDescription, buildPageTitle, guessCityFromAddress } from "./seo";
import type {
  BrandProfile,
  ContentCore,
  IngestData,
  MenuItemSummary,
  SectionBlock,
  SectionType,
  SiteDefinition,
  SiteFacts,
  SitePage,
  StyleFamilyValue,
  ThemeCatalogEntry,
} from "./types";

export interface AssembleInput {
  ingest: IngestData;
  brandProfile: BrandProfile;
  family: StyleFamilyValue;
  theme: ThemeCatalogEntry;
  content: ContentCore;
  colorSeed: string;
  /** ThemeFitResult.reasons from theme-matching.ts — surfaced as "why this design" in the Variation Picker. */
  designRationale?: string[];
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

/** One representative item per category, in menu order, capped at 6 (§4 "top items by category prominence"). */
function pickSignatureDishes(menu: MenuItemSummary[]) {
  const seenCategories = new Set<string>();
  const picks: MenuItemSummary[] = [];
  for (const item of menu) {
    if (seenCategories.has(item.categoryName)) continue;
    seenCategories.add(item.categoryName);
    picks.push(item);
    if (picks.length >= 6) break;
  }
  return picks.map(({ name, description, priceCents }) => ({ name, description, priceCents }));
}

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

function buildHomeSection(type: SectionType, input: AssembleInput, facts: SiteFacts): SectionBlock {
  switch (type) {
    case "hero":
      return {
        type,
        variant: input.theme.variants.hero[0],
        props: { headline: input.content.heroHeadline, subhead: input.content.heroSubhead, ctaLabel: computeCtaLabel(facts, input.family) },
      };
    case "signatureDishes":
      return { type, props: { intro: input.content.signatureDishesIntro, items: pickSignatureDishes(input.ingest.menu) } };
    case "aboutTeaser":
      return { type, props: { excerpt: truncate(input.content.aboutStory, 280), linkTo: "/about" } };
    case "hoursLocation":
      return { type, props: { address: input.ingest.address, phone: input.ingest.phone } };
    case "gallery":
      return { type, props: { intro: input.content.galleryIntro } };
    case "menu":
      return { type, variant: input.theme.variants.menuLayout[0], props: { categories: groupMenuByCategory(input.ingest.menu) } };
    case "ctaBanner":
      return { type, props: { label: computeCtaLabel(facts, input.family) } };
    case "footer":
      return { type, props: { restaurantName: input.ingest.restaurantName } };
    default:
      return { type, props: {} };
  }
}

function buildHomePage(input: AssembleInput, facts: SiteFacts, city: string | undefined): SitePage {
  const availability = {
    hasMenuItems: input.ingest.menu.length > 0,
    hasPhotos: input.ingest.photoCount > 0,
    hasHoursOrLocation: Boolean(input.ingest.address),
  };
  const order = filterSectionsByAvailability(input.theme.layouts.home, availability);
  return {
    slug: "/",
    title: buildPageTitle("Home", input.ingest.restaurantName, input.brandProfile.cuisine, city),
    metaDescription: buildMetaDescription(input.content.tagline, input.brandProfile.cuisine, city),
    sections: order.map((type) => buildHomeSection(type, input, facts)),
  };
}

function buildMenuPage(input: AssembleInput, city: string | undefined): SitePage {
  return {
    slug: "/menu",
    title: buildPageTitle("Menu", input.ingest.restaurantName, input.brandProfile.cuisine, city),
    metaDescription: buildMetaDescription(`${input.ingest.restaurantName}'s full menu.`, input.brandProfile.cuisine, city),
    sections: [
      { type: "menu", variant: input.theme.variants.menuLayout[0], props: { categories: groupMenuByCategory(input.ingest.menu) } },
      { type: "footer", props: { restaurantName: input.ingest.restaurantName } },
    ],
  };
}

function buildAboutPage(input: AssembleInput, city: string | undefined): SitePage {
  return {
    slug: "/about",
    title: buildPageTitle("About", input.ingest.restaurantName, input.brandProfile.cuisine, city),
    metaDescription: buildMetaDescription(`The story behind ${input.ingest.restaurantName}.`, input.brandProfile.cuisine, city),
    sections: [
      { type: "aboutStory", props: { story: input.content.aboutStory } },
      { type: "footer", props: { restaurantName: input.ingest.restaurantName } },
    ],
  };
}

function buildContactPage(input: AssembleInput, facts: SiteFacts, city: string | undefined): SitePage {
  return {
    slug: "/contact",
    title: buildPageTitle("Contact", input.ingest.restaurantName, input.brandProfile.cuisine, city),
    metaDescription: buildMetaDescription(`Get in touch with ${input.ingest.restaurantName}.`, input.brandProfile.cuisine, city),
    sections: [
      { type: "contactInfo", props: { address: facts.address, phone: facts.phone } },
      { type: "contactForm", props: {} },
      { type: "footer", props: { restaurantName: input.ingest.restaurantName } },
    ],
  };
}

function buildGalleryPage(input: AssembleInput, city: string | undefined): SitePage {
  return {
    slug: "/gallery",
    title: buildPageTitle("Gallery", input.ingest.restaurantName, input.brandProfile.cuisine, city),
    metaDescription: buildMetaDescription(input.content.galleryIntro, input.brandProfile.cuisine, city),
    sections: [
      { type: "gallery", props: { intro: input.content.galleryIntro } },
      { type: "footer", props: { restaurantName: input.ingest.restaurantName } },
    ],
  };
}

/**
 * Assembly stage (§2 stage 5): merges content + per-variation design
 * choices into one schema-validated SiteDefinition. Home page composition
 * runs through the rules engine (§4); Menu/About/Contact/Gallery always
 * include their core section so every variation always has all five pages
 * (acceptance criterion #1), even for a restaurant with a thin/empty menu.
 */
export function buildSiteDefinition(input: AssembleInput): SiteDefinition {
  const facts: SiteFacts = {
    restaurantName: input.ingest.restaurantName,
    address: input.ingest.address,
    phone: input.ingest.phone,
    hasOnlineOrdering: false,
    hasReservations: false,
  };
  const city = guessCityFromAddress(input.ingest.address);

  return {
    schemaVersion: 1,
    restaurantName: input.ingest.restaurantName,
    tagline: input.content.tagline,
    cuisine: input.brandProfile.cuisine,
    businessType: input.brandProfile.businessType,
    styleFamily: input.family,
    themeKey: input.theme.key,
    themeVersion: input.theme.version,
    colorSeed: input.colorSeed,
    typography: input.theme.tokens.typography,
    designRationale: input.designRationale,
    facts,
    pages: [
      buildHomePage(input, facts, city),
      buildMenuPage(input, city),
      buildAboutPage(input, city),
      buildContactPage(input, facts, city),
      buildGalleryPage(input, city),
    ],
  };
}
