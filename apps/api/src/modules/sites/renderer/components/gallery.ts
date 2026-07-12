import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/** §8 Gallery — GalleryGrid/Lightbox. Lightbox uses the native <dialog> element (no JS framework needed). */
export function renderGallery(section: SectionBlock, ctx: RenderContext): string {
  const intro = typeof section.props.intro === "string" ? section.props.intro : "";

  if (ctx.assets.galleryImages.length === 0) return "";

  const items = ctx.assets.galleryImages
    .map(
      (img, i) => `<a href="#gallery-${i}" style="display:block;">
      <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt)}" loading="lazy" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--radius);" />
    </a>`,
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
