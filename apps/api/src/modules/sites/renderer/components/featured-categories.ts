import { resolveCategoryImage } from "../asset-resolver";
import { escapeHtml } from "../html-escape";
import { ambientPlaceholder } from "../placeholder-imagery";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

function slugifyCategory(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Featured categories — premium "explore the menu" cards. Each card is a tall
 * image (the category's real uploaded photo when present, else an art-directed
 * ambient placeholder — never a flat tile) with an editorial serif label and
 * item count set over a soft bottom scrim. Reads as a hospitality-grade menu
 * index rather than a grid of buttons.
 */
export function renderFeaturedCategories(section: SectionBlock, ctx: RenderContext): string {
  // Sprint 5.5 — vertical-aware labels from the Brand Kit vocabulary (falls back
  // to the food-first defaults when no Brand Kit is present).
  const vocab = ctx.definition.vocabulary;
  const title = typeof section.props.title === "string" ? section.props.title : (vocab?.exploreLabel ?? "Explore the menu");
  const eyebrow = typeof section.props.eyebrow === "string" ? section.props.eyebrow : (vocab ? `The ${vocab.catalogNoun}` : "The Menu");
  const limit = typeof section.props.limit === "number" ? section.props.limit : 6;

  const categories = ctx.liveMenu.filter((c) => c.items.some((item) => item.isAvailable)).slice(0, limit);
  if (categories.length === 0) return "";

  const cards = categories
    .map((category) => {
      const count = category.items.filter((i) => i.isAvailable).length;
      const unit = count === 1 ? (vocab?.categoryUnitSingular ?? "dish") : (vocab?.categoryUnitPlural ?? "dishes");
      // Impression resolver: real → AI (Sprint 5.5) → curated stock; the SVG
      // floor (ambientPlaceholder) is applied here when the chain yields nothing.
      const img = resolveCategoryImage(category.name, category.imageUrl, ctx) ?? ambientPlaceholder(category.name);
      return `<a href="/menu#${slugifyCategory(category.name)}" class="cat-card" style="position:relative;display:block;aspect-ratio:4/5;border-radius:2px;overflow:hidden;text-decoration:none;color:#fff;isolation:isolate;">
      <img src="${escapeHtml(img)}" alt="${escapeHtml(category.name)}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;" />
      <span aria-hidden="true" style="position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg, rgba(10,7,5,0.05) 30%, rgba(10,7,5,0.72) 100%);"></span>
      <span style="position:absolute;left:1.25rem;right:1.25rem;bottom:1.15rem;">
        <span style="display:block;font-size:0.62rem;letter-spacing:0.24em;text-transform:uppercase;color:var(--color-accent-400);margin-bottom:0.35rem;">${count} ${unit}</span>
        <span style="display:block;font-family:var(--font-display);font-size:1.5rem;line-height:1.1;">${escapeHtml(category.name)}</span>
      </span>
    </a>`;
    })
    .join("\n");

  return `<section class="featured-categories" aria-labelledby="fc-title">
  <p style="text-align:center;font-size:0.72rem;letter-spacing:0.28em;text-transform:uppercase;color:var(--color-accent-600);margin:0 0 0.6rem;">${escapeHtml(eyebrow)}</p>
  <h2 id="fc-title" style="text-align:center;margin:0 0 2.25rem;font-size:var(--step-1);">${escapeHtml(title)}</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:1.1rem;">
    ${cards}
  </div>
</section>`;
}
