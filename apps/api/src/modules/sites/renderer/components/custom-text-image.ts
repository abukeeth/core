import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/** Sprint 20A Task 5 — freeform owner content: a headline/body paired with one of the site's already-uploaded gallery photos (picked by index, reusing the existing gallery upload flow rather than adding a separate per-section upload slot). */
export function renderCustomTextImage(section: SectionBlock, ctx: RenderContext): string {
  const heading = typeof section.props.heading === "string" ? section.props.heading : "";
  const body = typeof section.props.body === "string" ? section.props.body : "";
  const imageIndex = typeof section.props.galleryImageIndex === "number" ? section.props.galleryImageIndex : -1;
  const imagePosition = typeof section.props.imagePosition === "string" ? section.props.imagePosition : "right";
  const image = imageIndex >= 0 ? ctx.assets.galleryImages[imageIndex] : undefined;

  if (!heading && !body && !image) return "";

  const imageHtml = image
    ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" style="flex:1;min-width:240px;border-radius:var(--radius);box-shadow:var(--shadow);object-fit:cover;" />`
    : "";
  const textHtml = `<div style="flex:1;min-width:240px;">
    ${heading ? `<h2>${escapeHtml(heading)}</h2>` : ""}
    ${body ? `<p>${escapeHtml(body)}</p>` : ""}
  </div>`;

  return `<section class="custom-text-image" style="display:flex;gap:2rem;flex-wrap:wrap;align-items:center;">
  ${imagePosition === "left" ? `${imageHtml}${textHtml}` : `${textHtml}${imageHtml}`}
</section>`;
}
