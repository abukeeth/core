/**
 * Elegant, self-contained placeholder imagery — Theme Engine V3.
 *
 * Imagery priority for every slot is: (1) the tenant's own uploaded photo,
 * (2) a locally-bundled OrderVora asset, (3) one of these generated
 * placeholders. These are art-directed SVGs (embedded as data URIs — no
 * network request, no external hotlink) designed to read as warm, cinematic
 * restaurant/food imagery rather than a flat gradient, so a brand-new
 * restaurant with zero photos still looks like a premium hospitality site.
 *
 * Everything is deterministic on a seed string (usually the dish/section
 * name), so the same slot always renders the same image and a grid shows
 * pleasing variety.
 */

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function uri(svg: string): string {
  // Minify whitespace between tags to keep the data URI compact.
  return `data:image/svg+xml;base64,${Buffer.from(svg.replace(/\n\s*/g, "")).toString("base64")}`;
}

/** Shared film-grain + soft-focus filters for a photographic, non-flat finish. */
function defs(id: string, extra = ""): string {
  return `<defs>
    <filter id="grain-${id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer><feComposite operator="over" in2="SourceGraphic"/></filter>
    <filter id="soft-${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
    <radialGradient id="vig-${id}" cx="50%" cy="46%" r="72%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.55"/></radialGradient>
    ${extra}
  </defs>`;
}

/**
 * Cinematic hero — a warm, low-key restaurant ambiance at night: pools of
 * candle/pendant light (soft bokeh) over near-black, a warm floor glow, film
 * grain and a bottom scrim so overlaid headline type stays legible.
 */
export function heroPlaceholder(seed = "hero"): string {
  const h = hash(seed);
  const gx = 40 + (h % 30); // warm light drifts a little per tenant
  const bokeh = Array.from({ length: 7 }, (_, i) => {
    const r = ((h >>> (i * 2)) % 90) + 30;
    const cx = ((h >>> (i + 1)) % 1500) + 60;
    const cy = ((h >>> (i + 2)) % 380) + 40;
    const op = 0.1 + ((h >>> i) % 22) / 100;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f0c68a" opacity="${op.toFixed(2)}" filter="url(#soft-hero)"/>`;
  }).join("");
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
    ${defs("hero", `<radialGradient id="bg-hero" cx="${gx}%" cy="34%" r="95%"><stop offset="0%" stop-color="#4a2c1a"/><stop offset="38%" stop-color="#231610"/><stop offset="100%" stop-color="#0a0705"/></radialGradient>
      <linearGradient id="scrim-hero" x1="0" y1="0" x2="0" y2="1"><stop offset="45%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.65"/></linearGradient>`)}
    <rect width="1600" height="900" fill="url(#bg-hero)"/>
    <ellipse cx="800" cy="820" rx="900" ry="200" fill="#5a3a20" opacity="0.5" filter="url(#soft-hero)"/>
    ${bokeh}
    <rect width="1600" height="900" fill="url(#vig-hero)"/>
    <rect width="1600" height="900" fill="url(#scrim-hero)"/>
    <rect width="1600" height="900" filter="url(#grain-hero)" opacity="0.6"/>
  </svg>`);
}

/**
 * Overhead plated dish — a fine-dining plate on a dark table: soft ceramic
 * circle, a few warm food forms, a sauce accent and herb flecks, lit from
 * upper-left. Palette shifts per dish name so a menu grid never repeats.
 */
export function dishPlaceholder(name: string): string {
  const h = hash(name);
  // Warm, appetising palette only — roasted browns → ambers → wine, never green.
  const hue = 8 + (h % 30); // 8..38: red-brown → amber
  const food1 = `hsl(${hue} 52% ${26 + (h % 8)}%)`;
  const food2 = `hsl(${hue + 10} 46% ${34 + (h % 8)}%)`;
  const purée = `hsl(${hue + 4} 40% ${64 + (h % 8)}%)`; // a pale cream/purée accent
  const sauce = h % 2 === 0 ? "#6f2a2f" : "#a97f45";
  // A few herb flecks for a considered plating (small, sparse).
  const flecks = Array.from({ length: 4 }, (_, i) => {
    const a = ((h >>> (i * 3)) % 360) * (Math.PI / 180);
    const rr = 74 + ((h >>> (i + 3)) % 70);
    const x = 300 + Math.cos(a) * rr;
    const y = 300 + Math.sin(a) * rr;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${3 + (i % 2)}" fill="#5c6b3a" opacity="0.8"/>`;
  }).join("");
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice">
    ${defs("dish", `<radialGradient id="tbl-dish" cx="40%" cy="36%" r="82%"><stop offset="0%" stop-color="#31261f"/><stop offset="100%" stop-color="#140d09"/></radialGradient>
      <radialGradient id="plate-dish" cx="40%" cy="34%" r="64%"><stop offset="0%" stop-color="#f6f1e8"/><stop offset="76%" stop-color="#e6ddcf"/><stop offset="100%" stop-color="#cabfad"/></radialGradient>`)}
    <rect width="600" height="600" fill="url(#tbl-dish)"/>
    <ellipse cx="314" cy="324" rx="214" ry="214" fill="#000" opacity="0.4" filter="url(#soft-dish)"/>
    <circle cx="300" cy="300" r="206" fill="url(#plate-dish)"/>
    <circle cx="300" cy="300" r="150" fill="none" stroke="#00000010" stroke-width="1.5"/>
    <path d="M188 372 Q300 300 412 356" stroke="${sauce}" stroke-width="26" fill="none" opacity="0.42" stroke-linecap="round" filter="url(#soft-dish)"/>
    <ellipse cx="288" cy="298" rx="96" ry="72" fill="${food1}"/>
    <ellipse cx="330" cy="272" rx="58" ry="44" fill="${food2}"/>
    <ellipse cx="252" cy="268" rx="30" ry="22" fill="${purée}" opacity="0.9"/>
    <ellipse cx="300" cy="290" rx="120" ry="90" fill="#000" opacity="0" filter="url(#soft-dish)"/>
    ${flecks}
    <ellipse cx="244" cy="244" rx="60" ry="34" fill="#fff" opacity="0.16" filter="url(#soft-dish)"/>
    <rect width="600" height="600" fill="url(#vig-dish)"/>
    <rect width="600" height="600" filter="url(#grain-dish)" opacity="0.5"/>
  </svg>`);
}

/**
 * Feature imagery — a moody, low-light close-up of a plated dish, lit from one
 * side against near-black (the way fine-dining food is actually photographed).
 * Dark and filmic so it reads as atmospheric photography rather than a bright
 * flat placeholder; warm palette shifts per dish. Used for large editorial
 * feature blocks and the gallery.
 */
export function featurePlaceholder(name: string): string {
  const h = hash(name);
  const hue = 8 + (h % 26); // warm reds → ambers
  const lx = 34 + (h % 26); // key light drifts
  const forms = Array.from({ length: 4 }, (_, i) => {
    const cx = 150 + ((h >>> (i * 2)) % 320);
    const cy = 150 + ((h >>> (i * 3)) % 260);
    const rx = 70 + ((h >>> i) % 120);
    const ry = rx * (0.6 + ((h >>> (i + 2)) % 30) / 100);
    const l = 20 + ((h >>> (i + 4)) % 22);
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry.toFixed(0)}" fill="hsl(${hue + i * 4} 46% ${l}%)" filter="url(#soft-feat)"/>`;
  }).join("");
  const specks = Array.from({ length: 5 }, (_, i) => {
    const cx = 180 + ((h >>> (i * 4)) % 300);
    const cy = 150 + ((h >>> (i * 5)) % 260);
    return `<circle cx="${cx}" cy="${cy}" r="${2 + (i % 2)}" fill="#c9a15a" opacity="0.5"/>`;
  }).join("");
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 520" preserveAspectRatio="xMidYMid slice">
    ${defs("feat", `<radialGradient id="key-feat" cx="${lx}%" cy="34%" r="70%"><stop offset="0%" stop-color="hsl(${hue + 6} 40% 26%)"/><stop offset="55%" stop-color="hsl(${hue} 45% 11%)"/><stop offset="100%" stop-color="#080503"/></radialGradient>`)}
    <rect width="640" height="520" fill="url(#key-feat)"/>
    ${forms}
    <ellipse cx="${lx * 6}" cy="150" rx="150" ry="110" fill="#f0c68a" opacity="0.16" filter="url(#soft-feat)"/>
    ${specks}
    <rect width="640" height="520" fill="url(#vig-feat)"/>
    <rect width="640" height="520" filter="url(#grain-feat)" opacity="0.6"/>
  </svg>`);
}

/**
 * Ambient / category imagery — a warm, softly-lit tabletop vignette (linen,
 * glassware glints, candlelight) that sits behind a category label. Duotone
 * shifts per seed. Reads as an atmospheric restaurant detail shot.
 */
export function ambientPlaceholder(seed: string): string {
  const h = hash(seed);
  const base = 14 + (h % 30);
  const glints = Array.from({ length: 5 }, (_, i) => {
    const cx = ((h >>> (i * 3)) % 560) + 20;
    const cy = ((h >>> (i * 2)) % 380) + 20;
    const r = 18 + ((h >>> i) % 40);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f2cf95" opacity="0.14" filter="url(#soft-amb)"/>`;
  }).join("");
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
    ${defs("amb", `<linearGradient id="bg-amb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="hsl(${base} 40% 24%)"/><stop offset="60%" stop-color="hsl(${base} 45% 12%)"/><stop offset="100%" stop-color="#0d0906"/></linearGradient>`)}
    <rect width="600" height="400" fill="url(#bg-amb)"/>
    <ellipse cx="300" cy="330" rx="360" ry="120" fill="hsl(${base} 40% 30%)" opacity="0.5" filter="url(#soft-amb)"/>
    ${glints}
    <rect width="600" height="400" fill="url(#vig-amb)"/>
    <rect width="600" height="400" filter="url(#grain-amb)" opacity="0.6"/>
  </svg>`);
}
