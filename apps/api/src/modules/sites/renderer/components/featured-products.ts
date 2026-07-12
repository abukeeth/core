import { escapeHtml } from "../html-escape";
import { formatPrice, type RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

interface FlatMenuItem {
  name: string;
  description?: string;
  priceCents: number;
}

/** Sprint 20A Task 5 — "Featured Products": a live-menu-sourced, count-limited product grid, distinct from the AI-curated "signatureDishes" block. Product source is either the full live menu or one named category. */
export function renderFeaturedProducts(section: SectionBlock, ctx: RenderContext): string {
  const props = section.props;
  const title = typeof props.title === "string" ? props.title : "Featured";
  const subtitle = typeof props.subtitle === "string" ? props.subtitle : "";
  const productSource = typeof props.productSource === "string" ? props.productSource : "all";
  const limit = typeof props.limit === "number" ? props.limit : 6;
  const cardLayout = typeof props.cardLayout === "string" ? props.cardLayout : (ctx.definition.productPresentation?.cardLayout ?? "grid");
  const showPrice = typeof props.showPrice === "boolean" ? props.showPrice : true;
  const showDescriptions = typeof props.showDescriptions === "boolean" ? props.showDescriptions : true;
  const showOrderButtons = typeof props.showOrderButtons === "boolean" ? props.showOrderButtons : true;

  const categories = productSource === "all" ? ctx.liveMenu : ctx.liveMenu.filter((c) => c.name === productSource);
  const items: FlatMenuItem[] = categories
    .flatMap((c) => c.items)
    .filter((item) => item.isAvailable)
    .slice(0, limit);

  if (items.length === 0) return "";

  const isList = cardLayout === "list";
  const cards = items
    .map(
      (item) => `<li class="card" style="list-style:none;padding:1rem;background:var(--color-surface-100);${isList ? "display:flex;justify-content:space-between;align-items:center;gap:1rem;" : ""}">
      <div>
        <h3 style="margin:0 0 0.25rem;">${escapeHtml(item.name)}</h3>
        ${showDescriptions && item.description ? `<p style="margin:0 0 0.25rem;color:var(--color-text-700);">${escapeHtml(item.description)}</p>` : ""}
        ${showPrice ? `<p style="margin:0;font-weight:600;">$${formatPrice(item.priceCents)}</p>` : ""}
      </div>
      ${showOrderButtons ? `<a class="cta" href="${escapeHtml(ctx.orderingBaseUrl)}/order/${escapeHtml(ctx.restaurantId)}">Order</a>` : ""}
    </li>`,
    )
    .join("\n");

  return `<section class="featured-products">
  <h2>${escapeHtml(title)}</h2>
  ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
  <ul style="${
    isList
      ? "display:flex;flex-direction:column;gap:0.75rem;padding:0;"
      : "display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;padding:0;"
  }">
    ${cards}
  </ul>
</section>`;
}
