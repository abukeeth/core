import { escapeHtml } from "../html-escape";
import { renderImageOrFallback, resolveProductImageUrl } from "../image-fallback";
import { formatPrice, type RenderContext } from "../render-context";

/**
 * Shared, per-vertical product card for the flagship themes. The deli and vape
 * cards are structurally and visually different (not the same card recolored):
 * different media aspect, badge system, price treatment, and Quick-Add style.
 *
 * Honesty (§2 Guardrails), enforced here so no section can violate it:
 * - Badges come ONLY from real signals. "Best Seller" / "Trending" is shown
 *   solely for items the tenant has actually sold (ctx.bestSellers, real order
 *   history). Nothing else is badged.
 * - Ratings + review counts render ONLY from a real per-item aggregate
 *   (ctx.productStats). There is no such source today, so the star row simply
 *   doesn't render — never a fabricated rating or count.
 */
export interface ProductCardItem {
  name: string;
  description?: string;
  priceCents: number;
  imageUrl?: string;
}

export type ProductCardStyle = "deli" | "vape";

/** Lowercased names of the tenant's real best sellers, for the (real) best-seller badge. */
export function bestSellerNameSet(ctx: RenderContext): Set<string> {
  return new Set(ctx.bestSellers.map((b) => b.name.trim().toLowerCase()));
}

function renderStars(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

/** Real per-item rating row — renders nothing unless a real aggregate exists. */
function ratingRow(ctx: RenderContext, name: string, accentVar: string): string {
  const stat = ctx.productStats?.[name];
  if (!stat || stat.reviewCount <= 0) return "";
  return `<div style="display:flex;align-items:center;gap:0.4rem;margin:0.35rem 0 0;font-size:var(--step--1);">
      <span style="color:${accentVar};letter-spacing:0.05em;" aria-label="${stat.rating.toFixed(1)} out of 5">${renderStars(stat.rating)}</span>
      <span style="color:var(--color-text-600);">(${stat.reviewCount})</span>
    </div>`;
}

function orderUrl(ctx: RenderContext): string {
  return `${ctx.orderingBaseUrl}/order/${ctx.restaurantId}`;
}

function renderDeliCard(item: ProductCardItem, ctx: RenderContext, isBestSeller: boolean): string {
  const img = renderImageOrFallback(item.name, resolveProductImageUrl(ctx, item.name, item.imageUrl), "4/3");
  const badge = isBestSeller
    ? `<span style="position:absolute;top:0.85rem;left:0.85rem;z-index:2;background:var(--color-primary-600);color:#fff;border-radius:999px;padding:0.28rem 0.7rem;font-size:0.66rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Best Seller</span>`
    : "";
  return `<li style="list-style:none;display:flex;flex-direction:column;background:var(--color-surface-100);border:1px solid var(--hairline);border-radius:calc(var(--radius) + 6px);overflow:hidden;box-shadow:var(--shadow);">
    <div style="position:relative;">${badge}${img}</div>
    <div style="display:flex;flex-direction:column;flex:1;padding:1rem 1.1rem 1.15rem;">
      <h3 style="margin:0;font-family:var(--font-display);font-size:1.2rem;line-height:1.25;">${escapeHtml(item.name)}</h3>
      ${item.description ? `<p style="margin:0.3rem 0 0;color:var(--color-text-700);font-size:var(--step--1);line-height:1.5;">${escapeHtml(item.description)}</p>` : ""}
      ${ratingRow(ctx, item.name, "var(--color-accent-600)")}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;margin-top:auto;padding-top:1rem;">
        <span style="font-family:var(--font-display);font-weight:600;font-size:1.35rem;color:var(--color-primary-700);">$${formatPrice(item.priceCents)}</span>
        <a href="${escapeHtml(orderUrl(ctx))}" style="background:var(--color-primary-600);color:#fff;text-decoration:none;border-radius:999px;padding:0.55rem 1.15rem;font-weight:600;font-size:var(--step--1);white-space:nowrap;">Quick Add</a>
      </div>
    </div>
  </li>`;
}

function renderVapeCard(item: ProductCardItem, ctx: RenderContext, isBestSeller: boolean): string {
  const img = renderImageOrFallback(item.name, resolveProductImageUrl(ctx, item.name, item.imageUrl), "1/1");
  const badge = isBestSeller
    ? `<span style="position:absolute;top:0.7rem;left:0.7rem;z-index:2;background:var(--color-accent-500);color:#04121a;border-radius:4px;padding:0.22rem 0.55rem;font-size:0.6rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">Trending</span>`
    : "";
  return `<li style="list-style:none;display:flex;flex-direction:column;background:var(--color-surface-100);border:1px solid color-mix(in srgb, var(--color-primary-500) 22%, transparent);border-radius:var(--radius);overflow:hidden;box-shadow:0 0 0 1px rgba(139,92,246,0.06), 0 18px 40px -24px rgba(139,92,246,0.5);">
    <div style="position:relative;background:radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, var(--color-primary-600) 22%, transparent), transparent 60%);">${badge}${img}</div>
    <div style="display:flex;flex-direction:column;flex:1;padding:0.9rem 0.95rem 1rem;">
      <h3 style="margin:0;font-family:var(--font-display);font-size:0.98rem;line-height:1.2;letter-spacing:0.01em;">${escapeHtml(item.name)}</h3>
      ${ratingRow(ctx, item.name, "var(--color-accent-500)")}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-top:auto;padding-top:0.85rem;">
        <span style="font-family:var(--font-display);font-weight:600;font-size:1.1rem;color:var(--color-accent-400,var(--color-accent-500));">$${formatPrice(item.priceCents)}</span>
        <a href="${escapeHtml(orderUrl(ctx))}" style="background:var(--color-primary-600);color:#fff;text-decoration:none;border-radius:var(--button-radius);padding:0.5rem 0.9rem;font-weight:600;font-size:0.72rem;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;">Add</a>
      </div>
    </div>
  </li>`;
}

export function renderProductCard(
  item: ProductCardItem,
  ctx: RenderContext,
  opts: { style: ProductCardStyle; bestSellers?: Set<string> },
): string {
  const bestSellers = opts.bestSellers ?? bestSellerNameSet(ctx);
  const isBestSeller = bestSellers.has(item.name.trim().toLowerCase());
  return opts.style === "vape" ? renderVapeCard(item, ctx, isBestSeller) : renderDeliCard(item, ctx, isBestSeller);
}

/** Responsive product grid wrapper matching the card style's rhythm. */
export function renderProductGrid(cards: string[], style: ProductCardStyle): string {
  const min = style === "vape" ? "170px" : "230px";
  return `<ul style="display:grid;grid-template-columns:repeat(auto-fill, minmax(${min}, 1fr));gap:${style === "vape" ? "1rem" : "1.4rem"};padding:0;margin:0;">
    ${cards.join("\n")}
  </ul>`;
}
