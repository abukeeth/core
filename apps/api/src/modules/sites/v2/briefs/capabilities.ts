import { GOOGLE_FONTS } from "../../renderer/web-fonts";
import { registeredSectionTypes } from "../../renderer/registry";

/**
 * Generation V2 — the renderer's PHYSICAL capability inventory (P1).
 *
 * This is the complete vocabulary a CreativeBrief may draw from: which
 * typefaces actually load, which hero compositions and catalog layouts the
 * renderer can actually draw, which sections exist. It is a list of materials
 * — like a print shop's paper stock — NOT a set of styles, pairings, or
 * design directions. No entry here implies any combination with any other.
 */

/** Every loadable typeface (single source of truth: the web-fonts whitelist). */
export const LOADABLE_FONTS = Object.keys(GOOGLE_FONTS);

/** Faces with the presence to carry display duty (subset of LOADABLE_FONTS). */
export const DISPLAY_FONTS = [
  "Playfair Display",
  "Fraunces",
  "Lora",
  "Cormorant Garamond",
  "DM Serif Display",
  "Libre Baskerville",
  "EB Garamond",
  "Spectral",
  "Marcellus",
  "Prata",
  "Space Grotesk",
  "Sora",
  "Bricolage Grotesque",
  "Syne",
  "Manrope",
  "Outfit",
  "Archivo",
  "Epilogue",
  "Poppins",
  "Montserrat",
];

/** Comfortable long-form body faces. */
export const BODY_FONTS = ["Inter", "DM Sans", "Work Sans", "Nunito Sans", "Manrope", "Lora", "Spectral", "Archivo", "Epilogue"];

/** The renderer's real hero compositions (components/hero.ts). */
export const HERO_COMPOSITIONS = ["cinematic", "fullbleed-image", "bold-block", "split", "minimal-typographic", "editorial-split", "warm-frame"] as const;

/** The renderer's real catalog/menu presentation layouts. */
export const PRODUCT_LAYOUTS = ["two-column-elegant", "card-grid", "classic-list", "editorial-rows", "warm-cards", "bold-grid"] as const;

/** Every section type the renderer can draw (single source of truth: the registry). */
export function availableSections(): string[] {
  return registeredSectionTypes();
}
