import { escapeHtml } from "../html-escape";
import { renderImageOrFallback } from "../image-fallback";
import { formatPrice, type RenderContext, type LiveMenuCategory } from "../render-context";
import type { SectionBlock } from "../../types";

function slugifyCategory(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

type OutOfStockAppearance = "dimmed" | "hidden" | "badge";

function visibleItems(category: LiveMenuCategory, outOfStock: OutOfStockAppearance) {
  return outOfStock === "hidden" ? category.items.filter((item) => item.isAvailable) : category.items;
}

function outOfStockBadgeHtml(isAvailable: boolean, outOfStock: OutOfStockAppearance): string {
  return !isAvailable && outOfStock === "badge"
    ? `<span style="background:var(--color-surface-300);color:var(--color-text-700);border-radius:999px;padding:0.1rem 0.5rem;font-size:var(--step--1);margin-left:0.5rem;">Sold out</span>`
    : "";
}

function dimStyle(isAvailable: boolean, outOfStock: OutOfStockAppearance): string {
  return !isAvailable && outOfStock === "dimmed" ? "opacity:0.5;" : "";
}

function categoryNav(categories: LiveMenuCategory[], navStyle: string): string {
  return `<nav class="menu-nav" style="${navStyle === "sticky" ? "position:sticky;top:0;" : ""}background:var(--color-surface-50);padding:0.5rem 0;display:flex;gap:1rem;overflow-x:auto;">
    ${categories.map((c) => `<a href="#${slugifyCategory(c.name)}">${escapeHtml(c.name)}</a>`).join("\n")}
  </nav>`;
}

/**
 * §Website Builder — Modern Editorial: each category is a full-width row,
 * alternating image-left/image-right, large serif heading, items listed
 * plainly beside the image (no card boxes) — an asymmetric magazine layout,
 * materially different from the card/list treatments below.
 */
function renderEditorialRows(categories: LiveMenuCategory[], outOfStock: OutOfStockAppearance, nav: string): string {
  const sections = categories
    .map((category, index) => {
      const items = visibleItems(category, outOfStock);
      if (items.length === 0) return "";
      const imageFirst = index % 2 === 0;
      const image = `<div style="flex:1;min-width:220px;">${renderImageOrFallback(category.name, category.imageUrl, "16/9")}</div>`;
      const list = `<div style="flex:1.4;min-width:260px;">
        <h3 style="font-size:var(--step-1);letter-spacing:-0.01em;">${escapeHtml(category.name)}</h3>
        <ul style="list-style:none;padding:0;margin:0;">
          ${items
            .map(
              (item) => `<li data-item-name="${escapeHtml(item.name)}" style="display:flex;justify-content:space-between;gap:1rem;padding:0.75rem 0;border-bottom:1px solid var(--color-surface-200);${dimStyle(item.isAvailable, outOfStock)}">
            <span><strong>${escapeHtml(item.name)}</strong>${outOfStockBadgeHtml(item.isAvailable, outOfStock)}${
              item.description ? `<br /><small style="color:var(--color-text-700);">${escapeHtml(item.description)}</small>` : ""
            }</span>
            <span style="white-space:nowrap;font-weight:600;">$${formatPrice(item.priceCents)}</span>
          </li>`,
            )
            .join("\n")}
        </ul>
      </div>`;

      return `<div id="${slugifyCategory(category.name)}" class="menu-category" style="display:flex;flex-wrap:wrap;gap:2rem;align-items:flex-start;padding:2rem 0;border-bottom:1px solid var(--color-surface-200);">
    ${imageFirst ? image + list : list + image}
  </div>`;
    })
    .join("\n");

  return `<section class="menu">
  <h2>Menu</h2>
  ${nav}
  ${sections}
</section>`;
}

/**
 * §Website Builder — Warm Local: circular category thumbnail beside the
 * heading, items as a grid of soft rounded cards with a warm shadow.
 */
function renderWarmCards(categories: LiveMenuCategory[], outOfStock: OutOfStockAppearance, nav: string): string {
  const sections = categories
    .map((category) => {
      const items = visibleItems(category, outOfStock);
      if (items.length === 0) return "";

      const cards = items
        .map(
          (item) => `<li data-item-name="${escapeHtml(item.name)}" style="list-style:none;background:var(--color-surface-100);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;${dimStyle(item.isAvailable, outOfStock)}">
        ${renderImageOrFallback(item.name, item.imageUrl, "4/3")}
        <div style="padding:0.75rem;">
          <strong>${escapeHtml(item.name)}</strong>${outOfStockBadgeHtml(item.isAvailable, outOfStock)}
          ${item.description ? `<p style="margin:0.25rem 0 0;color:var(--color-text-700);font-size:var(--step--1);">${escapeHtml(item.description)}</p>` : ""}
          <p style="margin:0.5rem 0 0;font-weight:600;">$${formatPrice(item.priceCents)}</p>
        </div>
      </li>`,
        )
        .join("\n");

      return `<div id="${slugifyCategory(category.name)}" class="menu-category">
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
      <div style="width:48px;border-radius:999px;overflow:hidden;">${renderImageOrFallback(category.name, category.imageUrl, "1")}</div>
      <h3 style="margin:0;">${escapeHtml(category.name)}</h3>
    </div>
    <ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1.25rem;">${cards}</ul>
  </div>`;
    })
    .join("\n");

  return `<section class="menu">
  <h2>Menu</h2>
  ${nav}
  ${sections}
</section>`;
}

/**
 * §Website Builder — Bold Commerce: dense hard-edged grid, bold uppercase
 * category heading with a colored underline, price shown in a solid badge.
 */
function renderBoldGrid(categories: LiveMenuCategory[], outOfStock: OutOfStockAppearance, nav: string): string {
  const sections = categories
    .map((category) => {
      const items = visibleItems(category, outOfStock);
      if (items.length === 0) return "";

      const cards = items
        .map(
          (item) => `<li data-item-name="${escapeHtml(item.name)}" style="list-style:none;border:2px solid var(--color-surface-900);position:relative;${dimStyle(item.isAvailable, outOfStock)}">
        ${renderImageOrFallback(item.name, item.imageUrl, "1")}
        <div style="padding:0.75rem;">
          <strong style="text-transform:uppercase;letter-spacing:0.02em;">${escapeHtml(item.name)}</strong>${outOfStockBadgeHtml(item.isAvailable, outOfStock)}
          ${item.description ? `<p style="margin:0.25rem 0 0;color:var(--color-text-700);font-size:var(--step--1);">${escapeHtml(item.description)}</p>` : ""}
          <span style="display:inline-block;margin-top:0.5rem;background:var(--color-primary-600);color:#fff;font-weight:800;padding:0.15rem 0.6rem;">$${formatPrice(item.priceCents)}</span>
        </div>
      </li>`,
        )
        .join("\n");

      return `<div id="${slugifyCategory(category.name)}" class="menu-category">
    <h3 style="text-transform:uppercase;letter-spacing:0.04em;display:inline-block;border-bottom:4px solid var(--color-primary-600);padding-bottom:0.25rem;">${escapeHtml(category.name)}</h3>
    <ul style="list-style:none;padding:0;margin:0.75rem 0 0;display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0;">${cards}</ul>
  </div>`;
    })
    .join("\n");

  return `<section class="menu">
  <h2>Menu</h2>
  ${nav}
  ${sections}
</section>`;
}

/**
 * Theme Engine V3 — "editorial-menu" (restaurant-maison): a Michelin-style
 * à-la-carte card. Text-forward and spacious: a centered course heading framed
 * by brass hairlines, then each dish as an elegant name·price row with a quiet
 * description beneath — no image tiles, the classic fine-dining menu. Reads as
 * a printed carte, not a product grid.
 */
function renderEditorialMenu(categories: LiveMenuCategory[], outOfStock: OutOfStockAppearance, nav: string): string {
  const courses = categories
    .map((category) => {
      const items = visibleItems(category, outOfStock);
      if (items.length === 0) return "";
      const rows = items
        .map(
          (item) => `<li data-item-name="${escapeHtml(item.name)}" style="list-style:none;padding:1.15rem 0;border-bottom:1px solid var(--color-surface-200);${dimStyle(item.isAvailable, outOfStock)}">
        <div style="display:flex;align-items:baseline;gap:1rem;">
          <span style="font-family:var(--font-display);font-size:1.2rem;">${escapeHtml(item.name)}${outOfStockBadgeHtml(item.isAvailable, outOfStock)}</span>
          <span aria-hidden="true" style="flex:1;border-bottom:1px dotted var(--color-surface-300);transform:translateY(-0.35rem);"></span>
          <span style="font-family:var(--font-display);font-size:1.1rem;white-space:nowrap;">$${formatPrice(item.priceCents)}</span>
        </div>
        ${item.description ? `<p style="margin:0.4rem 0 0;color:var(--color-text-600);font-size:var(--step--1);line-height:1.6;max-width:44ch;">${escapeHtml(item.description)}</p>` : ""}
      </li>`,
        )
        .join("\n");
      return `<div id="${slugifyCategory(category.name)}" class="menu-course" style="margin:0 auto 3.25rem;max-width:44rem;">
    <div style="display:flex;align-items:center;gap:1.1rem;justify-content:center;margin-bottom:1rem;">
      <span aria-hidden="true" style="height:1px;width:40px;background:var(--color-accent-500);"></span>
      <h3 style="margin:0;text-align:center;font-size:var(--step-1);letter-spacing:0.01em;">${escapeHtml(category.name)}</h3>
      <span aria-hidden="true" style="height:1px;width:40px;background:var(--color-accent-500);"></span>
    </div>
    <ul style="padding:0;margin:0;">${rows}</ul>
  </div>`;
    })
    .join("\n");

  return `<section class="menu">
  <p style="text-align:center;font-size:0.72rem;letter-spacing:0.3em;text-transform:uppercase;color:var(--color-accent-600);margin:0 0 0.6rem;">À la carte</p>
  <h2 style="text-align:center;margin:0 0 2.5rem;font-size:var(--step-2);">Menu</h2>
  ${nav}
  ${courses}
</section>`;
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
 * style, out-of-stock appearance) — deliberately excludes "dietary
 * badges" from that settings surface, since MenuItem has no dietary-tag
 * field in this data model (adding that toggle would change nothing
 * visible, exactly the "disconnected control" the task forbids).
 *
 * §Website Builder — every item/category now renders a real uploaded
 * photo when one exists, or the same polished deterministic fallback
 * tile renderImageOrFallback() uses everywhere else (never a blank/broken
 * image box, never fabricated photography). section.variant additionally
 * selects one of three materially distinct category/product layouts
 * (editorial-rows/warm-cards/bold-grid) — set once per theme at assembly
 * time (assemble.ts), same mechanism theme.variants.hero already used.
 * Every pre-existing variant (classic-list/card-grid/two-column-elegant/
 * undefined) falls through to the original owner-customizable rendering,
 * unchanged.
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

  const nav = categoryNav(categoriesWithVisibleItems, navStyle);

  if (section.variant === "editorial-menu") return renderEditorialMenu(categoriesWithVisibleItems, outOfStock, nav);
  if (section.variant === "editorial-rows") return renderEditorialRows(categoriesWithVisibleItems, outOfStock, nav);
  if (section.variant === "warm-cards") return renderWarmCards(categoriesWithVisibleItems, outOfStock, nav);
  if (section.variant === "bold-grid") return renderBoldGrid(categoriesWithVisibleItems, outOfStock, nav);

  const priceStyleAttr = priceStyle === "bold" ? "font-weight:800;font-size:var(--step-0);" : priceStyle === "minimal" ? "font-weight:400;color:var(--color-text-700);" : "font-weight:600;";

  const sections = categoriesWithVisibleItems
    .map((category) => {
      const items = visibleItems(category, outOfStock);
      if (items.length === 0) return "";

      const itemsHtml = items
        .map((item) => {
          const modifiersBadge = showModifiersBadge ? `<span style="color:var(--color-text-700);font-size:var(--step--1);"> · Customizable</span>` : "";
          const thumb = `<div style="width:${cardLayout === "grid" ? "100%" : "56px"};flex-shrink:0;">${renderImageOrFallback(item.name, item.imageUrl, cardLayout === "grid" ? "4/3" : "1")}</div>`;

          return `<li data-item-name="${escapeHtml(item.name)}" style="display:flex;${cardLayout === "grid" ? "flex-direction:column;" : ""}justify-content:space-between;gap:${cardLayout === "grid" ? "0.5rem" : "1rem"};padding:0.5rem 0;border-bottom:1px solid var(--color-surface-200);${dimStyle(item.isAvailable, outOfStock)}">
        ${thumb}
        <span style="display:flex;justify-content:space-between;gap:1rem;flex:1;">
          <span>
            <strong>${escapeHtml(item.name)}</strong>${outOfStockBadgeHtml(item.isAvailable, outOfStock)}${modifiersBadge}
            ${infoDensity === "detailed" && item.description ? `<br /><small style="color:var(--color-text-700);">${escapeHtml(item.description)}</small>` : ""}
          </span>
          <span style="white-space:nowrap;${priceStyleAttr}">$${formatPrice(item.priceCents)}</span>
        </span>
      </li>`;
        })
        .join("\n");

      return `<div id="${slugifyCategory(category.name)}" class="menu-category">
    <div style="display:flex;align-items:center;gap:0.75rem;">
      <div style="width:40px;flex-shrink:0;">${renderImageOrFallback(category.name, category.imageUrl, "1")}</div>
      <h3 style="margin:0;">${escapeHtml(category.name)}</h3>
    </div>
    <ul style="list-style:none;padding:0;margin:0.5rem 0 0;${cardLayout === "grid" ? "display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:0.5rem 1rem;" : ""}">${itemsHtml}</ul>
  </div>`;
    })
    .join("\n");

  return `<section class="menu">
  <h2>Menu</h2>
  ${nav}
  ${sections}
</section>`;
}
