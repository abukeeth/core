export interface ConceptDetails {
  philosophy: string;
  palette: string;
  typographyDetail: string;
  experience: string;
  targetAudience: string;
  conversionFocus: string;
  personality: string;
}

export interface ConceptVariation {
  name: string;
  description: string;
  businessStyle: string;
  bestFor: string;
  colors: { primary: string; secondary: string; accent: string };
  typography: string;
  buttonStyle: string;
  navigationStyle: string;
  productCardStyle: string;
  animationStyle: string;
  details: ConceptDetails;
}

export interface ConceptFamily {
  id: string;
  variations: ConceptVariation[];
}

/**
 * Each family represents one of the three brand directions shown to the
 * owner. `variations` is the pool "Regenerate" and "Generate New Brand
 * Concepts" cycle through — simulated, not real AI (Sprint 20A Task 2).
 */
export const CONCEPT_FAMILIES: ConceptFamily[] = [
  {
    id: "modern-minimal",
    variations: [
      {
        name: "Modern Minimal",
        description: "Clean lines, generous whitespace, and a calm neutral palette that lets your menu photography lead.",
        businessStyle: "Minimalist & Editorial",
        bestFor: "Fast-casual spots that want a calm, confident, photo-led feel",
        colors: { primary: "#171512", secondary: "#F7F0E5", accent: "#B97824" },
        typography: "Clean grotesk sans-serif",
        buttonStyle: "Sharp-cornered, high-contrast",
        navigationStyle: "Minimal top bar, single-line",
        productCardStyle: "Large image, minimal text overlay",
        animationStyle: "Subtle fade & slide",
        details: {
          philosophy: "Let the food speak for itself — every design decision removes friction between the customer and the menu.",
          palette: "A near-black ink against warm cream, with a single gold accent reserved for calls to action only.",
          typographyDetail: "A single grotesk family carries every weight, keeping the hierarchy quiet and confident.",
          experience: "Generous whitespace and large imagery create a gallery-like browsing feel on every screen size.",
          targetAudience: "Design-conscious customers who value clarity and speed over decoration.",
          conversionFocus: "One obvious primary action per screen — nothing competes with 'Add to cart.'",
          personality: "Confident, understated, precise.",
        },
      },
      {
        name: "Studio Minimal",
        description: "An editorial-grade layout with tight grid alignment and restrained motion — built to feel premium at a glance.",
        businessStyle: "Minimalist & Structured",
        bestFor: "Brands leaning into a boutique, design-forward identity",
        colors: { primary: "#1C1A17", secondary: "#F5EFE3", accent: "#A9681F" },
        typography: "Grotesk sans with tightened tracking",
        buttonStyle: "Squared, outline-first",
        navigationStyle: "Fixed top bar with underline active state",
        productCardStyle: "Grid-aligned, consistent aspect ratio",
        animationStyle: "Crossfade only, no motion overshoot",
        details: {
          philosophy: "Precision over decoration — every element sits on a strict grid.",
          palette: "Deep charcoal ink, warm paper background, a single restrained bronze accent.",
          typographyDetail: "Tightened letter-spacing gives headlines a magazine-masthead feel.",
          experience: "Predictable grid rhythm makes browsing feel orderly and premium.",
          targetAudience: "Customers who associate restraint with quality.",
          conversionFocus: "A persistent, quiet cart indicator rather than an aggressive banner.",
          personality: "Precise, quiet, self-assured.",
        },
      },
      {
        name: "Gallery Minimal",
        description: "An even quieter take — full-bleed photography with type reduced to a single accent moment per screen.",
        businessStyle: "Minimalist & Photographic",
        bestFor: "Menus with strong photography that deserve to be the whole story",
        colors: { primary: "#20201C", secondary: "#F8F3E8", accent: "#C98A37" },
        typography: "Light-weight grotesk, generous tracking",
        buttonStyle: "Thin outline, no fill until pressed",
        navigationStyle: "Transparent nav that solidifies on scroll",
        productCardStyle: "Full-bleed photo, price only",
        animationStyle: "Slow parallax on scroll",
        details: {
          philosophy: "Photography carries the brand; type only ever labels it.",
          palette: "Near-black ink, warm off-white, a single soft amber accent used sparingly.",
          typographyDetail: "A lighter weight and wider tracking keep text from competing with imagery.",
          experience: "Full-bleed photography and a scroll-triggered nav create a gallery-like pace.",
          targetAudience: "Customers who decide with their eyes before they read a word.",
          conversionFocus: "A single persistent thin-outline button avoids visual competition with photography.",
          personality: "Quiet, visual, unhurried.",
        },
      },
    ],
  },
  {
    id: "warm-craft",
    variations: [
      {
        name: "Warm Craft",
        description: "Cream and bronze tones with hand-crafted typography — built for a business that feels personal.",
        businessStyle: "Warm & Artisanal",
        bestFor: "Family-run spots and bakeries that want to feel handmade",
        colors: { primary: "#B97824", secondary: "#FBF7F1", accent: "#2A251F" },
        typography: "Serif display with soft sans body",
        buttonStyle: "Fully rounded, pill-shaped",
        navigationStyle: "Sticky bottom nav with icon labels",
        productCardStyle: "Rounded corners, warm drop shadow",
        animationStyle: "Gentle bounce on tap",
        details: {
          philosophy: "The site should feel like it was made by hand, the same way the food is.",
          palette: "Warm bronze against soft cream, with deep espresso for text — nothing cold or clinical.",
          typographyDetail: "A serif display headline pairs with a rounded, friendly body face.",
          experience: "Rounded corners and soft shadows throughout make every tap feel welcoming.",
          targetAudience: "Regulars and neighborhood customers who value warmth and familiarity.",
          conversionFocus: "A friendly, always-visible order button that feels like an invitation, not a demand.",
          personality: "Warm, personal, unhurried.",
        },
      },
      {
        name: "Hearth & Table",
        description: "A cozier, textured take with deeper bronze tones and a storytelling-first homepage.",
        businessStyle: "Warm & Story-driven",
        bestFor: "Businesses with a strong founder story or local heritage",
        colors: { primary: "#9A5F17", secondary: "#F7EEDF", accent: "#3A241A" },
        typography: "Warm serif with generous line height",
        buttonStyle: "Rounded with a soft inner glow",
        navigationStyle: "Sticky bottom nav, larger touch targets",
        productCardStyle: "Textured background, handwritten-style tags",
        animationStyle: "Soft cross-fade with a slight rise",
        details: {
          philosophy: "Every screen opens with a little bit of story before it asks for a sale.",
          palette: "Deeper bronze and espresso tones for a cozier, evening-friendly feel.",
          typographyDetail: "Extra line-height throughout keeps long-form storytelling easy to read.",
          experience: "The homepage leads with narrative, then eases into the menu.",
          targetAudience: "Customers who choose a place because of who runs it, not just what's on the menu.",
          conversionFocus: "Trust-building content precedes the order flow rather than racing to it.",
          personality: "Cozy, sincere, story-led.",
        },
      },
      {
        name: "Market Warm",
        description: "A brighter, market-stall-inspired variation with playful accent tags and rounded product imagery.",
        businessStyle: "Warm & Playful",
        bestFor: "Bakeries, markets, and counter-service spots with a lively daily menu",
        colors: { primary: "#C2872A", secondary: "#FFFBF3", accent: "#4A3423" },
        typography: "Rounded sans with a friendly serif accent",
        buttonStyle: "Pill-shaped with a playful tilt on hover",
        navigationStyle: "Sticky bottom nav with a highlighted center action",
        productCardStyle: "Rounded photo tiles with a handwritten-style price tag",
        animationStyle: "Playful pop-in on scroll",
        details: {
          philosophy: "The site should feel like walking up to a bright, busy counter.",
          palette: "A brighter marigold against near-white, with deep espresso for grounding text.",
          typographyDetail: "A rounded sans pairs with a friendly serif for daily specials and callouts.",
          experience: "Playful pop-in motion and tilted accents keep browsing feel energetic but easy.",
          targetAudience: "Walk-up and daily-regular customers who want a fast, cheerful ordering moment.",
          conversionFocus: "A highlighted center action in the bottom nav keeps ordering one tap away.",
          personality: "Bright, cheerful, welcoming.",
        },
      },
    ],
  },
  {
    id: "bold-contemporary",
    variations: [
      {
        name: "Bold Contemporary",
        description: "High-contrast layouts and confident type for a brand that wants to stand out immediately.",
        businessStyle: "Bold & High-Energy",
        bestFor: "Brands that want to feel loud, modern, and impossible to scroll past",
        colors: { primary: "#171512", secondary: "#FFFFFF", accent: "#2A5C4B" },
        typography: "Heavy display sans, tight leading",
        buttonStyle: "Solid, oversized, high-contrast",
        navigationStyle: "Bold sticky nav with filled active state",
        productCardStyle: "Full-bleed image, bold price tag",
        animationStyle: "Snappy scale-in on interaction",
        details: {
          philosophy: "Grab attention in the first second and never let the energy drop.",
          palette: "Stark black and white with a punchy emerald accent for every action.",
          typographyDetail: "Oversized, heavy display type dominates every headline.",
          experience: "Full-bleed imagery and oversized type make every screen feel like a poster.",
          targetAudience: "A younger, mobile-first audience that scrolls fast and decides fast.",
          conversionFocus: "Oversized, unmissable buttons reduce any hesitation to order.",
          personality: "Loud, energetic, unapologetic.",
        },
      },
      {
        name: "Neon Contemporary",
        description: "An even louder variation — darker backgrounds, a vivid accent, and motion-forward interactions.",
        businessStyle: "Bold & Nightlife-ready",
        bestFor: "Late-night spots, bars, and delivery-first concepts",
        colors: { primary: "#0F0E0C", secondary: "#111111", accent: "#3DDC97" },
        typography: "Condensed heavy display sans",
        buttonStyle: "Glowing solid accent buttons",
        navigationStyle: "Floating pill nav, high contrast",
        productCardStyle: "Dark card, glowing accent border on hover",
        animationStyle: "Energetic scale + glow pulse",
        details: {
          philosophy: "Own the night — the interface should feel alive even when the lights are low.",
          palette: "Near-black surfaces with a single vivid neon-green accent for every action.",
          typographyDetail: "Condensed, heavy type reads clearly even at a glance in low light.",
          experience: "Dark backgrounds and glowing accents keep the interface comfortable at night.",
          targetAudience: "A late-night, delivery-first crowd ordering on the go.",
          conversionFocus: "Glowing, high-contrast buttons stay legible and urgent in any lighting.",
          personality: "Electric, urgent, after-hours.",
        },
      },
      {
        name: "Punch Contemporary",
        description: "A daytime-bold variation — vivid color blocking instead of dark mode, still unmistakably confident.",
        businessStyle: "Bold & Color-blocked",
        bestFor: "Brands that want energy without leaning into a nightlife aesthetic",
        colors: { primary: "#171512", secondary: "#FFF6E9", accent: "#D14B3D" },
        typography: "Heavy display sans with tight kerning",
        buttonStyle: "Blocky, oversized, single solid color",
        navigationStyle: "Bold color-blocked top bar",
        productCardStyle: "Color-blocked background per category",
        animationStyle: "Punchy slide-in with slight overshoot",
        details: {
          philosophy: "Confidence doesn't require darkness — bold, saturated color does the same job in daylight.",
          palette: "Warm cream base with dense ink text and a vivid red-orange accent for every action.",
          typographyDetail: "Tight kerning on heavy display type keeps headlines feeling dense and punchy.",
          experience: "Color-blocked sections give each part of the menu its own bold identity.",
          targetAudience: "A daytime, high-energy crowd that still wants speed over subtlety.",
          conversionFocus: "Oversized, single-color buttons leave no ambiguity about the next tap.",
          personality: "Vivid, confident, daytime-bold.",
        },
      },
    ],
  },
];

export interface PreparedConcept extends ConceptVariation {
  id: string;
  variationIndex: number;
}

export function conceptAt(family: ConceptFamily, variationIndex: number): PreparedConcept {
  const variation = family.variations[variationIndex % family.variations.length]!;
  return { ...variation, id: family.id, variationIndex: variationIndex % family.variations.length };
}
