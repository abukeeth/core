import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/**
 * Deli flagship — "Catering" band. A split editorial panel: an art-directed
 * media tile beside a generic, truthful catering invitation (no invented
 * package prices or head-counts). The CTA routes to the real ordering flow, or
 * to a tel: link when the tenant has a real phone number. Renders for the deli
 * theme; always available (no data dependency), so a new deli still gets it.
 */
export function renderCatering(section: SectionBlock, ctx: RenderContext): string {
  const orderUrl = `${ctx.orderingBaseUrl}/order/${ctx.restaurantId}`;
  const phone = typeof section.props.phone === "string" ? section.props.phone : undefined;
  const primary = phone
    ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}" style="display:inline-block;background:#fff;color:var(--color-primary-700,var(--color-primary-600));text-decoration:none;border-radius:999px;padding:0.8rem 1.8rem;font-weight:700;">Call to plan an order</a>`
    : `<a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#fff;color:var(--color-primary-700,var(--color-primary-600));text-decoration:none;border-radius:999px;padding:0.8rem 1.8rem;font-weight:700;">Start a large order</a>`;

  return `<section aria-labelledby="catering-title">
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:0;border-radius:calc(var(--radius) + 12px);overflow:hidden;box-shadow:var(--shadow);">
    <div style="min-height:220px;background:
        linear-gradient(135deg, color-mix(in srgb, var(--color-primary-600) 82%, #000) 0%, var(--color-primary-600) 55%, var(--color-accent-600) 140%);"></div>
    <div style="background:var(--color-primary-700,var(--color-primary-600));color:#fff;padding:clamp(1.75rem,4vw,3rem);display:flex;flex-direction:column;justify-content:center;gap:1rem;">
      <p style="margin:0;font-size:0.72rem;letter-spacing:0.26em;text-transform:uppercase;color:var(--color-accent-400,var(--color-accent-500));">Feeding a crowd?</p>
      <h2 id="catering-title" style="margin:0;color:#fff;font-size:var(--step-1);max-width:18ch;">Catering & large orders</h2>
      <p style="margin:0;color:rgba(255,255,255,0.78);max-width:44ch;line-height:1.6;">Offices, game days, get-togethers — order platters and party-size trays ahead and we&rsquo;ll have it ready when you are.</p>
      <div>${primary}</div>
    </div>
  </div>
</section>`;
}
