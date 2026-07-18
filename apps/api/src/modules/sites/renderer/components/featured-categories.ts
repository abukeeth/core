import { escapeHtml } from "../html-escape";
import { renderPhoto } from "../image-fallback";
import { pickStockPhoto } from "../imagery";
import type { RenderContext } from "../render-context";
import type { SectionBlock, StyleFamilyValue } from "../../types";

function slugifyCategory(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Per-family category-card framing so each design system's menu explorer feels distinct. */
function familyCard(family: StyleFamilyValue | undefined): string {
  switch (family) {
    case "LUXURY":
      return "background:var(--color-surface-900);color:#fff;border:2px solid var(--color-surface-900);";
    case "MINIMAL":
      return "background:var(--color-surface-100);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;";
    default:
      return "background:var(--color-surface-100);border-radius:var(--radius);overflow:hidden;";
  }
}

/**
 * Sprint 20A Task 5 / Theme Engine V2 — reads the real, live menu (never
 * fabricated categories). Each card shows the category's real uploaded photo,
 * else a curated stock photo matched to the category name and cuisine, layered
 * over a generated fallback — so it never renders as a text-only grid.
 */
export function renderFeaturedCategories(section: SectionBlock, ctx: RenderContext): string {
  const title = typeof section.props.title === "string" ? section.props.title : "Explore the Menu";
  const subtitle = typeof section.props.subtitle === "string" ? section.props.subtitle : "";
  const limit = typeof section.props.limit === "number" ? section.props.limit : 6;

  const categories = ctx.liveMenu.filter((c) => c.items.some((item) => item.isAvailable)).slice(0, limit);
  if (categories.length === 0) return "";

  const { cuisine, businessType, styleFamily } = ctx.definition;
  const cardStyle = familyCard(styleFamily);

  const cards = categories
    .map((category) => {
      const photo = renderPhoto({
        name: category.name,
        imageUrl: category.imageUrl,
        stockUrl: pickStockPhoto({ slot: "category", cuisine, businessType, key: category.name }),
        aspectRatio: "4/3",
        rounded: false,
      });
      return `<a href="/menu#${slugifyCategory(category.name)}" class="card" style="display:block;text-decoration:none;color:inherit;${cardStyle}">
      ${photo}
      <div style="padding:0.85rem 1rem 1rem;">
        <h3 style="margin:0;">${escapeHtml(category.name)}</h3>
        <p style="margin:0.25rem 0 0;opacity:0.75;">${category.items.filter((i) => i.isAvailable).length} items</p>
      </div>
    </a>`;
    })
    .join("\n");

  return `<section class="featured-categories">
  <h2>${escapeHtml(title)}</h2>
  ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:1rem;margin-top:1.25rem;">
    ${cards}
  </div>
</section>`;
}
