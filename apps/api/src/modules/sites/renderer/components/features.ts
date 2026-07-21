import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/**
 * Sprint 5 · T5 — Marketing "Why Choose Us" band.
 *
 * A premium features row (icon + title + blurb) plus a compact trust-badge strip
 * — the marketing surface the reference storefronts lead with. Content is
 * generic, non-fabricated benefit copy tied to real platform capabilities
 * (online ordering, fast pickup, secure checkout, locally owned): true for any
 * business, never an invented business-specific claim (§2 Guardrails). Icons are
 * self-contained inline SVG (currentColor, no hotlinks); everything is themed via
 * CSS custom properties and mobile-first (auto-fit grid).
 */

/** Self-contained line icons (24×24, stroke = currentColor, no external asset). */
const ICONS: Record<string, string> = {
  order:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  pickup:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  secure:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5Z"/><path d="m9 12 2 2 4-4"/></svg>',
  local:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg>',
};

interface Feature {
  icon: keyof typeof ICONS;
  title: string;
  blurb: string;
}

const FEATURES: Feature[] = [
  { icon: "order", title: "Order Online", blurb: "Browse the full menu and check out in seconds." },
  { icon: "pickup", title: "Fast Pickup", blurb: "Your order, made fresh and ready when you are." },
  { icon: "secure", title: "Secure Checkout", blurb: "Safe, encrypted payments on every order." },
  { icon: "local", title: "Locally Owned", blurb: "An independent business that values your visit." },
];

const TRUST_BADGES = ["Secure Payments", "Fast Pickup", "Easy Reordering"];

export function renderFeatures(_section: SectionBlock, ctx: RenderContext): string {
  const name = escapeHtml(ctx.definition.restaurantName);

  const cards = FEATURES.map(
    (f) => `<div class="feature-card" style="text-align:center;padding:0.5rem;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:999px;background:var(--color-surface-100);color:var(--color-accent-600);margin-bottom:0.85rem;">${ICONS[f.icon]}</span>
      <h3 style="margin:0 0 0.35rem;font-size:var(--step-0);font-family:var(--font-display);">${escapeHtml(f.title)}</h3>
      <p style="margin:0;color:var(--color-text-700);font-size:var(--step--1);line-height:1.5;">${escapeHtml(f.blurb)}</p>
    </div>`,
  ).join("\n");

  const badges = TRUST_BADGES.map(
    (b) => `<span style="display:inline-flex;align-items:center;gap:0.4rem;font-size:var(--step--1);color:var(--color-text-700);"><span aria-hidden="true" style="color:var(--color-accent-600);">✓</span>${escapeHtml(b)}</span>`,
  ).join('<span aria-hidden="true" style="opacity:0.4;">·</span>');

  return `<section class="features" aria-labelledby="feat-title">
  <p style="text-align:center;font-size:0.72rem;letter-spacing:0.28em;text-transform:uppercase;color:var(--color-accent-600);margin:0 0 0.6rem;">Why Choose Us</p>
  <h2 id="feat-title" style="text-align:center;margin:0 0 2.25rem;font-size:var(--step-1);">Why choose ${name}</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1.5rem;">
    ${cards}
  </div>
  <div style="display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:0.75rem;margin-top:2rem;">
    ${badges}
  </div>
</section>`;
}
