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

/** A richer, two-tone generated gradient (deterministic on name) used as the base layer beneath every photo. */
export function generatedGradient(name: string): string {
  const hue = deterministicHue(name);
  const h2 = (hue + 35) % 360;
  return `linear-gradient(135deg, hsl(${hue} 42% 32%), hsl(${h2} 48% 20%))`;
}

export interface PhotoInput {
  /** Accessible label / alt for the image. */
  name: string;
  /** A real uploaded asset URL, if the business has one — always preferred. */
  imageUrl?: string;
  /** A curated stock photo URL (imagery.ts) used when there's no upload. */
  stockUrl?: string;
  /** CSS aspect-ratio, e.g. "4/3", "1", "16/9". */
  aspectRatio?: string;
  /** Rounds the corners with the theme radius (default true). */
  rounded?: boolean;
  /** Extra inline style appended verbatim (e.g. a fixed height for heroes). */
  extraStyle?: string;
}

/**
 * Theme Engine V2 — the single image primitive. Renders a real photo layered
 * over a deterministic generated gradient: the uploaded asset wins, else the
 * curated stock photo, and the generated gradient always sits underneath. If
 * the photo fails to load (or none was supplied) the gradient shows through,
 * so this element is never a broken or empty box — the "hybrid, never empty"
 * contract, achieved with pure CSS (no JS, CSP-safe).
 */
export function renderPhoto(input: PhotoInput): string {
  const { name, imageUrl, stockUrl, aspectRatio = "1", rounded = true, extraStyle = "" } = input;
  const top = imageUrl ?? stockUrl;
  const gradient = generatedGradient(name);
  const layers = top ? `url("${escapeHtml(top)}"), ${gradient}` : gradient;
  const radius = rounded ? "border-radius:var(--radius);" : "";
  return `<div role="img" aria-label="${escapeHtml(name)}" style="width:100%;aspect-ratio:${aspectRatio};${radius}background-image:${layers};background-size:cover;background-position:center;background-repeat:no-repeat;${extraStyle}"></div>`;
}
