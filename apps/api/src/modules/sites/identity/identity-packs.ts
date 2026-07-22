import type { BrandPalette, Vocabulary } from "../branding/brand-kit";
import type { BrandSettings, StyleFamilyValue } from "../types";

/**
 * Identity Packs — the approved three-agency model. Each generated storefront
 * variation is a complete, independent brand identity (palette mood, typography
 * pair, layout persona, copy voice, photography direction), not a re-colored
 * theme. One pack per style family, applied system-wide for EVERY vertical:
 *
 *   LUXURY  → Artisan Craft   (dark, serif, editorial, cinematic photography)
 *   MODERN  → Modern Minimal  (bright white, grotesk, precision, clean product light)
 *   MINIMAL → Local Market    (warm, rounded, community, rustic natural light)
 *
 * The pack composes EXISTING primitives — brandSettings (fonts/colors/shape),
 * renderer hero variants, section copy — so no schema change and no per-business
 * hardcoding. The Brand Kit still owns the business's hue identity; the pack
 * re-stages those hues into its own mood (e.g. Artisan pulls the brand primary
 * into a near-black ground instead of replacing it).
 */

export interface IdentityPhotography {
  /** Appended to every impression prompt for this identity — style + finish. */
  treatment: string;
  lighting: string;
  backdrop: string;
}

export interface IdentityPack {
  key: "artisan-craft" | "modern-minimal" | "local-market";
  family: StyleFamilyValue;
  typography: { display: string; body: string };
  /** Layout persona expressed through the renderer's existing hero variants. */
  heroVariant: "cinematic" | "minimal-typographic" | "warm-frame";
  /** Structural brandSettings the pack owns (shape/spacing/shadow). */
  structure: Pick<BrandSettings, "buttonStyle" | "borderRadius" | "shadowIntensity" | "contentSpacing" | "pageWidth">;
  /** Re-stages the Brand Kit palette into this identity's mood. */
  palette: (base: BrandPalette) => Pick<
    BrandSettings,
    "primaryColor" | "secondaryColor" | "accentColor" | "backgroundColor" | "textColor"
  >;
  /** Copy voice for section chrome — vocabulary-aware so every vertical reads right. */
  copy: {
    featured: (vocab?: Vocabulary) => { eyebrow: string; title: string };
    voiceAdjectives: string[];
  };
  photography: IdentityPhotography;
}

/** t=0 → a, t=1 → b. Deterministic hex mix, no dependencies. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace("#", "");
  const pb = b.replace("#", "");
  const c = (i: number) => {
    const va = parseInt(pa.slice(i, i + 2), 16);
    const vb = parseInt(pb.slice(i, i + 2), 16);
    return Math.round(va + (vb - va) * t)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${c(0)}${c(2)}${c(4)}`;
}

export const IDENTITY_PACKS: Record<StyleFamilyValue, IdentityPack> = {
  LUXURY: {
    key: "artisan-craft",
    family: "LUXURY",
    typography: { display: "Fraunces", body: "Inter" },
    heroVariant: "cinematic",
    structure: { buttonStyle: "square", borderRadius: 2, shadowIntensity: "none", contentSpacing: "spacious", pageWidth: "standard" },
    palette: (base) => ({
      // The brand's primary hue sunk into a near-black ground; warm light text;
      // the brand accent lifted so it reads as brass/edge light on the dark field.
      backgroundColor: mixHex(base.primary, "#0F0B07", 0.86),
      textColor: "#F2EADB",
      primaryColor: base.primary,
      secondaryColor: base.secondary,
      accentColor: mixHex(base.accent, "#F5D9A8", 0.35),
    }),
    copy: {
      featured: () => ({ eyebrow: "From the counter", title: "The Signatures" }),
      voiceAdjectives: ["crafted", "heritage", "considered", "quietly confident"],
    },
    photography: {
      treatment: "cinematic editorial food-and-craft photography, rich texture, shallow depth of field",
      lighting: "dramatic low-key side light with deep shadows",
      backdrop: "dark slate and aged wood surfaces",
    },
  },
  MODERN: {
    key: "modern-minimal",
    family: "MODERN",
    typography: { display: "Space Grotesk", body: "Inter" },
    heroVariant: "minimal-typographic",
    structure: { buttonStyle: "pill", borderRadius: 18, shadowIntensity: "soft", contentSpacing: "spacious", pageWidth: "standard" },
    palette: (base) => ({
      backgroundColor: "#FFFFFF",
      textColor: "#141417",
      primaryColor: base.primary,
      secondaryColor: base.secondary,
      accentColor: base.accent,
    }),
    copy: {
      featured: (vocab) => ({ eyebrow: "Made fresh", title: vocab ? `The ${vocab.itemPlural.toLowerCase()} lineup` : "The lineup" }),
      voiceAdjectives: ["precise", "effortless", "honest", "modern"],
    },
    photography: {
      treatment: "clean minimal product photography, sharp focus, generous negative space",
      lighting: "bright airy daylight, soft even highlights",
      backdrop: "seamless white and pale neutral surfaces",
    },
  },
  MINIMAL: {
    key: "local-market",
    family: "MINIMAL",
    typography: { display: "Nunito Sans", body: "Nunito Sans" },
    heroVariant: "warm-frame",
    structure: { buttonStyle: "pill", borderRadius: 20, shadowIntensity: "medium", contentSpacing: "comfortable", pageWidth: "standard" },
    palette: (base) => ({
      // The Brand Kit's own warm vertical palette IS the market identity —
      // softened background, full-strength brand hues.
      backgroundColor: mixHex(base.background, "#FBF4E4", 0.5),
      textColor: base.text,
      primaryColor: base.primary,
      secondaryColor: base.secondary,
      accentColor: base.accent,
    }),
    copy: {
      featured: () => ({ eyebrow: "From the chalkboard", title: "Today's Favorites" }),
      voiceAdjectives: ["warm", "neighborly", "fresh", "family-run"],
    },
    photography: {
      treatment: "warm rustic lifestyle photography, natural and inviting, handmade feel",
      lighting: "golden natural morning light",
      backdrop: "wooden counters, market crates and linen",
    },
  },
};

/** The identity pack for a generated variation's style family. */
export function identityForFamily(family: StyleFamilyValue): IdentityPack {
  return IDENTITY_PACKS[family];
}
