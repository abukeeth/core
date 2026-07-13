import { escapeHtml } from "./html-escape";

/**
 * §Website Builder — a real uploaded photo is used whenever one exists;
 * when it doesn't, this renders a deterministic, non-photographic tile
 * (a themed gradient + the name's initial) instead of either a broken
 * <img> box or leaving the storefront looking "mostly text and buttons."
 * Deterministic on the name so the same item/category always gets the
 * same look across renders, never a random placeholder.
 */
export function deterministicHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

export function renderImageOrFallback(name: string, imageUrl: string | undefined, aspectRatio = "1"): string {
  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" loading="lazy" style="width:100%;aspect-ratio:${aspectRatio};object-fit:cover;border-radius:var(--radius);display:block;" />`;
  }

  const hue = deterministicHue(name);
  const initial = escapeHtml(name.trim().charAt(0).toUpperCase() || "?");
  return `<div role="img" aria-label="${escapeHtml(name)}" style="width:100%;aspect-ratio:${aspectRatio};border-radius:var(--radius);display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg, hsl(${hue} 45% 90%), hsl(${(hue + 40) % 360} 45% 80%));">
    <span style="font-family:var(--font-display);font-size:1.75rem;font-weight:700;color:hsl(${hue} 35% 28%);">${initial}</span>
  </div>`;
}
