import { escapeHtml } from "../html-escape";
import { renderProductCard, renderProductGrid, bestSellerNameSet, type ProductCardItem, type ProductCardStyle } from "./product-card";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/**
 * Flagship — a titled grid of REAL menu items from one category (the vape
 * theme's Devices / E-Liquids / … sections; assemble expands one marker into
 * one of these per real category). Items are passed in props by assemble; the
 * section self-omits when the category has no items, so nothing is ever an
 * empty band. Card style is chosen by the active theme.
 */
export function renderProductCollection(section: SectionBlock, ctx: RenderContext): string {
  const items = Array.isArray(section.props.items) ? (section.props.items as ProductCardItem[]) : [];
  if (items.length === 0) return "";

  const title = typeof section.props.title === "string" ? section.props.title : "Collection";
  const eyebrow = typeof section.props.eyebrow === "string" ? section.props.eyebrow : "";
  const style: ProductCardStyle = ctx.definition.themeKey === "deli-brooklyn" ? "deli" : "vape";

  const bestSellers = bestSellerNameSet(ctx);
  const cards = items.map((item) => renderProductCard(item, ctx, { style, bestSellers }));

  return `<section aria-label="${escapeHtml(title)}">
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin:0 0 1.4rem;flex-wrap:wrap;">
    <div>
      ${eyebrow ? `<p style="margin:0 0 0.4rem;font-size:0.68rem;letter-spacing:0.24em;text-transform:uppercase;color:var(--color-accent-500);">${escapeHtml(eyebrow)}</p>` : ""}
      <h2 style="margin:0;font-size:var(--step-1);">${escapeHtml(title)}</h2>
    </div>
    <a href="${escapeHtml(`${ctx.orderingBaseUrl}/order/${ctx.restaurantId}`)}" style="color:var(--color-accent-500);text-decoration:none;font-weight:600;font-size:var(--step--1);letter-spacing:0.04em;white-space:nowrap;">Shop all →</a>
  </div>
  ${renderProductGrid(cards, style)}
</section>`;
}
