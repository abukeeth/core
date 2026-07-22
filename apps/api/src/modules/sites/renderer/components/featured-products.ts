import { escapeHtml } from "../html-escape";
import { renderImageOrFallback, resolveProductImageUrl } from "../image-fallback";
import { featurePlaceholder } from "../placeholder-imagery";
import { formatPrice, type RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

interface FlatMenuItem {
  name: string;
  description?: string;
  priceCents: number;
  imageUrl?: string;
}

/**
 * Featured products — premium visual product cards for a hospitality
 * storefront. Every card leads with imagery (the dish's real uploaded photo,
 * else an art-directed plated placeholder — never a text-only tile), then an
 * editorial serif name, a quiet description, and a hairline footer pairing the
 * price with a discreet order action. Sourced from the real live menu.
 */
export function renderFeaturedProducts(section: SectionBlock, ctx: RenderContext): string {
  const props = section.props;
  const title = typeof props.title === "string" ? props.title : "Signature dishes";
  const eyebrow = typeof props.eyebrow === "string" ? props.eyebrow : "Favourites";
  const productSource = typeof props.productSource === "string" ? props.productSource : "all";
  const limit = typeof props.limit === "number" ? props.limit : 6;
  const showPrice = typeof props.showPrice === "boolean" ? props.showPrice : true;
  const showDescriptions = typeof props.showDescriptions === "boolean" ? props.showDescriptions : true;
  const showOrderButtons = typeof props.showOrderButtons === "boolean" ? props.showOrderButtons : true;

  const categories = productSource === "all" ? ctx.liveMenu : ctx.liveMenu.filter((c) => c.name === productSource);
  const items: FlatMenuItem[] = categories
    .flatMap((c) => c.items)
    .filter((item) => item.isAvailable)
    .slice(0, limit);

  if (items.length === 0) return "";

  const orderUrl = `${ctx.orderingBaseUrl}/order/${escapeHtml(ctx.restaurantId)}`;

  // Theme Engine V3 — restaurant-maison presents its signatures as large,
  // alternating editorial features (image ↔ text) rather than a card grid: a
  // moody feature photo, an oversized serif name, the ingredient line, and a
  // quiet price/order — a magazine spread that builds desire before it sells.
  if (ctx.definition.themeKey === "restaurant-maison") {
    const features = items
      .slice(0, 3)
      .map((item, i) => {
        const img = item.imageUrl ?? featurePlaceholder(item.name);
        const rev = i % 2 === 1 ? " rev" : "";
        return `<article class="maison-feature${rev}">
        <div class="mf-img"><img src="${escapeHtml(img)}" alt="${escapeHtml(item.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>
        <div class="mf-text">
          <p style="margin:0 0 0.9rem;font-size:0.7rem;letter-spacing:0.28em;text-transform:uppercase;color:var(--color-accent-600);">No. ${String(i + 1).padStart(2, "0")}</p>
          <h3 style="margin:0;font-size:clamp(1.9rem, 3.5vw, 2.9rem);line-height:1.08;letter-spacing:-0.01em;">${escapeHtml(item.name)}</h3>
          ${showDescriptions && item.description ? `<p style="margin:1rem 0 0;color:var(--color-text-600);font-size:var(--step-0);line-height:1.75;max-width:34ch;">${escapeHtml(item.description)}</p>` : ""}
          <div style="display:flex;align-items:center;gap:1.5rem;margin-top:1.75rem;">
            ${showPrice ? `<span style="font-family:var(--font-display);font-size:1.4rem;">$${formatPrice(item.priceCents)}</span>` : ""}
            ${showOrderButtons ? `<a href="${orderUrl}" style="font-size:0.72rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--color-primary-700);text-decoration:none;border-bottom:1px solid var(--color-accent-500);padding-bottom:3px;">Add to order</a>` : ""}
          </div>
        </div>
      </article>`;
      })
      .join("\n");
    return `<section class="featured-products" aria-labelledby="fp-title">
  <style>
    .maison-feature{display:grid;grid-template-columns:1fr;gap:1.5rem;align-items:center;margin:0 auto clamp(3rem,7vw,5.5rem);max-width:64rem;}
    .maison-feature:last-child{margin-bottom:0;}
    .maison-feature .mf-img{aspect-ratio:4/3;overflow:hidden;border-radius:2px;}
    @media (min-width:820px){
      .maison-feature{grid-template-columns:1fr 1fr;gap:clamp(2.5rem,5vw,4.5rem);}
      .maison-feature .mf-img{aspect-ratio:4/5;}
      .maison-feature.rev .mf-img{order:2;}
    }
  </style>
  <p style="text-align:center;font-size:0.72rem;letter-spacing:0.28em;text-transform:uppercase;color:var(--color-accent-600);margin:0 0 0.6rem;">${escapeHtml(eyebrow)}</p>
  <h2 id="fp-title" style="text-align:center;margin:0 0 clamp(2.5rem,6vw,4rem);font-size:var(--step-2);">${escapeHtml(title)}</h2>
  ${features}
</section>`;
  }

  const cards = items
    .map((item) => {
      // Sprint 5.5 — product tiles NEVER use AI or food-plate imagery: a real
      // imported photo when present, else the premium typographic monogram tile
      // (vertical-neutral) — so a vape/retail product is never shown as a dish.
      return `<li class="product-card" style="list-style:none;display:flex;flex-direction:column;background:var(--color-surface-50);border:1px solid var(--color-surface-200);border-radius:2px;overflow:hidden;">
      ${renderImageOrFallback(item.name, resolveProductImageUrl(ctx, item.name, item.imageUrl), "4/3")}
      <div style="display:flex;flex-direction:column;gap:0.4rem;padding:1.15rem 1.25rem 1.25rem;flex:1;">
        <h3 style="margin:0;font-size:1.25rem;line-height:1.2;">${escapeHtml(item.name)}</h3>
        ${showDescriptions && item.description ? `<p style="margin:0;color:var(--color-text-600);font-size:var(--step--1);line-height:1.6;flex:1;">${escapeHtml(item.description)}</p>` : "<span style=\"flex:1;\"></span>"}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-top:0.6rem;padding-top:0.9rem;border-top:1px solid var(--color-surface-200);">
          ${showPrice ? `<span style="font-family:var(--font-display);font-size:1.15rem;">$${formatPrice(item.priceCents)}</span>` : "<span></span>"}
          ${showOrderButtons ? `<a href="${orderUrl}" style="font-size:0.72rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--color-primary-700);text-decoration:none;border-bottom:1px solid var(--color-accent-500);padding-bottom:2px;">Order</a>` : ""}
        </div>
      </div>
    </li>`;
    })
    .join("\n");

  return `<section class="featured-products" aria-labelledby="fp-title">
  <p style="text-align:center;font-size:0.72rem;letter-spacing:0.28em;text-transform:uppercase;color:var(--color-accent-600);margin:0 0 0.6rem;">${escapeHtml(eyebrow)}</p>
  <h2 id="fp-title" style="text-align:center;margin:0 0 2.25rem;font-size:var(--step-1);">${escapeHtml(title)}</h2>
  <ul style="display:grid;grid-template-columns:repeat(auto-fit, minmax(250px, 1fr));gap:1.4rem;padding:0;margin:0;">
    ${cards}
  </ul>
</section>`;
}
