/**
 * Storefront quality — Phase 1.1: actually load the theme's display + body
 * typefaces. Without this the renderer set `--font-display: "Playfair Display"`
 * etc. but never delivered the font, so every storefront fell back to the
 * system serif/sans — the single biggest thing making a generated site read as
 * "auto-generated" rather than agency-designed.
 *
 * Emits Google Fonts <link>s (with preconnect + display=swap) only for
 * whitelisted families that are known to exist there, so an unknown font name
 * degrades gracefully to the system fallback instead of a failed request.
 */

/** Whitelist of families used by the theme catalog (plus common display/body
 * faces future themes may pick), each with the weight axis we style with. */
export const GOOGLE_FONTS: Record<string, string> = {
  // In the current theme catalog:
  "Playfair Display": "wght@400;500;600;700;800",
  "Space Grotesk": "wght@400;500;600;700",
  Inter: "wght@400;500;600;700",
  Fraunces: "opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700",
  Lora: "wght@400;500;600;700",
  "Nunito Sans": "wght@400;600;700;800",
  Sora: "wght@400;500;600;700",
  "IBM Plex Mono": "wght@400;500;600;700",
  "Bricolage Grotesque": "opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700",
  // Common premium display/body faces, so new themes are covered without a code change:
  "Cormorant Garamond": "wght@400;500;600;700",
  "DM Serif Display": "wght@400",
  "DM Sans": "wght@400;500;600;700",
  Manrope: "wght@400;500;600;700;800",
  Poppins: "wght@400;500;600;700",
  Montserrat: "wght@400;500;600;700",
  "Work Sans": "wght@400;500;600;700",
  "Libre Baskerville": "wght@400;700",
  Spectral: "wght@400;500;600;700",
  "EB Garamond": "wght@400;500;600;700",
  Marcellus: "wght@400",
  Prata: "wght@400",
  Syne: "wght@400;500;600;700;800",
  Outfit: "wght@400;500;600;700",
  Archivo: "wght@400;500;600;700",
  Epilogue: "wght@400;500;600;700",
};

/** Google's CSS2 `family=` value: spaces become `+`. */
function familyParam(name: string): string {
  return `family=${name.replace(/\s+/g, "+")}:${GOOGLE_FONTS[name]}`;
}

/**
 * Return the <link> tags that load the given fonts. Duplicates are collapsed and
 * unknown families skipped. Empty string when none are loadable (so the head
 * stays clean and the system fallback applies).
 */
export function renderWebFonts(...fonts: (string | undefined)[]): string {
  const families = [...new Set(fonts.map((f) => (f ?? "").trim()).filter((f) => f in GOOGLE_FONTS))];
  if (families.length === 0) return "";
  const href = `https://fonts.googleapis.com/css2?${families.map(familyParam).join("&")}&display=swap`;
  return [
    `<link rel="preconnect" href="https://fonts.googleapis.com" />`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
    `<link rel="stylesheet" href="${href}" />`,
  ].join("\n");
}
