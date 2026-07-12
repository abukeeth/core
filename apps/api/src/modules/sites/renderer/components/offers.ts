import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";
import type { RenderOffer } from "../render-context";

function describeOffer(offer: RenderOffer): string {
  if (offer.type === "PERCENTAGE") return `${offer.value / 100}% off`;
  if (offer.type === "FIXED_AMOUNT") return `$${(offer.value / 100).toFixed(2)} off`;
  return "Free delivery";
}

/** Sprint 20A Task 5 — real, currently-redeemable coupons (ctx.activeOffers, resolved by render-site.ts via coupons.service.ts's listActiveCoupons — the exact same active-window rule checkout enforces), never fabricated promotions. */
export function renderOffers(section: SectionBlock, ctx: RenderContext): string {
  const title = typeof section.props.title === "string" ? section.props.title : "Current Offers";

  if (ctx.activeOffers.length === 0) return "";

  const cards = ctx.activeOffers
    .map(
      (offer) => `<li class="card" style="list-style:none;padding:1rem;background:var(--color-primary-50);">
      <p style="margin:0;font-weight:700;font-size:var(--step-1);">${escapeHtml(describeOffer(offer))}</p>
      <p style="margin:0.25rem 0 0;font-family:monospace;background:var(--color-surface-100);display:inline-block;padding:0.15rem 0.5rem;border-radius:var(--radius);">${escapeHtml(offer.code)}</p>
      ${offer.minOrderCents ? `<p style="margin:0.25rem 0 0;color:var(--color-text-700);">Min order $${(offer.minOrderCents / 100).toFixed(2)}</p>` : ""}
    </li>`,
    )
    .join("\n");

  return `<section class="offers">
  <h2>${escapeHtml(title)}</h2>
  <ul style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;padding:0;">
    ${cards}
  </ul>
</section>`;
}
