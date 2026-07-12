import type { BrandPersonality, BrandProfile, StyleFamilyValue, ThemeCatalogEntry } from "./types";

const PERSONALITY_WEIGHT = 0.8;
const CUISINE_AFFINITY_WEIGHT = 0.2;

export interface ThemeFitResult {
  theme: ThemeCatalogEntry;
  score: number;
  /** Human-readable reasons the Variation Picker surfaces as "why this design". */
  reasons: string[];
}

/** [-1, 1] per axis so opposite ends of a spectrum are genuinely dissimilar. */
function centeredVector(p: BrandPersonality): number[] {
  return [p.traditionalContemporary, p.casualFormal, p.playfulSerious, p.understatedBold, p.rusticPolished].map(
    (v) => 2 * v - 1,
  );
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

/** 0 (opposite personalities) to 1 (identical), never negative. */
export function personalitySimilarity(a: BrandPersonality, b: BrandPersonality): number {
  return (cosineSimilarity(centeredVector(a), centeredVector(b)) + 1) / 2;
}

function describeTone(p: BrandPersonality): string {
  const formal = p.casualFormal >= 0.5 ? "formal" : "casual";
  const bold = p.understatedBold >= 0.5 ? "bold" : "understated";
  return `${formal}, ${bold}`;
}

/**
 * Pure scoring function (§2b step 2): weighted personality-cosine similarity
 * plus a cuisine-affinity bonus, gated by hard constraints (e.g. a
 * photo-dependent theme excluded when there aren't enough photos). Returns
 * null when the theme is hard-excluded rather than merely scored low.
 */
export function scoreTheme(theme: ThemeCatalogEntry, profile: BrandProfile, photoCount: number): ThemeFitResult | null {
  if (theme.constraints.minPhotos !== undefined && photoCount < theme.constraints.minPhotos) {
    return null;
  }

  const similarity = personalitySimilarity(theme.personalityVector, profile.personality);
  const cuisineKey = profile.cuisine.trim().toLowerCase();
  const cuisineBonus = theme.cuisineAffinities[cuisineKey] ?? 0;
  const score = similarity * PERSONALITY_WEIGHT + cuisineBonus * CUISINE_AFFINITY_WEIGHT;

  const reasons: string[] = [];
  if (cuisineBonus >= 0.5) {
    reasons.push(`strong ${profile.cuisine} affinity`);
  }
  if (similarity >= 0.7) {
    reasons.push("closely matches your brand personality");
  }
  reasons.push(`${profile.businessType}, ${describeTone(profile.personality)} tone`);

  return { theme, score, reasons };
}

/**
 * Selects the best-fit theme within one style family. Every family always
 * returns a result — if every candidate in the family is hard-excluded by
 * constraints (e.g. zero photos and every Luxury theme requires some),
 * falls back to the family's least photo-dependent theme so the picker is
 * never left without a design for that family.
 */
export function selectThemeForFamily(
  family: StyleFamilyValue,
  catalog: ThemeCatalogEntry[],
  profile: BrandProfile,
  photoCount: number,
): ThemeFitResult {
  const familyThemes = catalog.filter((t) => t.styleFamily === family);
  if (familyThemes.length === 0) {
    throw new Error(`No themes registered for style family ${family}`);
  }

  const scored = familyThemes
    .map((theme) => scoreTheme(theme, profile, photoCount))
    .filter((result): result is ThemeFitResult => result !== null)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    return scored[0];
  }

  const fallback = [...familyThemes].sort((a, b) => (a.constraints.minPhotos ?? 0) - (b.constraints.minPhotos ?? 0))[0];
  return { theme: fallback, score: 0, reasons: ["Fallback: no theme in this family met the photo requirement"] };
}

export type ThemeSelectionByFamily = Record<StyleFamilyValue, ThemeFitResult>;

/** Deterministic — same catalog + profile + photoCount always yields the same picks. */
export function selectThemesForAllFamilies(
  catalog: ThemeCatalogEntry[],
  profile: BrandProfile,
  photoCount: number,
): ThemeSelectionByFamily {
  return {
    LUXURY: selectThemeForFamily("LUXURY", catalog, profile, photoCount),
    MODERN: selectThemeForFamily("MODERN", catalog, profile, photoCount),
    MINIMAL: selectThemeForFamily("MINIMAL", catalog, profile, photoCount),
  };
}

const CUISINE_COLOR_HINTS: Record<string, string> = {
  italian: "#8b2f2f",
  french: "#2f3f6f",
  japanese: "#1f2937",
  mexican: "#d9480f",
  thai: "#2f9e44",
  indian: "#e8590c",
  mediterranean: "#2b8a8a",
  american: "#1864ab",
  seafood: "#0c8599",
  steakhouse: "#5c1a1a",
  bakery: "#a9714a",
  cafe: "#6f4e37",
};

/**
 * Palette seed derivation (§2b): a logo color wins if one exists; otherwise
 * fall back to a cuisine-based hint, and failing that, the theme's own
 * default seed — so every variation still gets a deterministic color.
 */
export function derivePaletteSeed(profile: BrandProfile, logoColorSeed: string | undefined, themeDefaultSeed: string): string {
  if (logoColorSeed) return logoColorSeed;
  const hint = CUISINE_COLOR_HINTS[profile.cuisine.trim().toLowerCase()];
  return hint ?? themeDefaultSeed;
}
