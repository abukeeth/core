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

  const eyebrow = typeof section.props.eyebrow === "string" ? section.props.eyebrow : "How to visit";
  const cards = enabled
    .map(
      (card) => `<li class="service-option" style="list-style:none;padding:1.75rem 1.5rem;border:1px solid var(--color-surface-200);border-top:2px solid var(--color-accent-500);display:flex;flex-direction:column;gap:0.5rem;text-align:center;align-items:center;">
      <h3 style="margin:0;font-size:1.3rem;">${escapeHtml(card.label)}</h3>
      <p style="margin:0;color:var(--color-text-600);flex:1;font-size:var(--step--1);line-height:1.6;">${escapeHtml(card.blurb)}</p>
      <a href="${escapeHtml(card.href)}" style="margin-top:0.6rem;font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--color-primary-700);text-decoration:none;border-bottom:1px solid var(--color-accent-500);padding-bottom:3px;">${escapeHtml(card.cta)}</a>
    </li>`,
    )
    .join("\n");

  return `<section class="service-options" aria-labelledby="service-options-title" style="text-align:center;">
  <p style="font-size:0.72rem;letter-spacing:0.28em;text-transform:uppercase;color:var(--color-accent-600);margin:0 0 0.6rem;">${escapeHtml(eyebrow)}</p>
  <h2 id="service-options-title" style="margin:0 0 2.25rem;font-size:var(--step-1);">${escapeHtml(title)}</h2>
  <ul style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:1.1rem;padding:0;margin:0;">
    ${cards}
  </ul>
</section>`;
}
