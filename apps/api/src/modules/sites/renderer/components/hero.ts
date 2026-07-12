import { escapeHtml } from "../html-escape";
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

function readString(props: Record<string, unknown>, key: string, fallback = ""): string {
  return typeof props[key] === "string" ? (props[key] as string) : fallback;
}

/** §3 Hero Builder — 3 variants; auto-contrast scrim when a hero photo is present. Sprint 20A Task 5 adds a secondary CTA, a promo badge, alignment/height controls, and a distinct background-image layer. */
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

  const backgroundUrl = ctx.assets.heroBackgroundUrl ?? (variant === "fullbleed-image" ? ctx.assets.heroUrl : undefined);
  const insetImageUrl = variant === "split" ? ctx.assets.heroUrl : undefined;
  const hasFullBleedImage = variant !== "minimal-typographic" && Boolean(backgroundUrl);

  const badgeHtml = badge ? `<span style="display:inline-block;background:var(--color-accent-600);color:#fff;border-radius:999px;padding:0.25rem 0.75rem;font-size:var(--step--1);font-weight:600;margin-bottom:0.75rem;">${escapeHtml(badge)}</span>` : "";
  const ctaHtml = `<a class="cta" href="${escapeHtml(ctaLink)}" id="primary-action">${escapeHtml(ctaLabel)}</a>`;
  const secondaryCtaHtml = secondaryCtaLabel
    ? `<a href="${escapeHtml(secondaryCtaLink)}" style="margin-left:0.75rem;font-weight:600;color:inherit;text-decoration:underline;">${escapeHtml(secondaryCtaLabel)}</a>`
    : "";
  const minHeight = HEIGHT_VH[height] ?? HEIGHT_VH.medium;

  if (hasFullBleedImage) {
    return `<section class="hero hero--${escapeHtml(variant)}" style="position:relative;">
  <img src="${escapeHtml(backgroundUrl!)}" alt="${escapeHtml(ctx.assets.heroAlt ?? ctx.definition.restaurantName)}" style="width:100%;height:${minHeight};object-fit:cover;display:block;" />
  <div style="position:absolute;inset:0;background:rgba(0,0,0,${overlayOpacity});display:flex;flex-direction:column;justify-content:center;align-items:${
    ALIGN_ITEMS[alignment] ?? ALIGN_ITEMS.center
  };padding:2rem;text-align:${TEXT_ALIGN[alignment] ?? TEXT_ALIGN.center};">
    ${badgeHtml}
    <h1 style="color:#ffffff;margin:0 0 0.5rem;">${escapeHtml(headline)}</h1>
    <p style="color:#ffffff;margin:0 0 1rem;">${escapeHtml(subhead)}</p>
    <div>${ctaHtml}${secondaryCtaHtml}</div>
  </div>
</section>`;
  }

  const insetImageHtml = insetImageUrl
    ? `<img src="${escapeHtml(insetImageUrl)}" alt="${escapeHtml(ctx.assets.heroAlt ?? ctx.definition.restaurantName)}" style="width:100%;max-width:480px;border-radius:var(--radius);box-shadow:var(--shadow);" />`
    : "";

  return `<section class="hero hero--${escapeHtml(variant)}" style="min-height:${minHeight};display:flex;align-items:center;padding:2rem 1rem;gap:2rem;flex-wrap:wrap;justify-content:${
    variant === "split" ? "space-between" : "center"
  };">
  <div style="flex:1;min-width:260px;text-align:${TEXT_ALIGN[alignment] ?? TEXT_ALIGN.center};">
    ${badgeHtml}
    <h1>${escapeHtml(headline)}</h1>
    <p>${escapeHtml(subhead)}</p>
    <div>${ctaHtml}${secondaryCtaHtml}</div>
  </div>
  ${insetImageHtml}
</section>`;
}
