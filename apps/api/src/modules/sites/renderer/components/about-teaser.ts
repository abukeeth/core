import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

export function renderAboutTeaser(section: SectionBlock, _ctx: RenderContext): string {
  const excerpt = typeof section.props.excerpt === "string" ? section.props.excerpt : "";
  const linkTo = typeof section.props.linkTo === "string" ? section.props.linkTo : "/about";

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
