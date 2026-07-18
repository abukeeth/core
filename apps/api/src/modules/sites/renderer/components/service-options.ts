import { escapeHtml } from "../html-escape";
import type { RenderContext, ServiceAvailability } from "../render-context";
import type { SectionBlock } from "../../types";

interface ServiceCard {
  key: keyof ServiceAvailability;
  label: string;
  blurb: string;
  href: string;
  cta: string;
}

/**
 * Theme Engine V3 — "How to order" service band. Lists only the service
 * options the tenant has actually enabled (real DeliveryConfig flags for
 * pickup/delivery/dine-in, plus facts.hasReservations for reservations),
 * resolved into ctx.services at render-site.ts. Nothing is fabricated: a
 * disabled service is never shown, and the whole section self-omits when the
 * tenant has enabled none (or when service data isn't available, e.g. in a
 * bare unit-test context). Semantic list markup, keyboard-navigable links,
 * theme tokens only — mobile-first single column that becomes a row on wider
 * viewports via auto-fit.
 */
export function renderServiceOptions(section: SectionBlock, ctx: RenderContext): string {
  const services = ctx.services;
  if (!services) return "";

  const orderUrl = `${ctx.orderingBaseUrl}/order/${ctx.restaurantId}`;
  const title = typeof section.props.title === "string" ? section.props.title : "Ways to enjoy";

  const all: ServiceCard[] = [
    { key: "pickup", label: "Pickup", blurb: "Order ahead and collect at the door.", href: orderUrl, cta: "Order for pickup" },
    { key: "delivery", label: "Delivery", blurb: "Brought straight to you.", href: orderUrl, cta: "Order delivery" },
    { key: "dineIn", label: "Dine-in", blurb: "Join us at the table.", href: "/menu", cta: "View the menu" },
    { key: "reservations", label: "Reservations", blurb: "Reserve your table ahead.", href: "/contact", cta: "Reserve a table" },
  ];

  const enabled = all.filter((card) => services[card.key]);
  if (enabled.length === 0) return "";

  const cards = enabled
    .map(
      (card) => `<li class="service-option card" style="list-style:none;padding:1.25rem;background:var(--color-surface-100);display:flex;flex-direction:column;gap:0.35rem;">
      <h3 style="margin:0;font-size:var(--step-1);">${escapeHtml(card.label)}</h3>
      <p style="margin:0;color:var(--color-text-700);flex:1;">${escapeHtml(card.blurb)}</p>
      <a class="cta" href="${escapeHtml(card.href)}" style="align-self:flex-start;margin-top:0.5rem;">${escapeHtml(card.cta)}</a>
    </li>`,
    )
    .join("\n");

  return `<section class="service-options" aria-labelledby="service-options-title">
  <h2 id="service-options-title">${escapeHtml(title)}</h2>
  <ul style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:1rem;padding:0;margin:1rem 0 0;">
    ${cards}
  </ul>
</section>`;
}
