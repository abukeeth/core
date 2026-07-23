import { escapeHtml } from "../html-escape";
import { resolveProductImageUrl } from "../image-fallback";
import { formatPrice, type RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

interface SignatureItem {
  name: string;
  description?: string;
  priceCents: number;
}

export function renderSignatureDishes(section: SectionBlock, ctx: RenderContext): string {
  const intro = typeof section.props.intro === "string" ? section.props.intro : "";
  // Vertical-aware heading set at assemble time ("Signature Dishes" for food,
  // "Featured Products" for retail/vape, "Featured Items" otherwise). Falls back
  // to the historical default so older definitions render unchanged.
  const heading = typeof section.props.title === "string" && section.props.title ? section.props.title : "Signature Dishes";
  const items = Array.isArray(section.props.items) ? (section.props.items as SignatureItem[]) : [];

  if (items.length === 0) return "";

  const cards = items
    .map((item) => {
      // The item's photo when one exists (real upload or the generated
      // business-truth product photo, resolved by name via the live menu);
      // text-only cards otherwise, exactly as before.
      const liveItem = ctx.liveMenu.flatMap((c) => c.items).find((i) => i.name === item.name);
      const imageUrl = resolveProductImageUrl(ctx, item.name, liveItem?.imageUrl);
      const imageHtml = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius);display:block;margin-bottom:0.75rem;" />`
        : "";
      return `<li class="dish-card" style="list-style:none;border-radius:var(--radius);padding:1rem;background:var(--color-surface-100);">
      ${imageHtml}
      <h3 style="margin:0 0 0.25rem;">${escapeHtml(item.name)}</h3>
      ${item.description ? `<p style="margin:0 0 0.25rem;color:var(--color-text-700);">${escapeHtml(item.description)}</p>` : ""}
      <p style="margin:0;font-weight:600;">$${formatPrice(item.priceCents)}</p>
    </li>`;
    })
    .join("\n");

  return `<section class="signature-dishes">
  <h2>${escapeHtml(heading)}</h2>
  ${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
  <ul style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;padding:0;">
    ${cards}
  </ul>
</section>`;
}
