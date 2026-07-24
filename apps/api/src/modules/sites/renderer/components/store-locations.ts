import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/**
 * Vape flagship — "Store Locations". The data model has a single real address
 * per tenant (no multi-location model yet), so this renders that ONE real
 * location as a premium dark location card with real Directions / Call links —
 * never invented extra stores. Self-omits when there is no address.
 */
export function renderStoreLocations(section: SectionBlock, ctx: RenderContext): string {
  const address = typeof section.props.address === "string" ? section.props.address.trim() : "";
  const phone = typeof section.props.phone === "string" ? section.props.phone.trim() : "";
  if (!address) return "";

  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const callBtn = phone
    ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}" style="text-decoration:none;border:1px solid color-mix(in srgb, var(--color-accent-500) 55%, transparent);color:var(--color-accent-500);border-radius:var(--button-radius);padding:0.7rem 1.4rem;font-weight:600;font-size:0.78rem;letter-spacing:0.06em;text-transform:uppercase;">Call the shop</a>`
    : "";

  return `<section aria-labelledby="stores-title">
  <p style="margin:0 0 0.5rem;font-size:0.68rem;letter-spacing:0.26em;text-transform:uppercase;color:var(--color-accent-500);">Come in</p>
  <h2 id="stores-title" style="margin:0 0 1.4rem;font-size:var(--step-1);">Store locations</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:0;border:1px solid color-mix(in srgb, var(--color-primary-500) 24%, transparent);border-radius:var(--radius);overflow:hidden;box-shadow:0 24px 60px -32px rgba(139,92,246,0.55);">
    <div style="min-height:200px;background:
        radial-gradient(90% 90% at 30% 20%, color-mix(in srgb, var(--color-primary-600) 45%, transparent), transparent 60%),
        radial-gradient(80% 80% at 90% 90%, color-mix(in srgb, var(--color-accent-500) 30%, transparent), transparent 55%),
        var(--color-surface-100);"></div>
    <div style="background:var(--color-surface-100);padding:clamp(1.5rem,4vw,2.5rem);display:flex;flex-direction:column;gap:1rem;justify-content:center;">
      <p style="margin:0;font-family:var(--font-display);font-size:1.3rem;">${escapeHtml(ctx.definition.restaurantName)}</p>
      <p style="margin:0;color:var(--color-text-700);line-height:1.6;">${escapeHtml(address)}</p>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
        <a href="${escapeHtml(directions)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;background:var(--color-primary-600);color:#fff;border-radius:var(--button-radius);padding:0.7rem 1.4rem;font-weight:600;font-size:0.78rem;letter-spacing:0.06em;text-transform:uppercase;">Directions</a>
        ${callBtn}
      </div>
    </div>
  </div>
</section>`;
}
