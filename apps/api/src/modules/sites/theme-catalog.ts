import type { ThemeCatalogEntry } from "./types";

/**
 * The curated theme catalog (§1, §2a). Three style families, 2-3 themes
 * each, every family able to serve every cuisine (personality similarity
 * dominates theme fit — see theme-matching.ts — so a family never comes up
 * empty just because a niche cuisine has no explicit affinity entry).
 *
 * This is the canonical source of theme data; prisma/seed.ts upserts it
 * into the `Theme` table verbatim (key+version is the upsert key).
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
    variants: { hero: ["fullbleed-image"], menuLayout: ["two-column-elegant"] },
    layouts: { home: ["hero", "aboutTeaser", "signatureDishes", "hoursLocation", "gallery", "ctaBanner", "footer"] },
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
    variants: { hero: ["fullbleed-image"], menuLayout: ["two-column-elegant"] },
    layouts: { home: ["hero", "signatureDishes", "aboutTeaser", "gallery", "hoursLocation", "ctaBanner", "footer"] },
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
    variants: { hero: ["split"], menuLayout: ["card-grid"] },
    layouts: { home: ["hero", "signatureDishes", "gallery", "aboutTeaser", "hoursLocation", "ctaBanner", "footer"] },
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
    variants: { hero: ["split"], menuLayout: ["card-grid"] },
    layouts: { home: ["hero", "signatureDishes", "gallery", "ctaBanner", "hoursLocation", "aboutTeaser", "footer"] },
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
    variants: { hero: ["fullbleed-image"], menuLayout: ["card-grid"] },
    layouts: { home: ["hero", "signatureDishes", "aboutTeaser", "gallery", "hoursLocation", "ctaBanner", "footer"] },
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
    variants: { hero: ["minimal-typographic"], menuLayout: ["classic-list"] },
    layouts: { home: ["hero", "menu", "aboutTeaser", "hoursLocation", "gallery", "footer"] },
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
    variants: { hero: ["minimal-typographic"], menuLayout: ["classic-list"] },
    layouts: { home: ["hero", "menu", "signatureDishes", "hoursLocation", "footer"] },
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
    variants: { hero: ["minimal-typographic"], menuLayout: ["classic-list"] },
    layouts: { home: ["hero", "aboutTeaser", "menu", "hoursLocation", "gallery", "footer"] },
  },
];
