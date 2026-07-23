import type { BrandKit } from "./branding/brand-kit";
import { computeCtaLabel } from "./cta";
import type { IdentityPack } from "./identity/identity-packs";
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
  /** Sprint 5.5 — the per-business Brand Kit. When present it OWNS color (palette
   * → brandSettings) and vocabulary; the theme contributes structure only. */
  brandKit?: BrandKit;
  /** Sprint 5.5 — once-generated impression image URLs (hero/category/marketing). */
  aiAssets?: { heroUrl?: string; categoryImages?: Record<string, string>; marketingUrl?: string };
  /** Identity Packs — the variation's complete brand identity (palette mood,
   * typography, layout persona, copy voice). When present it is applied ON TOP
   * of theme + Brand Kit, turning the three variations into three genuinely
   * different agencies. Omitted → byte-identical legacy output. */
  identity?: IdentityPack;
}

/**
 * Sprint 5.5 — the Brand Kit palette OWNS the storefront's color: its colors
 * override the theme's brandSettings colors, while the theme keeps structural
 * settings (button style, radius, spacing, fonts). Returns the theme's own
 * brandSettings untouched when there is no Brand Kit (byte-identical).
 */
function resolveBrandSettings(theme: ThemeCatalogEntry, brandKit?: BrandKit, identity?: IdentityPack) {
  const themeBrand = theme.presentation?.brandSettings;
  if (!brandKit) return themeBrand;
  const kitColors = {
    primaryColor: brandKit.palette.primary,
    secondaryColor: brandKit.palette.secondary ?? themeBrand?.secondaryColor,
    accentColor: brandKit.palette.accent,
    backgroundColor: brandKit.palette.background,
    textColor: brandKit.palette.text,
  };
  if (!identity) return { ...themeBrand, ...kitColors };
  // Identity Pack: re-stages the Brand Kit's hues into the identity's mood and
  // owns typography + structure, so each variation is a different agency —
  // not the same page re-colored.
  return {
    ...themeBrand,
    ...kitColors,
    ...identity.palette(brandKit.palette),
    ...identity.structure,
    headingFont: identity.typography.display,
    bodyFont: identity.typography.body,
  };
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

/**
 * Vertical-aware heading for the "signature" home section. Food businesses keep
 * "Signature Dishes"; retail-style businesses (vape/retail/convenience/grocery)
 * get "Featured Products"; cafés/bakeries/delis and anything else get the
 * neutral "Featured Items" — so a vape shop never reads "Signature Dishes".
 */
function featuredSectionTitle(businessType: string | undefined): string {
  switch (businessType) {
    case "RESTAURANT":
    case "PIZZA":
      return "Signature Dishes";
    case "VAPE_SHOP":
    case "RETAIL":
    case "CONVENIENCE_STORE":
    case "GROCERY":
      return "Featured Products";
    default:
      return "Featured Items";
  }
}

function buildHomeSection(type: SectionType, input: AssembleInput, facts: SiteFacts): SectionBlock {
  switch (type) {
    case "hero":
      return {
        type,
        // The identity's layout persona owns the hero composition (cinematic /
        // text-forward / framed) so the three variations differ structurally.
        variant: input.identity?.heroVariant ?? input.theme.variants.hero[0],
        props: { headline: input.content.heroHeadline, subhead: input.content.heroSubhead, ctaLabel: computeCtaLabel(facts, input.family) },
      };
    case "featuredProducts": {
      if (input.identity) {
        const { eyebrow, title } = input.identity.copy.featured(input.brandKit?.vocabulary);
        return { type, props: { title, eyebrow } };
      }
      return input.brandKit
        ? { type, props: { title: `Featured ${input.brandKit.vocabulary.itemPlural}`, eyebrow: "Featured" } }
        : { type, props: { title: "Signature Dishes", eyebrow: "Favourites" } };
    }
    case "signatureDishes":
      return {
        type,
        props: {
          title: featuredSectionTitle(input.ingest.businessType),
          intro: input.content.signatureDishesIntro,
          items: pickSignatureDishes(input.ingest.menu),
        },
      };
    case "aboutTeaser":
      // Only build an excerpt when there's a real story; an empty story must
      // stay empty so the teaser self-omits (never an empty "Our Story" band).
      return {
        type,
        props: { excerpt: input.content.aboutStory.trim() ? truncate(input.content.aboutStory, 280) : "", linkTo: "/about" },
      };
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

/**
 * Cuisine to surface in SEO copy — omitted when the brand analysis had zero
 * confidence in it (the safe-default path, e.g. the generic "eclectic" used
 * when no AI provider is configured), so a placeholder descriptor never reaches
 * the customer's title/tab.
 */
function seoCuisine(input: AssembleInput): string | undefined {
  // Omit ONLY when brand analysis explicitly had zero confidence in the cuisine
  // (the safe-default "eclectic" path). When confidence is absent (legacy/hand-
  // built definitions), keep the cuisine so existing output stays byte-identical.
  const confidence = input.brandProfile.confidence?.cuisine;
  return confidence === undefined || confidence > 0 ? input.brandProfile.cuisine : undefined;
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
    title: buildPageTitle("Home", input.ingest.restaurantName, seoCuisine(input), city),
    metaDescription: buildMetaDescription(input.content.tagline, seoCuisine(input), city),
    sections: order.map((type) => buildHomeSection(type, input, facts)),
  };
}

function buildMenuPage(input: AssembleInput, city: string | undefined): SitePage {
  return {
    slug: "/menu",
    title: buildPageTitle("Menu", input.ingest.restaurantName, seoCuisine(input), city),
    metaDescription: buildMetaDescription(`${input.ingest.restaurantName}'s full menu.`, seoCuisine(input), city),
    sections: [
      { type: "menu", variant: input.theme.variants.menuLayout[0], props: { categories: groupMenuByCategory(input.ingest.menu) } },
      { type: "footer", props: { restaurantName: input.ingest.restaurantName } },
    ],
  };
}

function buildAboutPage(input: AssembleInput, city: string | undefined): SitePage {
  return {
    slug: "/about",
    title: buildPageTitle("About", input.ingest.restaurantName, seoCuisine(input), city),
    metaDescription: buildMetaDescription(`The story behind ${input.ingest.restaurantName}.`, seoCuisine(input), city),
    sections: [
      { type: "aboutStory", props: { story: input.content.aboutStory } },
      { type: "footer", props: { restaurantName: input.ingest.restaurantName } },
    ],
  };
}

function buildContactPage(input: AssembleInput, facts: SiteFacts, city: string | undefined): SitePage {
  return {
    slug: "/contact",
    title: buildPageTitle("Contact", input.ingest.restaurantName, seoCuisine(input), city),
    metaDescription: buildMetaDescription(`Get in touch with ${input.ingest.restaurantName}.`, seoCuisine(input), city),
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
    title: buildPageTitle("Gallery", input.ingest.restaurantName, seoCuisine(input), city),
    metaDescription: buildMetaDescription(input.content.galleryIntro, seoCuisine(input), city),
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
    typography: input.identity?.typography ?? input.theme.tokens.typography,
    designRationale: input.designRationale,
    facts,
    // Theme Engine V3 — a theme may declare its own presentation defaults
    // (chrome/header, footer, product presentation, brand token overrides).
    // Copied verbatim so the theme is self-describing; omitted (left
    // undefined) for every theme that declares none, preserving byte-identical
    // output for all existing themes.
    header: input.theme.presentation?.header,
    footer: input.theme.presentation?.footer,
    productPresentation: input.theme.presentation?.productPresentation,
    // Sprint 5.5 — Brand Kit owns color (palette → brandSettings) and vocabulary;
    // both are omitted (undefined) when there is no Brand Kit, keeping existing
    // output byte-identical.
    brandSettings: resolveBrandSettings(input.theme, input.brandKit, input.identity),
    vocabulary: input.brandKit?.vocabulary,
    aiAssets: input.aiAssets,
    pages: [
      buildHomePage(input, facts, city),
      buildMenuPage(input, city),
      buildAboutPage(input, city),
      buildContactPage(input, facts, city),
      buildGalleryPage(input, city),
    ],
  };
}
