import { escapeHtml } from "./html-escape";
import type { RenderContext } from "./render-context";

/**
 * §Website Builder — a real uploaded photo is used whenever one exists; when it
 * doesn't, this renders a deterministic, non-photographic tile instead of either
 * a broken <img> box or leaving the storefront looking "mostly text and
 * buttons." Deterministic on the name so the same item/category always gets the
 * same look across renders, never a random placeholder.
 */
export function deterministicHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

/**
 * Sprint 5 · T2 — Premium image-less catalog tile.
 *
 * When there is no photo, render a self-contained inline SVG (no external asset,
 * no hotlink): soft layered tonal shapes with an elegant monogram set in the
 * theme's own display font. Because the SVG scales with its container it reads
 * as premium at every size the catalog uses it — a 40px category thumbnail, a
 * 4/3 warm card, or a full grid cell — rather than a flat gradient box with an
 * oversized letter. Deterministic on `name` (hue + monogram), so the same item
 * always looks identical; `role="img"` + `<title>` keep it accessible.
 *
 * `var(--font-display)` resolves because the SVG is inlined into the page (not a
 * data-URI), so it inherits the theme's CSS custom properties. No `<defs>`/id is
 * used, so many tiles can share a page without id collisions.
 */
export function renderImageOrFallback(name: string, imageUrl: string | undefined, aspectRatio = "1"): string {
  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" loading="lazy" style="width:100%;aspect-ratio:${aspectRatio};object-fit:cover;border-radius:var(--radius);display:block;" />`;
  }

  const hue = deterministicHue(name);
  const hue2 = (hue + 26) % 360;
  const initial = escapeHtml(name.trim().charAt(0).toUpperCase() || "?");

  return `<svg role="img" aria-label="${escapeHtml(name)}" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" style="width:100%;aspect-ratio:${aspectRatio};display:block;border-radius:var(--radius);">
  <title>${escapeHtml(name)}</title>
  <rect width="400" height="400" fill="hsl(${hue} 24% 90%)" />
  <circle cx="312" cy="94" r="242" fill="hsl(${hue2} 30% 84%)" opacity="0.65" />
  <circle cx="78" cy="342" r="172" fill="hsl(${hue} 24% 86%)" opacity="0.6" />
  <text x="200" y="188" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-display), Georgia, 'Times New Roman', serif" font-size="170" font-weight="500" letter-spacing="4" fill="hsl(${hue} 32% 32%)">${initial}</text>
  <line x1="150" y1="256" x2="250" y2="256" stroke="hsl(${hue} 30% 40%)" stroke-width="2" opacity="0.3" />
</svg>`;
}

/**
 * Product image resolution: the item's REAL uploaded photo always wins; the
 * generated business-truth product photo (aiAssets.productImages) fills in
 * when there is none; the typographic tile stays as the final floor.
 */
export function resolveProductImageUrl(ctx: RenderContext, itemName: string, realUrl: string | undefined): string | undefined {
  return realUrl ?? ctx.assets.aiProductImages?.[itemName];
}
