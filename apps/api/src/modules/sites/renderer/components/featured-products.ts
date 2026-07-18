import { escapeHtml } from "../html-escape";
import { renderPhoto } from "../image-fallback";
import { pickStockPhoto } from "../imagery";
import { formatPrice, type RenderContext } from "../render-context";
import type { SectionBlock, StyleFamilyValue } from "../../types";

interface FlatMenuItem {
  name: string;
  description?: string;
  priceCents: number;
  imageUrl?: string;
}

/** Per-design-system card treatment so Modern / Luxury / Local read as different agencies, not one grid recolored. */
function familyTreatment(family: StyleFamilyValue | undefined) {
  switch (family) {
    case "LUXURY": // bold-commerce — dense, hard-edged, commerce-forward
      return { minCol: "260px", aspect: "1", card: "background:var(--color-surface-100);border:2px solid var(--color-surface-900);", pad: "0" };
    case "MINIMAL": // warm-local — cozy, rounded, image-topped
      return { minCol: "220px", aspect: "4/3", card: "background:var(--color-surface-100);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);", pad: "0" };
    default: // MODERN / modern-editorial — airy, editorial
      return { minCol: "240px", aspect: "3/2", card: "background:transparent;", pad: "0" };
  }
}

/** Sprint 20A Task 5 / Theme Engine V2 — a live-menu-sourced product grid; every card now shows a real photo (uploaded, else curated stock, else generated), never a text-only tile. */
export function renderFeaturedProducts(section: SectionBlock, ctx: RenderContext): string {
  const props = section.props;
  const title = typeof props.title === "string" ? props.title : "Featured";
  const subtitle = typeof props.subtitle === "string" ? props.subtitle : "";
  const productSource = typeof props.productSource === "string" ? props.productSource : "all";
  const limit = typeof props.limit === "number" ? props.limit : 6;
  const showPrice = typeof props.showPrice === "boolean" ? props.showPrice : true;
  const showDescriptions = typeof props.showDescriptions === "boolean" ? props.showDescriptions : true;
  const showOrderButtons = typeof props.showOrderButtons === "boolean" ? props.showOrderButtons : true;

  const categories = productSource === "all" ? ctx.liveMenu : ctx.liveMenu.filter((c) => c.name === productSource);
  const items: FlatMenuItem[] = categories
    .flatMap((c) => c.items)
    .filter((item) => item.isAvailable)
    .slice(0, limit);

  if (items.length === 0) return "";

  const { cuisine, businessType, styleFamily } = ctx.definition;
  const t = familyTreatment(styleFamily);

  const cards = items
    .map((item) => {
      const photo = renderPhoto({
        name: item.name,
        imageUrl: item.imageUrl,
        stockUrl: pickStockPhoto({ slot: "food", cuisine, businessType, key: item.name }),
        aspectRatio: t.aspect,
        rounded: styleFamily !== "LUXURY",
      });
      return `<li class="card" style="list-style:none;${t.card}">
      ${photo}
      <div style="padding:0.85rem 1rem 1rem;">
        <h3 style="margin:0 0 0.25rem;">${escapeHtml(item.name)}</h3>
        ${showDescriptions && item.description ? `<p style="margin:0 0 0.35rem;color:var(--color-text-700);">${escapeHtml(item.description)}</p>` : ""}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;">
          ${showPrice ? `<p style="margin:0;font-weight:700;">$${formatPrice(item.priceCents)}</p>` : "<span></span>"}
          ${showOrderButtons ? `<a class="cta" href="${escapeHtml(ctx.orderingBaseUrl)}/order/${escapeHtml(ctx.restaurantId)}">Order</a>` : ""}
        </div>
      </div>
    </li>`;
    })
    .join("\n");

  return `<section class="featured-products">
  <h2>${escapeHtml(title)}</h2>
  ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
  <ul style="display:grid;grid-template-columns:repeat(auto-fit, minmax(${t.minCol}, 1fr));gap:1rem;padding:0;margin:1.25rem 0 0;">
    ${cards}
  </ul>
</section>`;
}
