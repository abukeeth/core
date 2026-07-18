import { escapeHtml } from "../html-escape";
import { generatedGradient } from "../image-fallback";
import { pickStockPhoto } from "../imagery";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

const HEIGHT_VH: Record<string, string> = {
  small: "40vh",
  medium: "60vh",
  large: "80vh",
  full: "100vh",
};

const ALIGN_ITEMS: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
const TEXT_ALIGN: Record<string, string> = { left: "left", center: "center", right: "right" };

const FULL_BLEED_VARIANTS = new Set(["fullbleed-image", "bold-block"]);

function readString(props: Record<string, unknown>, key: string, fallback = ""): string {
  return typeof props[key] === "string" ? (props[key] as string) : fallback;
}

/**
 * A curated stock hero photo (matched to business type / cuisine) layered over
 * a generated gradient, standing in for an un-uploaded full-bleed photo. If the
 * photo fails to load the gradient shows through — never a blank hero.
 */
function fullBleedFallback(name: string, stockUrl: string, minHeight: string): string {
  return `<div aria-hidden="true" style="width:100%;height:${minHeight};background-image:url(&quot;${escapeHtml(stockUrl)}&quot;), ${generatedGradient(name)};background-size:cover;background-position:center;display:block;"></div>`;
}

/**
 * §3 Hero Builder — 3 legacy variants (fullbleed-image/split/minimal-typographic,
 * unchanged) plus 3 §Website Builder design-system variants (editorial-split/
 * warm-frame/bold-block) that differ materially in image treatment, text
 * hierarchy, and layout direction, not only color/font. Every variant now
 * always shows an image — a real uploaded photo, or the same deterministic
 * fallback tile used elsewhere — so a hero is never left "mostly text."
 */
export function renderHero(section: SectionBlock, ctx: RenderContext): string {
  const props = section.props;
  const headline = readString(props, "headline", ctx.definition.tagline);
  const subhead = readString(props, "subhead");
  const ctaLabel = readString(props, "ctaLabel", "View Menu");
  const ctaLink = readString(props, "ctaLink", "#primary-action");
  const secondaryCtaLabel = readString(props, "secondaryCtaLabel");
  const secondaryCtaLink = readString(props, "secondaryCtaLink", "/menu");
  const badge = readString(props, "badge");
  // scrimOpacity kept as a read fallback so hero blocks saved before this
  // task (which only ever wrote that key) still render their chosen scrim.
  const overlayOpacity =
    typeof props.overlayOpacity === "number" ? props.overlayOpacity : typeof props.scrimOpacity === "number" ? props.scrimOpacity : 0.45;
  const alignment = readString(props, "alignment", "center");
  const height = readString(props, "height", "medium");
  const variant = section.variant ?? "minimal-typographic";
  const isBold = variant === "bold-block";
  const isEditorial = variant === "editorial-split";
  const isWarmFrame = variant === "warm-frame";

  const minHeight = HEIGHT_VH[height] ?? HEIGHT_VH.medium;
  const heroName = ctx.assets.heroAlt ?? ctx.definition.restaurantName;
  const { cuisine, businessType } = ctx.definition;
  const stockHeroUrl = pickStockPhoto({ slot: "hero", cuisine, businessType, key: ctx.definition.restaurantName });
  const stockFoodUrl = pickStockPhoto({ slot: "food", cuisine, businessType, key: `${ctx.definition.restaurantName}-hero` });

  const badgeHtml = badge ? `<span style="display:inline-block;background:var(--color-accent-600);color:#fff;border-radius:999px;padding:0.25rem 0.75rem;font-size:var(--step--1);font-weight:600;margin-bottom:0.75rem;">${escapeHtml(badge)}</span>` : "";
  const ctaHtml = `<a class="cta" href="${escapeHtml(ctaLink)}" id="primary-action"${isBold ? ' style="font-size:var(--step-1);padding:1rem 2rem;"' : ""}>${escapeHtml(ctaLabel)}</a>`;
  const secondaryCtaHtml = secondaryCtaLabel
    ? `<a href="${escapeHtml(secondaryCtaLink)}" style="margin-left:0.75rem;font-weight:600;color:inherit;text-decoration:underline;">${escapeHtml(secondaryCtaLabel)}</a>`
    : "";

  if (FULL_BLEED_VARIANTS.has(variant)) {
    const backgroundUrl = ctx.assets.heroBackgroundUrl ?? ctx.assets.heroUrl;
    const imageHtml = backgroundUrl
      ? `<img src="${escapeHtml(backgroundUrl)}" alt="${escapeHtml(heroName)}" style="width:100%;height:${minHeight};object-fit:cover;display:block;" />`
      : fullBleedFallback(heroName, stockHeroUrl, minHeight);
    // bold-block: heavier scrim + uppercase display headline for a punchier, commerce-forward statement.
    const headlineStyle = isBold
      ? "color:#ffffff;margin:0 0 0.5rem;text-transform:uppercase;letter-spacing:0.02em;font-size:var(--step-2);"
      : "color:#ffffff;margin:0 0 0.5rem;";

    return `<section class="hero hero--${escapeHtml(variant)}" style="position:relative;">
  ${imageHtml}
  <div style="position:absolute;inset:0;background:rgba(0,0,0,${isBold ? Math.max(overlayOpacity, 0.55) : overlayOpacity});display:flex;flex-direction:column;justify-content:center;align-items:${
    ALIGN_ITEMS[alignment] ?? ALIGN_ITEMS.center
  };padding:2rem;text-align:${TEXT_ALIGN[alignment] ?? TEXT_ALIGN.center};">
    ${badgeHtml}
    <h1 style="${headlineStyle}">${escapeHtml(headline)}</h1>
    <p style="color:#ffffff;margin:0 0 1rem;">${escapeHtml(subhead)}</p>
    <div>${ctaHtml}${secondaryCtaHtml}</div>
  </div>
</section>`;
  }

  // Inset-image variants: split, minimal-typographic, editorial-split, warm-frame.
  // A real photo (or the fallback tile) sits beside/above the text, never a
  // full-bleed background, preserving each variant's text-forward identity.
  const insetImageUrl = ctx.assets.heroUrl;
  const insetMaxWidth = variant === "minimal-typographic" ? "280px" : isEditorial ? "560px" : "420px";
  const frameBorder = isWarmFrame ? "border:8px solid var(--color-surface-50);" : "";
  const insetFallback = `<div role="img" aria-label="${escapeHtml(heroName)}" style="width:100%;max-width:${insetMaxWidth};aspect-ratio:4/3;border-radius:var(--radius);box-shadow:var(--shadow);${frameBorder}background-image:url(&quot;${escapeHtml(stockFoodUrl)}&quot;), ${generatedGradient(heroName)};background-size:cover;background-position:center;"></div>`;
  const insetImageHtml = insetImageUrl
    ? `<img src="${escapeHtml(insetImageUrl)}" alt="${escapeHtml(heroName)}" style="width:100%;max-width:${insetMaxWidth};border-radius:var(--radius);box-shadow:var(--shadow);${frameBorder}" />`
    : insetFallback;

  const justify = variant === "split" || isEditorial ? "space-between" : "center";
  const wrapperExtra = isWarmFrame ? "flex-direction:column;align-items:center;text-align:center;" : "";
  const headlineHtml = isEditorial
    ? `<h1 style="font-size:var(--step-2);letter-spacing:-0.01em;">${escapeHtml(headline)}</h1>`
    : `<h1>${escapeHtml(headline)}</h1>`;
  const textAlign = isWarmFrame ? "center" : TEXT_ALIGN[alignment] ?? TEXT_ALIGN.center;

  const textBlock = `<div style="flex:1;min-width:260px;text-align:${textAlign};">
    ${badgeHtml}
    ${headlineHtml}
    <p>${escapeHtml(subhead)}</p>
    <div>${ctaHtml}${secondaryCtaHtml}</div>
  </div>`;

  // editorial-split leads with the (larger) image for an asymmetric magazine layout; every other inset variant keeps the original text-then-image order.
  const body = isEditorial ? `${insetImageHtml}\n  ${textBlock}` : `${textBlock}\n  ${insetImageHtml}`;

  return `<section class="hero hero--${escapeHtml(variant)}" style="min-height:${minHeight};display:flex;align-items:center;padding:2rem 1rem;gap:${isEditorial ? "3rem" : "2rem"};flex-wrap:wrap;justify-content:${justify};${wrapperExtra}">
  ${body}
</section>`;
}
