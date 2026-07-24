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

  // --- Vertical theme · Cafe -----------------------------------------------
  // "Daybreak" — a warm, high-key cafe design system. Type-scoped to
  // COFFEE_SHOP: a cafe tenant selects it ahead of the type-agnostic warm-local
  // in the MINIMAL family; other business types never select it. Reuses the
  // existing warm variants (warm-frame / warm-cards / warm chrome) — no new
  // rendering surface — with a coffee/terracotta palette and a rewards band.
  {
    key: "cafe-daybreak",
    version: 1,
    styleFamily: "MINIMAL",
    businessTypes: ["COFFEE_SHOP"],
    personalityVector: {
      traditionalContemporary: 0.5,
      casualFormal: 0.22,
      playfulSerious: 0.45,
      understatedBold: 0.3,
      rusticPolished: 0.5,
    },
    cuisineAffinities: { cafe: 0.9, coffee: 0.9, bakery: 0.6, brunch: 0.6, breakfast: 0.6 },
    constraints: {},
    tokens: {
      colorSeed: "#9C6644",
      typography: { display: "Fraunces", body: "Nunito Sans" },
      radius: "rounded",
      motion: "subtle",
      typeScaleRatio: 1.2,
    },
    variants: { hero: ["warm-frame"], menuLayout: ["warm-cards"], chrome: ["warm"] },
    layouts: { home: ["hero", "featuredCategories", "signatureDishes", "features", "loyalty", "gallery", "hoursLocation", "footer"] },
    presentation: {
      header: { logoPosition: "left", headerLayout: "standard", stickyHeader: true, announcementBar: { enabled: true }, showSearch: true, showCart: true, showOrderButton: true, mobileNavStyle: "drawer" },
      footer: { showContactInfo: true, showHours: true, newsletterEnabled: true },
      productPresentation: { categoryNavStyle: "sticky", cardLayout: "grid", infoDensity: "detailed", priceStyle: "standard", outOfStockAppearance: "badge", addToCartStyle: "button" },
      brandSettings: {
        primaryColor: "#9C6644",
        accentColor: "#7A8450",
        backgroundColor: "#FBF6EE",
        textColor: "#3B322A",
        headingFont: "Fraunces",
        bodyFont: "Nunito Sans",
        buttonStyle: "rounded",
        borderRadius: 14,
        shadowIntensity: "soft",
        pageWidth: "standard",
        contentSpacing: "spacious",
      },
    },
  },

  // --- Vertical theme · Deli -----------------------------------------------
  // "Counter" — a bold, appetite-forward deli design system. Type-scoped to
  // DELI: a deli tenant selects it ahead of the type-agnostic modern-editorial
  // in the MODERN family. Reuses the existing bold variants (bold-block /
  // bold-grid / bold chrome) with a deli-green + mustard palette; leads with a
  // daily-special (offers) and fast-pickup service band.
  {
    key: "deli-counter",
    version: 1,
    styleFamily: "MODERN",
    businessTypes: ["DELI"],
    // Superseded by the flagship `deli-brooklyn` design system below. Kept
    // (never deleted) so any site already published on it renders identically.
    deprecated: true,
    personalityVector: {
      traditionalContemporary: 0.55,
      casualFormal: 0.28,
      playfulSerious: 0.35,
      understatedBold: 0.75,
      rusticPolished: 0.5,
    },
    cuisineAffinities: { deli: 0.9, sandwiches: 0.9, american: 0.6, breakfast: 0.5, catering: 0.6 },
    constraints: {},
    tokens: {
      colorSeed: "#2F6B3A",
      typography: { display: "Oswald", body: "Inter" },
      radius: "sharp",
      motion: "energetic",
      typeScaleRatio: 1.3,
    },
    variants: { hero: ["bold-block"], menuLayout: ["bold-grid"], chrome: ["bold"] },
    layouts: { home: ["hero", "featuredCategories", "signatureDishes", "features", "offers", "serviceOptions", "hoursLocation", "footer"] },
    presentation: {
      header: { logoPosition: "left", headerLayout: "standard", stickyHeader: true, announcementBar: { enabled: true }, showSearch: true, showCart: true, showOrderButton: true, mobileNavStyle: "drawer" },
      footer: { showContactInfo: true, showHours: true, newsletterEnabled: false },
      productPresentation: { categoryNavStyle: "sticky", cardLayout: "grid", infoDensity: "detailed", priceStyle: "bold", outOfStockAppearance: "badge", addToCartStyle: "button" },
      brandSettings: {
        primaryColor: "#2F6B3A",
        accentColor: "#C9A227",
        backgroundColor: "#FBFAF5",
        textColor: "#22261F",
        headingFont: "Oswald",
        bodyFont: "Inter",
        buttonStyle: "square",
        borderRadius: 2,
        shadowIntensity: "medium",
        pageWidth: "standard",
        contentSpacing: "comfortable",
      },
    },
  },

  // --- Vertical theme · Vape ------------------------------------------------
  // "Vapor" — a dark, premium, neon-accented design system for vape/smoke shops.
  // Type-scoped to VAPE_SHOP: a vape tenant selects it ahead of the type-agnostic
  // bold-commerce in the LUXURY family; a vape shop must never be handed a
  // restaurant theme. Reuses the existing bold variants with a near-black palette
  // and neon violet/cyan accents, and — uniquely — leads with the age-gate
  // (21+) blocking overlay (compliance). A product-grid catalog with no photo
  // dependency (constraints: {}), so it is premium even before any photos exist.
  {
    key: "vape-vapor",
    version: 1,
    styleFamily: "LUXURY",
    businessTypes: ["VAPE_SHOP"],
    // Superseded by the flagship `vape-lab` design system below. Kept (never
    // deleted) so any site already published on it renders identically.
    deprecated: true,
    personalityVector: {
      traditionalContemporary: 0.8,
      casualFormal: 0.6,
      playfulSerious: 0.7,
      understatedBold: 0.95,
      rusticPolished: 0.85,
    },
    cuisineAffinities: {},
    constraints: {},
    tokens: {
      colorSeed: "#12091F",
      typography: { display: "Space Grotesk", body: "IBM Plex Mono" },
      radius: "sharp",
      motion: "energetic",
      typeScaleRatio: 1.35,
    },
    variants: { hero: ["bold-block"], menuLayout: ["bold-grid"], chrome: ["bold"] },
    layouts: { home: ["hero", "ageGate", "featuredCategories", "featuredProducts", "features", "gallery", "hoursLocation", "footer"] },
    presentation: {
      header: { logoPosition: "left", headerLayout: "standard", stickyHeader: true, announcementBar: { enabled: true }, showSearch: true, showCart: true, showOrderButton: true, mobileNavStyle: "drawer" },
      footer: { showContactInfo: true, showHours: true, newsletterEnabled: true },
      productPresentation: { categoryNavStyle: "sticky", cardLayout: "grid", infoDensity: "compact", priceStyle: "bold", outOfStockAppearance: "badge", addToCartStyle: "button" },
      brandSettings: {
        primaryColor: "#7C3AED",
        accentColor: "#22D3EE",
        backgroundColor: "#0B0713",
        textColor: "#ECEAF2",
        headingFont: "Space Grotesk",
        bodyFont: "IBM Plex Mono",
        buttonStyle: "square",
        borderRadius: 4,
        shadowIntensity: "strong",
        pageWidth: "standard",
        contentSpacing: "comfortable",
      },
    },
  },

  // --- FLAGSHIP vertical theme · Deli ---------------------------------------
  // "Brooklyn" — a premium NYC-deli / modern-food-brand design system. Cream
  // ground, deep-green ink, bronze highlights, editorial serif display over a
  // clean grotesk body, and a bespoke home structure that leads with food, not
  // a generic "hero + features + story". Its hero, nav, product cards, and the
  // buildYourOwn / comboDeals / catering bands are all rendered by themeKey-
  // scoped branches in the components (see hero.ts, chrome.ts, product-card.ts).
  // Type-scoped to DELI and boosted ahead of the deprecated deli-counter.
  {
    key: "deli-brooklyn",
    version: 1,
    styleFamily: "MODERN",
    businessTypes: ["DELI"],
    personalityVector: {
      traditionalContemporary: 0.42,
      casualFormal: 0.34,
      playfulSerious: 0.4,
      understatedBold: 0.72,
      rusticPolished: 0.55,
    },
    cuisineAffinities: { deli: 0.95, sandwiches: 0.95, american: 0.6, breakfast: 0.5, catering: 0.7 },
    constraints: {},
    tokens: {
      colorSeed: "#1F5130",
      typography: { display: "Fraunces", body: "Inter" },
      radius: "soft",
      motion: "subtle",
      typeScaleRatio: 1.32,
    },
    variants: { hero: ["editorial-split"], menuLayout: ["card-grid"], chrome: ["editorial"] },
    layouts: {
      home: [
        "hero",
        "signatureDishes", // "Fan Favorites" — real menu items, deli product cards
        "buildYourOwn",
        "comboDeals",
        "bestSellers", // "Most Ordered This Week" — real order history; self-omits
        "catering",
        "reviews", // real verified reviews only; self-omits
        "hoursLocation",
        "ctaBanner",
        "footer",
      ],
    },
    presentation: {
      header: { logoPosition: "left", headerLayout: "standard", stickyHeader: true, announcementBar: { enabled: true, text: "Order ahead — ready when you are" }, showSearch: false, showCart: true, showOrderButton: true, mobileNavStyle: "drawer" },
      footer: { showContactInfo: true, showHours: true, newsletterEnabled: true },
      productPresentation: { categoryNavStyle: "sticky", cardLayout: "grid", infoDensity: "detailed", priceStyle: "bold", outOfStockAppearance: "badge", addToCartStyle: "button" },
      brandSettings: {
        primaryColor: "#1F5130",
        accentColor: "#A6772F",
        backgroundColor: "#FBF6EA",
        textColor: "#211E17",
        headingFont: "Fraunces",
        bodyFont: "Inter",
        buttonStyle: "pill",
        borderRadius: 18,
        shadowIntensity: "medium",
        pageWidth: "wide",
        contentSpacing: "spacious",
      },
    },
  },

  // --- FLAGSHIP vertical theme · Vape ---------------------------------------
  // "Lab" — a luxury-technology-brand design system for vape/smoke shops.
  // Near-black ground, violet primary, cyan highlights, a monospace/grotesk
  // pairing, and a bespoke home structure: compliance age-gate → cinematic dark
  // hero → collection strip → per-category product grids (Devices / E-Liquids /
  // New Arrivals) → best sellers → loyalty → reviews → store locations. Product
  // cards, hero, and nav are rendered by themeKey-scoped branches. Type-scoped
  // to VAPE_SHOP and boosted ahead of the deprecated vape-vapor.
  {
    key: "vape-lab",
    version: 1,
    styleFamily: "LUXURY",
    businessTypes: ["VAPE_SHOP"],
    personalityVector: {
      traditionalContemporary: 0.88,
      casualFormal: 0.62,
      playfulSerious: 0.72,
      understatedBold: 0.96,
      rusticPolished: 0.9,
    },
    cuisineAffinities: {},
    constraints: {},
    tokens: {
      colorSeed: "#150A24",
      typography: { display: "Space Grotesk", body: "IBM Plex Mono" },
      radius: "soft",
      motion: "energetic",
      typeScaleRatio: 1.38,
    },
    variants: { hero: ["fullbleed-image"], menuLayout: ["card-grid"], chrome: ["bold"] },
    layouts: {
      home: [
        // Hero first (keeps the catalog's hero-first invariant); the age-gate is
        // a fixed full-page overlay, so its DOM position is immaterial — it
        // still blocks the whole storefront until the visitor confirms 21+.
        "hero",
        "ageGate",
        "featuredBrands", // premium strip of the REAL menu categories
        "productCollection", // expanded in assemble into one product grid per REAL category (Devices / E-Liquids / …)
        "bestSellers", // real order history; self-omits
        "loyalty", // real loyalty program; self-omits
        "reviews", // real verified reviews only; self-omits
        "storeLocations",
        "footer",
      ],
    },
    presentation: {
      header: { logoPosition: "left", headerLayout: "standard", stickyHeader: true, announcementBar: { enabled: true, text: "You must be 21 or older to purchase" }, showSearch: true, showCart: true, showOrderButton: true, mobileNavStyle: "drawer" },
      footer: { showContactInfo: true, showHours: true, newsletterEnabled: true },
      productPresentation: { categoryNavStyle: "sticky", cardLayout: "grid", infoDensity: "compact", priceStyle: "bold", outOfStockAppearance: "badge", addToCartStyle: "button" },
      brandSettings: {
        primaryColor: "#8B5CF6",
        accentColor: "#22D3EE",
        backgroundColor: "#08060F",
        textColor: "#EDEAF7",
        headingFont: "Space Grotesk",
        bodyFont: "IBM Plex Mono",
        buttonStyle: "square",
        borderRadius: 6,
        shadowIntensity: "strong",
        pageWidth: "wide",
        contentSpacing: "comfortable",
      },
    },
  },
];
