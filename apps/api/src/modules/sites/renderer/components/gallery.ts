import { escapeHtml } from "../html-escape";
import { featurePlaceholder } from "../placeholder-imagery";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/** §8 Gallery — GalleryGrid/Lightbox. Lightbox uses the native <dialog> element (no JS framework needed). */
export function renderGallery(section: SectionBlock, ctx: RenderContext): string {
  const intro = typeof section.props.intro === "string" ? section.props.intro : "";
  const uploaded = ctx.assets.galleryImages;

  // Theme Engine V3 — restaurant-maison shows an immersive, full-bleed editorial
  // mosaic: the owner's real photos when present, else moody art-directed
  // imagery (never a blank section). An asymmetric grid — one large frame beside
  // smaller ones — reads as a magazine spread rather than a thumbnail wall.
  if (ctx.definition.themeKey === "restaurant-maison") {
    const sources =
      uploaded.length > 0
        ? uploaded.map((img) => ({ url: img.url, alt: img.alt }))
        : ["ambience", "the pass", "the room", "detail", "the bar"].map((s) => ({ url: featurePlaceholder(`${ctx.definition.restaurantName}-${s}`), alt: "" }));
    const tiles = sources
      .slice(0, 5)
      .map(
        (img, i) => `<a href="#gallery-${i}" class="mg-tile${i === 0 ? " mg-lead" : ""}" style="display:block;overflow:hidden;position:relative;">
        <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" />
      </a>`,
      )
      .join("\n");
    return `<section class="gallery" aria-labelledby="gallery-title">
  <style>
    .mg-grid{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:minmax(140px,26vw);gap:6px;}
    .mg-tile img{transition:transform var(--motion-duration) ease;}
    @media (min-width:820px){
      .mg-grid{grid-template-columns:repeat(4,1fr);grid-auto-rows:minmax(180px,17vw);}
      .mg-lead{grid-column:span 2;grid-row:span 2;}
    }
  </style>
  <div style="text-align:center;padding:0 1.5rem clamp(2rem,5vw,3rem);">
    <p style="font-size:0.72rem;letter-spacing:0.28em;text-transform:uppercase;color:var(--color-accent-600);margin:0 0 0.6rem;">The Experience</p>
    <h2 id="gallery-title" style="margin:0;font-size:var(--step-1);">${escapeHtml(intro || "An evening at the table")}</h2>
  </div>
  <div class="mg-grid">${tiles}</div>
</section>`;
  }

  // Sprint 5.5 — when the owner has no photos, show the AI marketing/gallery
  // banner (atmospheric, on-brand) instead of omitting the section entirely.
  if (uploaded.length === 0) {
    if (!ctx.assets.aiMarketingUrl) return "";
    return `<section class="gallery">
  ${intro ? `<h2 style="text-align:center;margin:0 0 1.5rem;">${escapeHtml(intro)}</h2>` : ""}
  <img src="${escapeHtml(ctx.assets.aiMarketingUrl)}" alt="" loading="lazy" style="width:100%;max-height:440px;object-fit:cover;border-radius:var(--radius);display:block;" />
</section>`;
  }

  const items = uploaded
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
