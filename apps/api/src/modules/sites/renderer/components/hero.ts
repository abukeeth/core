import { escapeHtml } from "../html-escape";
import { deterministicHue } from "../image-fallback";
import { deliSubPlaceholder, heroPlaceholder } from "../placeholder-imagery";
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

/** A themed gradient tile standing in for an un-uploaded full-bleed photo — never a blank hero. */
function fullBleedFallback(name: string, minHeight: string): string {
  const hue = deterministicHue(name);
  return `<div aria-hidden="true" style="width:100%;height:${minHeight};background:linear-gradient(135deg, hsl(${hue} 45% 30%), hsl(${(hue + 40) % 360} 45% 18%));display:block;"></div>`;
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

  const badgeHtml = badge ? `<span style="display:inline-block;background:var(--color-accent-600);color:#fff;border-radius:999px;padding:0.25rem 0.75rem;font-size:var(--step--1);font-weight:600;margin-bottom:0.75rem;">${escapeHtml(badge)}</span>` : "";
  const ctaHtml = `<a class="cta" href="${escapeHtml(ctaLink)}" id="primary-action"${isBold ? ' style="font-size:var(--step-1);padding:1rem 2rem;"' : ""}>${escapeHtml(ctaLabel)}</a>`;
  const secondaryCtaHtml = secondaryCtaLabel
    ? `<a href="${escapeHtml(secondaryCtaLink)}" style="margin-left:0.75rem;font-weight:600;color:inherit;text-decoration:underline;">${escapeHtml(secondaryCtaLabel)}</a>`
    : "";

  // Theme Engine V3 — "cinematic" (restaurant-maison): a full-bleed, low-key
  // hero anchored on a real photo when the tenant has one, else an art-directed
  // cinematic placeholder (never a flat gradient). Centered editorial type over
  // a bottom scrim: a spaced brass eyebrow, a large serif headline, a hairline
  // rule, the subhead, and light-on-dark CTAs.
  if (variant === "cinematic") {
    const bg = ctx.assets.heroBackgroundUrl ?? ctx.assets.heroUrl ?? heroPlaceholder(ctx.definition.restaurantName);
    const cinematicHeight = HEIGHT_VH[height] ?? "82vh";
    const eyebrow = ctx.definition.cuisine ? ctx.definition.cuisine.toUpperCase() : "";
    const eyebrowHtml = eyebrow
      ? `<p style="margin:0 0 1.1rem;color:var(--color-accent-500);font-size:var(--step--1);letter-spacing:0.32em;text-transform:uppercase;font-family:var(--font-body);">${escapeHtml(eyebrow)}</p>`
      : "";
    const secondaryCinematic = secondaryCtaLabel
      ? `<a href="${escapeHtml(secondaryCtaLink)}" style="min-height:52px;display:inline-flex;align-items:center;padding:0 1.9rem;border:1px solid rgba(255,255,255,0.6);color:#fff;text-decoration:none;font-weight:600;letter-spacing:0.03em;">${escapeHtml(secondaryCtaLabel)}</a>`
      : "";
    return `<section class="hero hero--cinematic" style="position:relative;padding:0;min-height:${cinematicHeight};display:flex;align-items:center;justify-content:center;isolation:isolate;">
  <img src="${escapeHtml(bg)}" alt="${escapeHtml(heroName)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;" />
  <div aria-hidden="true" style="position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg, rgba(10,7,5,0.30) 0%, rgba(10,7,5,0.15) 45%, rgba(10,7,5,0.78) 100%);"></div>
  <div style="max-width:44rem;padding:3rem 1.5rem;text-align:center;color:#fff;">
    ${eyebrowHtml}
    <h1 style="margin:0;color:#fff;font-size:clamp(2.6rem, 6vw, 4.6rem);line-height:1.04;letter-spacing:-0.015em;font-weight:600;">${escapeHtml(headline)}</h1>
    <span aria-hidden="true" style="display:block;width:56px;height:1px;background:var(--color-accent-500);margin:1.6rem auto;"></span>
    ${subhead ? `<p style="margin:0 auto 2rem;max-width:34rem;color:rgba(255,255,255,0.9);font-size:var(--step-0);line-height:1.7;">${escapeHtml(subhead)}</p>` : ""}
    <div style="display:flex;gap:0.9rem;justify-content:center;flex-wrap:wrap;">
      <a class="cta" href="${escapeHtml(ctaLink)}" id="primary-action" style="min-height:52px;display:inline-flex;align-items:center;padding:0 2rem;letter-spacing:0.03em;">${escapeHtml(ctaLabel)}</a>
      ${secondaryCinematic}
    </div>
  </div>
</section>`;
  }

  // Theme Engine V3 — "counter" (deli-counter): a bold, utility-first split
  // hero — a solid deli-green block with a big condensed headline and fast
  // ordering CTAs beside a bright sandwich image (tenant photo, else a
  // saturated deli placeholder). Energetic and commerce-forward, the opposite
  // of Maison's cinematic restraint.
  if (variant === "counter") {
    const img = ctx.assets.heroUrl ?? ctx.assets.heroBackgroundUrl ?? deliSubPlaceholder(ctx.definition.restaurantName);
    const eyebrow = badge || "Neighborhood Deli";
    const secondary = secondaryCtaLabel || "View menu";
    return `<section class="hero hero--counter" style="padding:0;background:var(--color-primary-600);color:#fff;overflow:hidden;">
  <style>
    .hero--counter .hc-grid{display:grid;grid-template-columns:1fr;align-items:stretch;}
    .hero--counter .hc-img{min-height:220px;}
    @media (min-width:820px){ .hero--counter .hc-grid{grid-template-columns:1.05fr 0.95fr;} .hero--counter .hc-img{min-height:420px;} }
  </style>
  <div class="hc-grid">
    <div style="padding:clamp(2rem,5vw,4rem);display:flex;flex-direction:column;justify-content:center;gap:1rem;">
      <p style="margin:0;font-size:0.72rem;letter-spacing:0.28em;text-transform:uppercase;color:var(--color-accent-400);">${escapeHtml(eyebrow)}</p>
      <h1 style="margin:0;color:#fff;font-size:clamp(2.6rem,6vw,4.4rem);line-height:0.98;text-transform:uppercase;letter-spacing:0.005em;">${escapeHtml(headline)}</h1>
      ${subhead ? `<p style="margin:0.25rem 0 0;color:rgba(255,255,255,0.92);font-size:var(--step-0);max-width:34ch;">${escapeHtml(subhead)}</p>` : ""}
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:0.75rem;">
        <a class="cta" href="${escapeHtml(ctaLink)}" id="primary-action" style="background:var(--color-accent-500);color:var(--color-text-900);font-weight:800;text-transform:uppercase;letter-spacing:0.04em;min-height:52px;display:inline-flex;align-items:center;padding:0 1.9rem;">${escapeHtml(ctaLabel)}</a>
        <a href="${escapeHtml(secondaryCtaLink)}" style="min-height:52px;display:inline-flex;align-items:center;padding:0 1.6rem;border:2px solid rgba(255,255,255,0.7);color:#fff;text-decoration:none;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(secondary)}</a>
      </div>
    </div>
    <div class="hc-img" style="position:relative;"><img src="${escapeHtml(img)}" alt="${escapeHtml(heroName)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" /></div>
  </div>
</section>`;
  }

  if (FULL_BLEED_VARIANTS.has(variant)) {
    const backgroundUrl = ctx.assets.heroBackgroundUrl ?? ctx.assets.heroUrl;
    const imageHtml = backgroundUrl
      ? `<img src="${escapeHtml(backgroundUrl)}" alt="${escapeHtml(heroName)}" style="width:100%;height:${minHeight};object-fit:cover;display:block;" />`
      : fullBleedFallback(heroName, minHeight);
    // bold-block: heavier scrim + uppercase display headline for a punchier, commerce-forward statement.
    const headlineStyle = isBold
      ? "color:#ffffff;margin:0 0 0.5rem;text-transform:uppercase;letter-spacing:0.02em;font-size:var(--step-2);"
      : "color:#ffffff;margin:0 0 0.5rem;";

    // padding:0 overrides the global `section { padding: var(--content-spacing) 0 }`
    // rule (theme-css.ts) so a full-bleed hero really is edge-to-edge; without it
    // a theme with roomy content spacing leaves strips above/below the image that
    // the scrim overlay tints, breaking the cinematic effect.
    return `<section class="hero hero--${escapeHtml(variant)}" style="position:relative;padding:0;">
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
  const hue = deterministicHue(heroName);
  const frameBorder = isWarmFrame ? "border:8px solid var(--color-surface-50);" : "";
  const insetFallback = `<div aria-hidden="true" style="width:100%;max-width:${insetMaxWidth};aspect-ratio:4/3;border-radius:var(--radius);box-shadow:var(--shadow);${frameBorder}background:linear-gradient(135deg, hsl(${hue} 45% 90%), hsl(${(hue + 40) % 360} 45% 80%));"></div>`;
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
