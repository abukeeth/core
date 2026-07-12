import { scrimOpacityForLuminance } from "../../../lib/color";
import { buildMetaDescription, guessCityFromAddress } from "../seo";
import type { SiteDefinition, Suggestion } from "../types";

// No real image-pixel sampling exists in this sprint (see Known
// Limitations), so a hero without a measured heroImageLuminance prop is
// assumed moderately bright — a conservative value that still guarantees
// AA for the common case of a real photo, without needing actual pixels.
const DEFAULT_HERO_LUMINANCE_ASSUMPTION = 0.75;

/** autoFixKind: "heroContrast" — boosts every hero section's scrim until white text clears WCAG AA. */
export function fixHeroContrast(definition: SiteDefinition): SiteDefinition {
  return {
    ...definition,
    pages: definition.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => {
        if (section.type !== "hero") return section;
        const luminance =
          typeof section.props.heroImageLuminance === "number" ? section.props.heroImageLuminance : DEFAULT_HERO_LUMINANCE_ASSUMPTION;
        return { ...section, props: { ...section.props, scrimOpacity: scrimOpacityForLuminance(luminance) } };
      }),
    })),
  };
}

/** autoFixKind: "missingMetaDescription" — fills any empty meta description from the page's own tagline/cuisine/city. */
export function fixMissingMetaDescription(definition: SiteDefinition): SiteDefinition {
  const city = guessCityFromAddress(definition.facts.address);
  return {
    ...definition,
    pages: definition.pages.map((page) => ({
      ...page,
      metaDescription:
        page.metaDescription.trim().length > 0 ? page.metaDescription : buildMetaDescription(definition.tagline, definition.cuisine, city),
    })),
  };
}

/**
 * Dispatches a suggestion's autoFixKind to its definition-level fix.
 * "missingAltText" isn't handled here — alt text lives on SiteAsset rows,
 * not inside the SiteDefinition, so its fix runs through asset.service.ts.
 * Suggestions without a recognized autoFixKind are returned unchanged
 * (advisory-only, per §29: "publish never hard-blocked on score").
 */
export function applyDefinitionSuggestionFix(definition: SiteDefinition, suggestion: Suggestion): SiteDefinition {
  switch (suggestion.autoFixKind) {
    case "heroContrast":
      return fixHeroContrast(definition);
    case "missingMetaDescription":
      return fixMissingMetaDescription(definition);
    default:
      return definition;
  }
}
