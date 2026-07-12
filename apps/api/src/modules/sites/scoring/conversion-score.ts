import type { DimensionScore, SiteDefinition, Suggestion } from "../types";

/**
 * Conversion score (§2c row 5) — a rule-based checklist. Some checks are
 * structural guarantees of the fixed component library (sticky mobile
 * action bar, menu reachable in <=1 tap via the standing 5-page site, low
 * contact friction via the always-present contact form) and always pass
 * here; others are genuinely data-dependent and can fail for a real site.
 */
export function scoreConversion(definition: SiteDefinition): DimensionScore {
  let score = 100;
  const suggestions: Suggestion[] = [];

  const home = definition.pages.find((page) => page.slug === "/");
  const heroSection = home?.sections.find((section) => section.type === "hero");
  const heroHasCta = Boolean(heroSection && typeof heroSection.props.ctaLabel === "string" && heroSection.props.ctaLabel);
  if (!heroHasCta) {
    score -= 25;
    suggestions.push({
      id: "conversion:cta-above-fold",
      dimension: "conversion",
      issue: "No primary call-to-action in the hero section",
      impact: "high",
      suggestion: "Add a clear primary CTA (Order Now / Book a Table / View Menu) above the fold.",
    });
  }

  const hasHoursLocation = Boolean(home?.sections.some((section) => section.type === "hoursLocation"));
  if (!hasHoursLocation) {
    score -= 15;
    suggestions.push({
      id: "conversion:hours-location",
      dimension: "conversion",
      issue: "Hours and location aren't shown on the home page",
      impact: "medium",
      suggestion: "Add your address and hours so visitors don't have to hunt for them.",
    });
  }

  const contactPage = definition.pages.find((page) => page.slug === "/contact");
  const contactInfo = contactPage?.sections.find((section) => section.type === "contactInfo");
  const hasClickToCall = Boolean(contactInfo && typeof contactInfo.props.phone === "string" && contactInfo.props.phone);
  if (!hasClickToCall) {
    score -= 10;
    suggestions.push({
      id: "conversion:click-to-call",
      dimension: "conversion",
      issue: "No phone number available for click-to-call on mobile",
      impact: "low",
      suggestion: "Add a phone number so mobile visitors can call with one tap.",
    });
  }

  return { dimension: "conversion", score: Math.max(0, Math.round(score)), suggestions };
}
