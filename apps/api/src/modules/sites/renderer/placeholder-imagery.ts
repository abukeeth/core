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
 * Deli sandwich — a bright, saturated, overhead-ish stacked sub on butcher
 * paper: layered bands (bread → meat → cheese → tomato → lettuce → bread) with
 * a warm shadow. Light and appetising (the opposite of Maison's low-light
 * plates), matching a neighbourhood-deli identity. Filling palette shifts per
 * item name so a menu never repeats.
 */
export function deliSubPlaceholder(name: string): string {
  const h = hash(name);
  const meat = `hsl(${6 + (h % 14)} 62% 46%)`; // pastrami / roast → warm reds
  const cheese = `hsl(${44 + (h % 8)} 82% 60%)`;
  const bread = `hsl(${34 + (h % 8)} 52% 66%)`;
  const rot = (h >>> 3) % 6 - 3; // slight tilt
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 480" preserveAspectRatio="xMidYMid slice">
    ${defs("sub", `<linearGradient id="paper-sub" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f6edda"/><stop offset="100%" stop-color="#ecdfc2"/></linearGradient>`)}
    <rect width="600" height="480" fill="url(#paper-sub)"/>
    <g transform="rotate(${rot} 300 250)">
      <ellipse cx="300" cy="360" rx="210" ry="34" fill="#0000001a" filter="url(#soft-sub)"/>
      <rect x="120" y="150" width="360" height="46" rx="23" fill="${bread}"/>
      <rect x="112" y="192" width="376" height="30" rx="12" fill="#5c8a3a"/>
      <rect x="120" y="214" width="360" height="30" rx="10" fill="#d8472e"/>
      <rect x="116" y="236" width="368" height="34" rx="8" fill="${cheese}"/>
      <path d="M120 300 q90 -34 180 0 q90 34 180 0 v-36 q-90 34 -180 0 q-90 -34 -180 0 z" fill="${meat}"/>
      <rect x="120" y="300" width="360" height="54" rx="27" fill="${bread}"/>
      <circle cx="180" cy="176" r="6" fill="#f2d43a"/><circle cx="235" cy="172" r="5" fill="#f2d43a"/>
    </g>
    <rect width="600" height="480" filter="url(#grain-sub)" opacity="0.28"/>
  </svg>`);
}

/**
 * Deli tile — a bold classic deli-awning: fat diagonal butcher stripes in a
 * saturated deli colour (green / mustard / tomato, chosen per category) over
 * cream, with a stacked-sub emblem at the centre. Reads as branded deli
 * signage rather than an empty panel, and each category gets its own colour so
 * the "Explore the menu" row shows lively variety. Light and energetic to
 * match the neighbourhood-deli identity.
 */
export function deliTilePlaceholder(seed: string): string {
  const h = hash(seed);
  // Deli palette — one saturated stripe colour per category.
  const stripes = ["#1F6B4A", "#C4362B", "#E0A82E", "#2E7D5B", "#B84A2E"];
  const stripe = stripes[h % stripes.length];
  const cream = "#FBF3E4";
  // Fat diagonal awning stripes across the whole tile.
  const bands = Array.from({ length: 9 }, (_, i) => {
    const x = -200 + i * 100;
    return `<rect x="${x}" y="-120" width="52" height="640" fill="${stripe}" transform="rotate(20 300 200)"/>`;
  }).join("");
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
    ${defs("dtile")}
    <rect width="600" height="400" fill="${cream}"/>
    ${bands}
    <ellipse cx="300" cy="212" rx="150" ry="150" fill="${cream}" opacity="0.94"/>
    <g transform="translate(300 200)">
      <ellipse cx="0" cy="52" rx="118" ry="20" fill="#0000001a"/>
      <rect x="-104" y="-40" width="208" height="28" rx="14" fill="#D9A55C"/>
      <rect x="-110" y="-14" width="220" height="18" rx="8" fill="#5C8A3A"/>
      <rect x="-104" y="2" width="208" height="18" rx="8" fill="#D8472E"/>
      <rect x="-108" y="18" width="216" height="20" rx="9" fill="#F0C63A"/>
      <rect x="-104" y="36" width="208" height="30" rx="15" fill="#D9A55C"/>
      <circle cx="-56" cy="-26" r="4" fill="#F2D43a"/><circle cx="-24" cy="-28" r="3.5" fill="#F2D43a"/>
    </g>
    <rect width="600" height="400" filter="url(#grain-dtile)" opacity="0.22"/>
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
