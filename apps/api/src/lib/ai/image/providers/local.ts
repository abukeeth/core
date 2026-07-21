import type { GeneratedImage, ImageGenerationRequest, ImageProvider } from "../types";

/**
 * Local procedural image backend — a real, self-contained image provider that
 * needs no network, key, or cost. It renders an on-brand atmospheric image
 * (palette-driven gradient + soft glows + vignette) deterministically from the
 * request's prompt (which carries the brand palette) and seed.
 *
 * It exists so the AI Branding Layer works end-to-end for dev / offline / demo,
 * and — like every backend — lives entirely behind the `ImageProvider` contract,
 * so a hosted provider (Stability, OpenAI, …) swaps in via config with no change
 * to branding or generation code.
 */

const DIMS: Record<string, { w: number; h: number }> = {
  landscape: { w: 1600, h: 900 },
  portrait: { w: 900, h: 1600 },
  square: { w: 1200, h: 1200 },
};

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** Palette hexes are embedded in the prompt as "background #.., primary #.., accent #..". */
function extractPalette(prompt: string): { bg: string; primary: string; accent: string } {
  const hexes = prompt.match(/#[0-9a-fA-F]{6}/g) ?? [];
  return { bg: hexes[0] ?? "#12131A", primary: hexes[1] ?? "#3A3F55", accent: hexes[2] ?? "#8A8FB0" };
}

function atmosphericSvg(bg: string, primary: string, accent: string, seed: number, w: number, h: number): string {
  const r = (n: number, mod: number) => (n >> (n % 5)) % mod;
  const ax = 15 + r(seed, 60);
  const ay = 10 + r(seed >> 3, 50);
  const px = 55 + r(seed >> 7, 40);
  const py = 45 + r(seed >> 11, 45);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${primary}"/>
    </linearGradient>
    <radialGradient id="accentGlow" cx="${ax}%" cy="${ay}%" r="60%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="primaryGlow" cx="${px}%" cy="${py}%" r="55%">
      <stop offset="0" stop-color="${primary}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.45"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
  <rect width="${w}" height="${h}" fill="url(#primaryGlow)"/>
  <rect width="${w}" height="${h}" fill="url(#accentGlow)"/>
  <rect width="${w}" height="${h}" fill="url(#vignette)"/>
</svg>`;
}

export class LocalImageProvider implements ImageProvider {
  readonly name = "local";

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const { bg, primary, accent } = extractPalette(request.prompt);
    const { w, h } = DIMS[request.aspect ?? "landscape"] ?? DIMS.landscape;
    const seed = request.seed ?? hash(request.prompt);
    const svg = atmosphericSvg(bg, primary, accent, seed, w, h);
    return { data: Buffer.from(svg, "utf8"), mediaType: "image/svg+xml" };
  }
}
