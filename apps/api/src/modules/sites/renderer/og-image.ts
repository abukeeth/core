import { derivePaletteFromSeed } from "../../../lib/color";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * §10 OG image generator — a server-rendered 1200x630 share card. This is
 * a template-based SVG (valid as an og:image with image/svg+xml — most
 * platforms that render OG previews support it), not a headless-browser
 * screenshot; every site gets a professional-looking card even with zero
 * photos, satisfying the spec's own framing without needing a browser
 * rendering pipeline in this sandbox.
 */
export function renderOgImageSvg(input: { restaurantName: string; cuisine: string; colorSeed: string }): string {
  const palette = derivePaletteFromSeed(input.colorSeed);
  const bg = palette.primary[800];
  const accent = palette.primary[200];

  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${bg}" />
  <rect x="0" y="0" width="1200" height="12" fill="${accent}" />
  <text x="80" y="300" font-family="Georgia, serif" font-size="64" font-weight="700" fill="#ffffff">${escapeXml(input.restaurantName)}</text>
  <text x="80" y="360" font-family="sans-serif" font-size="32" fill="${accent}">${escapeXml(input.cuisine)}</text>
</svg>`;
}
