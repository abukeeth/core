import { escapeHtml } from "../html-escape";
import { renderImageOrFallback } from "../image-fallback";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/**
 * Sprint 20A Task 5 — real order-history data (ctx.bestSellers, resolved
 * by render-site.ts via analytics.service.ts's getTopItems over the last
 * 30 days), never fabricated. Renders nothing until the restaurant has
 * real order history. §Website Builder — each card shows the item's real
 * uploaded photo, or the same polished deterministic fallback tile used
 * everywhere else.
 */
export function renderBestSellers(section: SectionBlock, ctx: RenderContext): string {
  const title = typeof section.props.title === "string" ? section.props.title : "Best Sellers";
  const limit = typeof section.props.limit === "number" ? section.props.limit : 6;

  const items = ctx.bestSellers.slice(0, limit);
  if (items.length === 0) return "";

  const cards = items
    .map(
      (item, index) => `<li class="card" style="list-style:none;padding:1rem;background:var(--color-surface-100);position:relative;">
      <span style="position:absolute;top:0.5rem;right:0.5rem;background:var(--color-accent-600);color:#fff;border-radius:999px;padding:0.15rem 0.6rem;font-size:var(--step--1);font-weight:700;z-index:1;">#${index + 1}</span>
      ${renderImageOrFallback(item.name, item.imageUrl, "4/3")}
      <h3 style="margin:0.75rem 0 0;">${escapeHtml(item.name)}</h3>
      <p style="margin:0.25rem 0 0;color:var(--color-text-700);">${item.quantitySold} sold this month</p>
    </li>`,
    )
    .join("\n");

  return `<section class="best-sellers">
  <h2>${escapeHtml(title)}</h2>
  <ul style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:1rem;padding:0;">
    ${cards}
  </ul>
</section>`;
}
