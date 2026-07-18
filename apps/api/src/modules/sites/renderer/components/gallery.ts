import { escapeHtml } from "../html-escape";
import { renderPhoto } from "../image-fallback";
import { galleryStockPhotos } from "../imagery";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

const STOCK_GALLERY_COUNT = 6;

/**
 * §8 Gallery / Theme Engine V2 — shows the owner's real uploaded photos when
 * present; otherwise falls back to a curated set of cuisine-matched stock
 * photos (each layered over a generated fallback) so the Gallery section
 * always renders real imagery instead of vanishing for a new business.
 */
export function renderGallery(section: SectionBlock, ctx: RenderContext): string {
  const intro = typeof section.props.intro === "string" ? section.props.intro : "";
  const uploaded = ctx.assets.galleryImages;

  const items =
    uploaded.length > 0
      ? uploaded
          .map(
            (img, i) => `<a href="#gallery-${i}" style="display:block;">
      <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt)}" loading="lazy" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--radius);" />
    </a>`,
          )
          .join("\n")
      : galleryStockPhotos({ cuisine: ctx.definition.cuisine, businessType: ctx.definition.businessType, count: STOCK_GALLERY_COUNT })
          .map((url, i) =>
            renderPhoto({ name: `${ctx.definition.restaurantName} photo ${i + 1}`, stockUrl: url, aspectRatio: "1" }),
          )
          .join("\n");

  return `<section class="gallery">
  <h2>Gallery</h2>
  ${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
  <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:0.5rem;">
    ${items}
  </div>
</section>`;
}
