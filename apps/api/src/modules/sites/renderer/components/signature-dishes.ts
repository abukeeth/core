import { escapeHtml } from "../html-escape";
import { formatPrice, type RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

interface SignatureItem {
  name: string;
  description?: string;
  priceCents: number;
}

export function renderSignatureDishes(section: SectionBlock, _ctx: RenderContext): string {
  const intro = typeof section.props.intro === "string" ? section.props.intro : "";
  const items = Array.isArray(section.props.items) ? (section.props.items as SignatureItem[]) : [];

  if (items.length === 0) return "";

  const cards = items
    .map(
      (item) => `<li class="dish-card" style="list-style:none;border-radius:var(--radius);padding:1rem;background:var(--color-surface-100);">
      <h3 style="margin:0 0 0.25rem;">${escapeHtml(item.name)}</h3>
      ${item.description ? `<p style="margin:0 0 0.25rem;color:var(--color-text-700);">${escapeHtml(item.description)}</p>` : ""}
      <p style="margin:0;font-weight:600;">$${formatPrice(item.priceCents)}</p>
    </li>`,
    )
    .join("\n");

  return `<section class="signature-dishes">
  <h2>Signature Dishes</h2>
  ${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
  <ul style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;padding:0;">
    ${cards}
  </ul>
</section>`;
}
