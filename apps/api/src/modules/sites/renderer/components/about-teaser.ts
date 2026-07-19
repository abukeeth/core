import { escapeHtml } from "../html-escape";
import { heroPlaceholder } from "../placeholder-imagery";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

export function renderAboutTeaser(section: SectionBlock, ctx: RenderContext): string {
  const excerpt = typeof section.props.excerpt === "string" ? section.props.excerpt : "";
  const linkTo = typeof section.props.linkTo === "string" ? section.props.linkTo : "/about";

  // Theme Engine V3 — restaurant-maison gets an editorial, emotionally-weighted
  // treatment: a spaced eyebrow, the story set as a large centered serif
  // passage, a brass hairline, and a refined call to read on. Other themes keep
  // the original compact teaser unchanged.
  if (ctx.definition.themeKey === "restaurant-maison") {
    const bg = ctx.assets.heroBackgroundUrl ?? heroPlaceholder(`${ctx.definition.restaurantName}-story`);
    // Full-bleed immersive band — breaks out of the content column to the
    // viewport edges, dark and cinematic, story set large in white serif.
    return `<section class="about-teaser" aria-labelledby="story-title" style="position:relative;padding:clamp(4.5rem,12vw,8rem) 1.5rem;display:flex;align-items:center;justify-content:center;text-align:center;isolation:isolate;overflow:hidden;border-radius:2px;">
  <img src="${escapeHtml(bg)}" alt="" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;" />
  <span aria-hidden="true" style="position:absolute;inset:0;z-index:-1;background:rgba(8,6,4,0.62);"></span>
  <div style="max-width:46rem;color:#fff;">
    <p style="font-size:0.72rem;letter-spacing:0.34em;text-transform:uppercase;color:var(--color-accent-400);margin:0 0 1.5rem;">Our Story</p>
    <h2 id="story-title" style="margin:0;font-family:var(--font-display);font-weight:600;font-size:clamp(1.7rem, 3.4vw, 2.7rem);line-height:1.4;color:#fff;">${escapeHtml(excerpt)}</h2>
    <span aria-hidden="true" style="display:block;width:56px;height:1px;background:var(--color-accent-400);margin:2.25rem auto;"></span>
    <a href="${escapeHtml(linkTo)}" style="font-size:0.72rem;letter-spacing:0.2em;text-transform:uppercase;color:#fff;text-decoration:none;border-bottom:1px solid var(--color-accent-400);padding-bottom:4px;">Read our story</a>
  </div>
</section>`;
  }

  return `<section class="about-teaser">
  <h2>Our Story</h2>
  <p>${escapeHtml(excerpt)}</p>
  <a href="${escapeHtml(linkTo)}">Read more</a>
</section>`;
}

export function renderAboutStory(section: SectionBlock, ctx: RenderContext): string {
  const story = typeof section.props.story === "string" ? section.props.story : "";

  const photoBand =
    ctx.assets.galleryImages.length > 0
      ? `<div style="display:flex;gap:0.5rem;overflow-x:auto;margin-top:1.5rem;">
    ${ctx.assets.galleryImages
      .slice(0, 4)
      .map((img) => `<img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt)}" style="height:160px;border-radius:var(--radius);" />`)
      .join("\n")}
  </div>`
      : "";

  return `<section class="about-story">
  <h1>About ${escapeHtml(ctx.definition.restaurantName)}</h1>
  <p>${escapeHtml(story)}</p>
  ${photoBand}
</section>`;
}
