import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

function slugifyCategory(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Sprint 20A Task 5 — reads the real, live menu (same source as "menu"/"featuredProducts"), never fabricated categories. */
export function renderFeaturedCategories(section: SectionBlock, ctx: RenderContext): string {
  const title = typeof section.props.title === "string" ? section.props.title : "Explore the Menu";
  const subtitle = typeof section.props.subtitle === "string" ? section.props.subtitle : "";
  const limit = typeof section.props.limit === "number" ? section.props.limit : 6;

  const categories = ctx.liveMenu.filter((c) => c.items.some((item) => item.isAvailable)).slice(0, limit);
  if (categories.length === 0) return "";

  const cards = categories
    .map(
      (category) => `<a href="/menu#${slugifyCategory(category.name)}" class="card" style="display:block;padding:1.25rem;text-decoration:none;color:inherit;background:var(--color-surface-100);">
      <h3 style="margin:0;">${escapeHtml(category.name)}</h3>
      <p style="margin:0.25rem 0 0;color:var(--color-text-700);">${category.items.filter((i) => i.isAvailable).length} items</p>
    </a>`,
    )
    .join("\n");

  return `<section class="featured-categories">
  <h2>${escapeHtml(title)}</h2>
  ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:1rem;">
    ${cards}
  </div>
</section>`;
}
