import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/**
 * Vape flagship — "Shop the Collection" strip. There is no per-item brand data
 * in the model, so this is NOT a fabricated brand-logo wall: it's a premium
 * strip of the tenant's REAL menu categories (passed in props by assemble),
 * each a tappable tile linking into the menu. Self-omits when there are none.
 */
export function renderFeaturedBrands(section: SectionBlock, _ctx: RenderContext): string {
  const categories = Array.isArray(section.props.categories)
    ? (section.props.categories as string[]).filter((c) => typeof c === "string" && c.trim().length > 0)
    : [];
  if (categories.length === 0) return "";

  const tiles = categories
    .map(
      (name) => `<a href="/menu#${encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"))}" style="flex:1 1 160px;min-width:0;text-decoration:none;display:flex;align-items:center;justify-content:center;text-align:center;padding:1.4rem 1rem;border:1px solid color-mix(in srgb, var(--color-primary-500) 26%, transparent);border-radius:var(--radius);background:linear-gradient(160deg, color-mix(in srgb, var(--color-primary-600) 16%, transparent), transparent);color:var(--color-text-900);font-family:var(--font-display);font-size:1.05rem;letter-spacing:0.02em;">${escapeHtml(name)}</a>`,
    )
    .join("\n");

  return `<section aria-labelledby="collection-title">
  <p style="margin:0 0 0.5rem;font-size:0.68rem;letter-spacing:0.26em;text-transform:uppercase;color:var(--color-accent-500);">Explore</p>
  <h2 id="collection-title" style="margin:0 0 1.4rem;font-size:var(--step-1);">Shop the collection</h2>
  <div style="display:flex;flex-wrap:wrap;gap:0.9rem;">
    ${tiles}
  </div>
</section>`;
}
