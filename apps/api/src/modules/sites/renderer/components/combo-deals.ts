import { escapeHtml } from "../html-escape";
import { formatPrice, type RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

interface PairItem {
  name: string;
  priceCents: number;
}

/**
 * Deli flagship — "Perfect Pairings". Built ONLY from real menu items (passed
 * in props by assemble). Each card pairs two real items and shows their two
 * real prices — it never invents a discounted "bundle price" (which would be a
 * fabricated fact). Self-omits when there aren't at least two items to pair.
 */
export function renderComboDeals(section: SectionBlock, ctx: RenderContext): string {
  const items = Array.isArray(section.props.items) ? (section.props.items as PairItem[]) : [];
  if (items.length < 2) return "";
  const orderUrl = `${ctx.orderingBaseUrl}/order/${ctx.restaurantId}`;

  // Pair consecutive items (a+b, c+d, …); a trailing odd item is dropped so no
  // card is ever half-empty.
  const pairs: [PairItem, PairItem][] = [];
  for (let i = 0; i + 1 < items.length && pairs.length < 3; i += 2) {
    pairs.push([items[i]!, items[i + 1]!]);
  }
  if (pairs.length === 0) return "";

  const cards = pairs
    .map(
      ([a, b]) => `<li style="list-style:none;background:var(--color-surface-100);border:1px solid var(--hairline);border-radius:calc(var(--radius) + 4px);padding:1.25rem 1.35rem;display:flex;flex-direction:column;gap:0.6rem;box-shadow:var(--shadow);">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.75rem;">
          <span style="font-family:var(--font-display);font-size:1.1rem;">${escapeHtml(a.name)}</span>
          <span style="color:var(--color-text-600);font-size:var(--step--1);">$${formatPrice(a.priceCents)}</span>
        </div>
        <div style="text-align:center;color:var(--color-accent-600);font-weight:700;">+</div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.75rem;">
          <span style="font-family:var(--font-display);font-size:1.1rem;">${escapeHtml(b.name)}</span>
          <span style="color:var(--color-text-600);font-size:var(--step--1);">$${formatPrice(b.priceCents)}</span>
        </div>
        <a href="${escapeHtml(orderUrl)}" style="margin-top:0.5rem;text-align:center;background:var(--color-primary-600);color:#fff;text-decoration:none;border-radius:999px;padding:0.55rem 1rem;font-weight:600;font-size:var(--step--1);">Order together</a>
      </li>`,
    )
    .join("\n");

  return `<section aria-labelledby="combos-title">
  <p style="margin:0 0 0.5rem;font-size:0.72rem;letter-spacing:0.24em;text-transform:uppercase;color:var(--color-accent-600);">Better together</p>
  <h2 id="combos-title" style="margin:0 0 1.5rem;font-size:var(--step-1);">Perfect pairings</h2>
  <ul style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:1.2rem;padding:0;margin:0;">
    ${cards}
  </ul>
</section>`;
}
