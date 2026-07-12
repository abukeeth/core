import { escapeHtml } from "../html-escape";
import { formatPrice, type RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

function slugifyCategory(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * §5 Menu Page Builder — renders from `ctx.liveMenu` (fetched fresh by the
 * caller at render/revalidation time), never from whatever was baked into
 * the stored SiteDefinition at generation time. This is the one section
 * that's the "single source of truth reflects live data" requirement —
 * a price change is visible the next time this page is (re)rendered,
 * without regenerating the site (§5, acceptance criterion #8).
 *
 * Sprint 20A Task 5 reads `ctx.definition.productPresentation` for real,
 * renderable presentation controls (card layout, info density, price
 * style, out-of-stock appearance) — deliberately excludes "image ratio"
 * and "dietary badges" from that settings surface, since MenuItem has
 * neither an image nor a dietary-tag field in this data model (adding
 * those toggles would change nothing visible, exactly the "disconnected
 * control" the task forbids).
 */
export function renderMenuSection(section: SectionBlock, ctx: RenderContext): string {
  const presentation = ctx.definition.productPresentation;
  const cardLayout = presentation?.cardLayout ?? "list";
  const infoDensity = presentation?.infoDensity ?? "detailed";
  const priceStyle = presentation?.priceStyle ?? "standard";
  const outOfStock = presentation?.outOfStockAppearance ?? "hidden";
  const showModifiersBadge = presentation?.showModifiersBadge ?? false;
  const navStyle = presentation?.categoryNavStyle ?? "sticky";

  const categoriesWithVisibleItems = ctx.liveMenu.filter(
    (category) => outOfStock !== "hidden" || category.items.some((item) => item.isAvailable),
  );

  if (categoriesWithVisibleItems.length === 0) {
    return `<section class="menu"><h2>Menu</h2><p>Menu coming soon.</p></section>`;
  }

  const nav = `<nav class="menu-nav" style="${navStyle === "sticky" ? "position:sticky;top:0;" : ""}background:var(--color-surface-50);padding:0.5rem 0;display:flex;gap:1rem;overflow-x:auto;">
    ${categoriesWithVisibleItems.map((c) => `<a href="#${slugifyCategory(c.name)}">${escapeHtml(c.name)}</a>`).join("\n")}
  </nav>`;

  const priceStyleAttr = priceStyle === "bold" ? "font-weight:800;font-size:var(--step-0);" : priceStyle === "minimal" ? "font-weight:400;color:var(--color-text-700);" : "font-weight:600;";

  const sections = categoriesWithVisibleItems
    .map((category) => {
      const visibleItems = outOfStock === "hidden" ? category.items.filter((item) => item.isAvailable) : category.items;
      if (visibleItems.length === 0) return "";

      const items = visibleItems
        .map((item) => {
          const outOfStockBadge = !item.isAvailable && outOfStock === "badge" ? `<span style="background:var(--color-surface-300);color:var(--color-text-700);border-radius:999px;padding:0.1rem 0.5rem;font-size:var(--step--1);margin-left:0.5rem;">Sold out</span>` : "";
          const dimStyle = !item.isAvailable && outOfStock === "dimmed" ? "opacity:0.5;" : "";
          const modifiersBadge = showModifiersBadge ? `<span style="color:var(--color-text-700);font-size:var(--step--1);"> · Customizable</span>` : "";

          return `<li data-item-name="${escapeHtml(item.name)}" style="display:flex;justify-content:space-between;gap:1rem;padding:0.5rem 0;border-bottom:1px solid var(--color-surface-200);${dimStyle}">
        <span>
          <strong>${escapeHtml(item.name)}</strong>${outOfStockBadge}${modifiersBadge}
          ${infoDensity === "detailed" && item.description ? `<br /><small style="color:var(--color-text-700);">${escapeHtml(item.description)}</small>` : ""}
        </span>
        <span style="white-space:nowrap;${priceStyleAttr}">$${formatPrice(item.priceCents)}</span>
      </li>`;
        })
        .join("\n");

      return `<div id="${slugifyCategory(category.name)}" class="menu-category">
    <h3>${escapeHtml(category.name)}</h3>
    <ul style="list-style:none;padding:0;margin:0;${cardLayout === "grid" ? "display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:0.5rem 1rem;" : ""}">${items}</ul>
  </div>`;
    })
    .join("\n");

  return `<section class="menu">
  <h2>Menu</h2>
  ${nav}
  ${sections}
</section>`;
}
