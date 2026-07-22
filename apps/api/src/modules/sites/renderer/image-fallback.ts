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
 * Premium image-less catalog tile.
 *
 * When there is no photo, render a self-contained inline SVG (no external asset,
 * no hotlink): a quiet still-life abstraction — layered tonal grounds and a
 * plate-like ring — with NO lettering of any kind. Letter/monogram tiles are
 * explicitly banned product-wide: they read as unfinished placeholders. Because
 * the SVG scales with its container it reads as considered at every size the
 * catalog uses it — a 40px category thumbnail, a 4/3 warm card, or a full grid
 * cell. Deterministic on `name` (hue + composition), so the same item always
 * looks identical; `role="img"` + `<title>` keep it accessible.
 *
 * `var(--font-display)` is not needed here; no `<defs>`/id is used, so many
 * tiles can share a page without id collisions.
 */
export function renderImageOrFallback(name: string, imageUrl: string | undefined, aspectRatio = "1"): string {
  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" loading="lazy" style="width:100%;aspect-ratio:${aspectRatio};object-fit:cover;border-radius:var(--radius);display:block;" />`;
  }

  const hue = deterministicHue(name);
  const hue2 = (hue + 26) % 360;
  // Deterministic composition shift so different names get visibly different
  // tiles (ring position + accent placement), never one fixed placeholder.
  const shift = deterministicHue(`${name}·placement`) % 60; // 0–59px
  const cx = 160 + shift; // ring center drifts horizontally
  const cy = 150 + (shift % 36);

  return `<svg role="img" aria-label="${escapeHtml(name)}" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" style="width:100%;aspect-ratio:${aspectRatio};display:block;border-radius:var(--radius);">
  <title>${escapeHtml(name)}</title>
  <rect width="400" height="400" fill="hsl(${hue} 26% 92%)" />
  <circle cx="318" cy="76" r="230" fill="hsl(${hue2} 32% 86%)" opacity="0.7" />
  <circle cx="64" cy="356" r="180" fill="hsl(${hue} 28% 88%)" opacity="0.65" />
  <circle cx="${cx}" cy="${cy}" r="92" fill="hsl(${hue} 30% 96%)" />
  <circle cx="${cx}" cy="${cy}" r="92" fill="none" stroke="hsl(${hue} 26% 78%)" stroke-width="1.5" />
  <circle cx="${cx}" cy="${cy}" r="64" fill="none" stroke="hsl(${hue} 24% 82%)" stroke-width="1" />
  <circle cx="${cx + 118}" cy="${cy + 96}" r="10" fill="hsl(${hue2} 38% 62%)" opacity="0.55" />
  <path d="M40 ${330 - (shift % 20)} Q 200 ${296 - (shift % 20)} 360 ${330 - (shift % 20)}" fill="none" stroke="hsl(${hue} 24% 78%)" stroke-width="1.5" opacity="0.5" />
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
