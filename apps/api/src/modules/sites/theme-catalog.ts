import type { ThemeCatalogEntry } from "./types";

/**
 * The curated theme catalog (§1, §2a). Three style families, every family
 * able to serve every cuisine (personality similarity dominates theme fit
 * — see theme-matching.ts — so a family never comes up empty just because
 * a niche cuisine has no explicit affinity entry).
 *
 * This is the canonical source of theme data; prisma/seed.ts upserts it
 * into the `Theme` table verbatim (key+version is the upsert key).
 *
 * §Website Builder — the original 9 entries below (`deprecated: true`)
 * shared one hero/menu/chrome skeleton per family, so every generation
 * looked nearly identical regardless of which specific theme scored
 * best. They're kept, never deleted or mutated, purely so already-
 * published sites referencing these exact key+version pairs keep
 * rendering byte-identically. theme-matching.ts excludes deprecated
 * themes from new selections — modern-editorial, warm-local, and
 * bold-commerce (below) are the only themes new generations ever pick,
 * one genuinely distinct design system per family.
 */
export const THEME_CATALOG: ThemeCatalogEntry[] = [
  // --- Luxury -------------------------------------------------------------
  {
    key: "fine-dining",
    version: 1,
    styleFamily: "LUXURY",
    personalityVector: {
      traditionalContemporary: 0.3,
      casualFormal: 0.9,
      playfulSerious: 0.85,
      understatedBold: 0.35,
      rusticPolished: 0.9,
    },
    cuisineAffinities: { french: 0.9, italian: 0.7, steakhouse: 0.8, "sushi-omakase": 0.85, japanese: 0.6 },
    constraints: { minPhotos: 3 },
    tokens: {
      colorSeed: "#5c1a2b",
      typography: { display: "Fraunces", body: "Source Serif 4" },
      radius: "sharp",
      motion: "subtle",
      typeScaleRatio: 1.333,
    },
    variants: { hero: ["fullbleed-image"], menuLayout: ["two-column-elegant"], chrome: ["standard"] },
    layouts: { home: ["hero", "aboutTeaser", "signatureDishes", "hoursLocation", "gallery", "ctaBanner", "footer"] },
    deprecated: true,
  },
  {
    key: "elegant-dark",
    version: 1,
    styleFamily: "LUXURY",
    personalityVector: {
      traditionalContemporary: 0.55,
      casualFormal: 0.85,
      playfulSerious: 0.75,
      understatedBold: 0.7,
      rusticPolished: 0.85,
    },
    cuisineAffinities: { steakhouse: 0.85, "cocktail-bar": 0.8, japanese: 0.55, seafood: 0.5 },
    constraints: { minPhotos: 2 },
    tokens: {
      colorSeed: "#14171f",
      typography: { display: "Playfair Display", body: "Inter" },
      radius: "sharp",
      motion: "subtle",
      typeScaleRatio: 1.333,
    },
    variants: { hero: ["fullbleed-image"], menuLayout: ["two-column-elegant"], chrome: ["standard"] },
    layouts: { home: ["hero", "signatureDishes", "aboutTeaser", "gallery", "hoursLocation", "ctaBanner", "footer"] },
    deprecated: true,
  },

  // --- Modern ---------------------------------------------------------------
  {
    key: "modern-bistro",
    version: 1,
    styleFamily: "MODERN",
    personalityVector: {
      traditionalContemporary: 0.7,
      casualFormal: 0.4,
      playfulSerious: 0.4,
      understatedBold: 0.7,
      rusticPolished: 0.5,
    },
    cuisineAffinities: { italian: 0.6, american: 0.7, bistro: 0.85, brunch: 0.6 },
    constraints: { minPhotos: 1 },
    tokens: {
      colorSeed: "#e8590c",
      typography: { display: "Sora", body: "Inter" },
      radius: "rounded",
      motion: "energetic",
      typeScaleRatio: 1.25,
    },
    variants: { hero: ["split"], menuLayout: ["card-grid"], chrome: ["standard"] },
    layouts: { home: ["hero", "signatureDishes", "gallery", "aboutTeaser", "hoursLocation", "ctaBanner", "footer"] },
    deprecated: true,
  },
  {
    key: "street-food",
    version: 1,
    styleFamily: "MODERN",
    personalityVector: {
      traditionalContemporary: 0.75,
      casualFormal: 0.15,
      playfulSerious: 0.2,
      understatedBold: 0.85,
      rusticPolished: 0.3,
    },
    cuisineAffinities: { mexican: 0.85, thai: 0.75, korean: 0.75, "food-truck": 0.9, fusion: 0.6 },
    constraints: { minPhotos: 1 },
    tokens: {
      colorSeed: "#d9480f",
      typography: { display: "Space Grotesk", body: "Inter" },
      radius: "rounded",
      motion: "energetic",
      typeScaleRatio: 1.25,
    },
    variants: { hero: ["split"], menuLayout: ["card-grid"], chrome: ["standard"] },
    layouts: { home: ["hero", "signatureDishes", "gallery", "ctaBanner", "hoursLocation", "aboutTeaser", "footer"] },
    deprecated: true,
  },
  {
    key: "coastal",
    version: 1,
    styleFamily: "MODERN",
    personalityVector: {
      traditionalContemporary: 0.65,
      casualFormal: 0.35,
      playfulSerious: 0.45,
      understatedBold: 0.5,
      rusticPolished: 0.55,
    },
    cuisineAffinities: { seafood: 0.9, mediterranean: 0.75, californian: 0.7 },
    constraints: { minPhotos: 2 },
    tokens: {
      colorSeed: "#0c8599",
      typography: { display: "Sora", body: "Inter" },
      radius: "rounded",
      motion: "subtle",
      typeScaleRatio: 1.25,
    },
    variants: { hero: ["fullbleed-image"], menuLayout: ["card-grid"], chrome: ["standard"] },
    layouts: { home: ["hero", "signatureDishes", "aboutTeaser", "gallery", "hoursLocation", "ctaBanner", "footer"] },
    deprecated: true,
  },

  // --- Minimal --------------------------------------------------------------
  {
    key: "cafe",
    version: 1,
    styleFamily: "MINIMAL",
    personalityVector: {
      traditionalContemporary: 0.55,
      casualFormal: 0.25,
      playfulSerious: 0.45,
      understatedBold: 0.2,
      rusticPolished: 0.4,
    },
    cuisineAffinities: { cafe: 0.9, bakery: 0.8, coffee: 0.85, brunch: 0.6 },
    constraints: {},
    tokens: {
      colorSeed: "#6f4e37",
      typography: { display: "Fraunces", body: "Inter" },
      radius: "soft",
      motion: "none",
      typeScaleRatio: 1.2,
    },
    variants: { hero: ["minimal-typographic"], menuLayout: ["classic-list"], chrome: ["standard"] },
    layouts: { home: ["hero", "menu", "aboutTeaser", "hoursLocation", "gallery", "footer"] },
    deprecated: true,
  },
  {
    key: "casual-family",
    version: 1,
    styleFamily: "MINIMAL",
    personalityVector: {
      traditionalContemporary: 0.4,
      casualFormal: 0.1,
      playfulSerious: 0.35,
      understatedBold: 0.3,
      rusticPolished: 0.25,
    },
    cuisineAffinities: { "american-diner": 0.85, pizza: 0.8, "family-style": 0.85, "comfort-food": 0.75 },
    constraints: {},
    tokens: {
      colorSeed: "#1864ab",
      typography: { display: "Sora", body: "Inter" },
      radius: "soft",
      motion: "none",
      typeScaleRatio: 1.2,
    },
    variants: { hero: ["minimal-typographic"], menuLayout: ["classic-list"], chrome: ["standard"] },
    layouts: { home: ["hero", "menu", "signatureDishes", "hoursLocation", "footer"] },
    deprecated: true,
  },
  {
    key: "rustic-minimal",
    version: 1,
    styleFamily: "MINIMAL",
    personalityVector: {
      traditionalContemporary: 0.3,
      casualFormal: 0.3,
      playfulSerious: 0.55,
      understatedBold: 0.15,
      rusticPolished: 0.15,
    },
    cuisineAffinities: { "farm-to-table": 0.85, bakery: 0.6, "wine-bar": 0.7, rustic: 0.9 },
    constraints: {},
    tokens: {
      colorSeed: "#a9714a",
      typography: { display: "Fraunces", body: "Source Serif 4" },
      radius: "soft",
      motion: "none",
      typeScaleRatio: 1.2,
    },
    variants: { hero: ["minimal-typographic"], menuLayout: ["classic-list"], chrome: ["standard"] },
    layouts: { home: ["hero", "aboutTeaser", "menu", "hoursLocation", "gallery", "footer"] },
    deprecated: true,
  },

  // --- §Website Builder design systems (the only non-deprecated themes) -----
  {
    key: "modern-editorial",
    version: 1,
    styleFamily: "MODERN",
    personalityVector: {
      traditionalContemporary: 0.75,
      casualFormal: 0.5,
      playfulSerious: 0.5,
      understatedBold: 0.55,
      rusticPolished: 0.55,
    },
    cuisineAffinities: { italian: 0.5, american: 0.5, bistro: 0.6, brunch: 0.5, mediterranean: 0.5 },
    constraints: {},
    tokens: {
      colorSeed: "#22223b",
      typography: { display: "Bricolage Grotesque", body: "Inter" },
      radius: "sharp",
      motion: "subtle",
      typeScaleRatio: 1.3,
    },
    variants: { hero: ["editorial-split"], menuLayout: ["editorial-rows"], chrome: ["editorial"] },
    layouts: { home: ["hero", "aboutTeaser", "signatureDishes", "features", "gallery", "hoursLocation", "ctaBanner", "footer"] },
  },
  {
    key: "warm-local",
    version: 1,
    styleFamily: "MINIMAL",
    personalityVector: {
      traditionalContemporary: 0.45,
      casualFormal: 0.2,
      playfulSerious: 0.4,
      understatedBold: 0.25,
      rusticPolished: 0.35,
    },
    cuisineAffinities: { cafe: 0.6, bakery: 0.6, "american-diner": 0.5, "comfort-food": 0.6, "farm-to-table": 0.5 },
    constraints: {},
    tokens: {
      colorSeed: "#b5651d",
      typography: { display: "Lora", body: "Nunito Sans" },
      radius: "rounded",
      motion: "subtle",
      typeScaleRatio: 1.2,
    },
    variants: { hero: ["warm-frame"], menuLayout: ["warm-cards"], chrome: ["warm"] },
    layouts: { home: ["hero", "signatureDishes", "features", "hoursLocation", "aboutTeaser", "gallery", "footer"] },
  },
  {
    key: "bold-commerce",
    version: 1,
    styleFamily: "LUXURY",
    personalityVector: {
      traditionalContemporary: 0.6,
      casualFormal: 0.75,
      playfulSerious: 0.65,
      understatedBold: 0.9,
      rusticPolished: 0.6,
    },
    cuisineAffinities: { steakhouse: 0.6, "sushi-omakase": 0.5, seafood: 0.5, french: 0.5, japanese: 0.4 },
    constraints: { minPhotos: 1 },
    tokens: {
      colorSeed: "#0a0a0a",
      typography: { display: "Anton", body: "Inter" },
      radius: "sharp",
      motion: "energetic",
      typeScaleRatio: 1.4,
    },
    variants: { hero: ["bold-block"], menuLayout: ["bold-grid"], chrome: ["bold"] },
    layouts: { home: ["hero", "signatureDishes", "features", "ctaBanner", "gallery", "aboutTeaser", "hoursLocation", "footer"] },
  },

  // --- Theme Engine V3 · Restaurant identity -------------------------------
  // "Maison" — a premium full-service-dining design system (approved V3
  // blueprint). Competes within the LUXURY family and wins for polished,
  // formal fine-dining brands (personality + cuisine affinity), while
  // bold-commerce remains the pick for bold ones. Light editorial-luxe
  // treatment (ivory/espresso ground, brass + wine accents, high-contrast
  // serif) with a cinematic dark full-bleed hero. All colours/spacing/borders
  // are declared as reusable brandSettings token overrides; the homepage is
  // composed purely from the section grammar (layouts.home), not hard-coded.
  {
    key: "restaurant-maison",
    version: 1,
    styleFamily: "LUXURY",
    // §V3 M1 — purpose-built for full-service restaurants. Type-scoped: a
    // RESTAURANT tenant selects Maison ahead of the type-agnostic bold-commerce;
    // non-restaurant tenants never select it.
    businessTypes: ["RESTAURANT"],
    personalityVector: {
      traditionalContemporary: 0.35,
      casualFormal: 0.9,
      playfulSerious: 0.85,
      understatedBold: 0.4,
      rusticPolished: 0.92,
    },
    cuisineAffinities: {
      french: 0.9,
      italian: 0.85,
      steakhouse: 0.9,
      "sushi-omakase": 0.9,
      japanese: 0.85,
      seafood: 0.8,
      mediterranean: 0.7,
      "fine-dining": 0.9,
    },
    constraints: { minPhotos: 2 },
    tokens: {
      colorSeed: "#5C1A2B",
      typography: { display: "Fraunces", body: "Inter" },
      radius: "sharp",
      motion: "subtle",
      typeScaleRatio: 1.333,
    },
    variants: { hero: ["cinematic"], menuLayout: ["editorial-menu"], chrome: ["editorial"] },
    // Editorial fine-dining flow — cinematic hero, the menu explorer, popular
    // dishes, how to order (real service options), the story, real reviews,
    // then location/hours. Header (announcement bar + centered brand + order
    // button + mobile sticky CTA) and footer come from `presentation`, below.
    // Editorial storytelling order — open cinematic, tell the story (immersive),
    // build desire with signature features and the menu, immerse in the gallery,
    // then convert (how to visit, guest book) and close on location.
    layouts: {
      home: ["hero", "aboutTeaser", "featuredProducts", "featuredCategories", "gallery", "serviceOptions", "reviews", "hoursLocation", "footer"],
    },
    presentation: {
      header: {
        logoPosition: "center",
        headerLayout: "standard",
        stickyHeader: true,
        // Capability enabled; renders only the owner's real announcement text
        // when set (chrome.ts guards on it) — never a fabricated message.
        announcementBar: { enabled: true },
        showOrderButton: true,
        showCart: true,
        showSearch: false,
        mobileNavStyle: "drawer",
      },
      footer: {
        showContactInfo: true,
        showHours: true,
        newsletterEnabled: false,
      },
      productPresentation: {
        cardLayout: "grid",
        priceStyle: "minimal",
        addToCartStyle: "button",
        infoDensity: "detailed",
        categoryNavStyle: "sticky",
        outOfStockAppearance: "badge",
      },
      // Reusable design tokens (colours, fonts, radius, shadow, spacing) — layered
      // over the seed-derived palette by theme-css.ts. Light editorial-luxe.
      brandSettings: {
        primaryColor: "#5C1A2B",
        accentColor: "#B08D57",
        backgroundColor: "#FBF7F0",
        textColor: "#2A211C",
        headingFont: "Fraunces",
        bodyFont: "Inter",
        buttonStyle: "square",
        borderRadius: 2,
        shadowIntensity: "soft",
        pageWidth: "standard",
        contentSpacing: "spacious",
      },
    },
  },
];
