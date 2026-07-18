/**
 * Theme Engine V2 — business-aware stock imagery.
 *
 * A freshly-imported business has no uploaded photos, which is exactly when
 * V1 fell back to flat gradient-and-initial tiles that made the storefront
 * look like a wireframe. This module supplies a real, curated photograph for
 * every image slot (hero, product, category, gallery), chosen automatically
 * from the business type / cuisine and the item or category name — so the
 * preview looks like a site a customer would publish today.
 *
 * Reliability: these are best-effort real photos (Unsplash CDN). Every render
 * site pairs the returned URL with a deterministic generated base layer (see
 * renderPhoto in image-fallback.ts), so a photo that fails to load degrades to
 * that generated layer rather than a broken box — the "hybrid, never empty"
 * contract. The host is allow-listed in the storefront CSP (app.ts imgSrc).
 *
 * Selection is deterministic on a caller-supplied key (usually the item or
 * category name), so the same card always gets the same photo across renders
 * and different cards in a grid get different photos.
 */

const UNSPLASH_HOST = "https://images.unsplash.com";

/** Build a sized, compressed Unsplash CDN URL from a photo id. */
function u(id: string, width = 800): string {
  return `${UNSPLASH_HOST}/photo-${id}?auto=format&fit=crop&w=${width}&q=70`;
}

export type ImagerySlot = "hero" | "food" | "category" | "gallery";

/** Stable non-negative hash for deterministic, name-based photo selection. */
export function stableHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// --- Curated pools --------------------------------------------------------
// Grouped by cuisine/business-type so imagery matches the business. Every
// pool has several options so a grid of cards varies. Ids are Unsplash photo
// ids; the generated fallback layer covers any that fail to resolve.

const GENERIC_FOOD: string[] = [
  "1504674900247-0877df9cc836", // plated dish
  "1546069901-ba9599a7e63c", // fresh bowl
  "1512621776951-a57141f2eefd", // salad
  "1467003909585-2f8a72700288", // fine plating
  "1476224203421-9ac39bcb3327", // seafood
  "1414235077428-338989a2e8c0", // restaurant table
];

const CUISINE_FOOD: Record<string, string[]> = {
  italian: ["1551183053-bf91a1d81141", "1595295333158-4742f28fbd85", "1574894709920-11b28e7367e9", "1533777324565-a040eb52facd"],
  pizza: ["1513104890138-7c749659a591", "1565299624946-b28f40a0ae38", "1594007654729-407eedc4be65"],
  mexican: ["1565299585323-38d6b0865b47", "1552332386-f8dd00dc2f85", "1599974579688-8dbdd335c77f"],
  japanese: ["1553621042-f6e147245754", "1579584425555-c3ce17fd4351", "1617196034796-73dfa7b1fd56"],
  "sushi-omakase": ["1553621042-f6e147245754", "1611143669185-af224c5e3252", "1617196034796-73dfa7b1fd56"],
  chinese: ["1585032226651-759b368d7246", "1548943487-a2e4e43b4853", "1563245372-f21724e3856d"],
  thai: ["1559314809-0d155014e29e", "1562565652-a0d8f0c59eb4", "1626804475297-41608ea09aeb"],
  indian: ["1585937421612-70a008356fbe", "1631452180519-c014fe946bc7", "1596797038530-2c107229654b"],
  american: ["1568901346375-23c9450c58cd", "1550547660-d9450f859349", "1571091718767-18b5b1457add"],
  steakhouse: ["1600891964092-4316c288032e", "1544025162-d76694265947", "1546964124-0cce460f38ef"],
  seafood: ["1519708227418-c8fd9a32b7a2", "1565680018434-b513d5e5fd47", "1544551763-46a013bb70d5"],
  cafe: ["1495474472287-4d71bcdd2085", "1509042239860-f550ce710b93", "1445116572660-236099ec97a0"],
  coffee: ["1495474472287-4d71bcdd2085", "1461023058943-07fcbe16d735", "1521302080334-4bebac2763a6"],
  bakery: ["1509440159596-0249088772ff", "1555507036-ab1f4038808a", "1568254183919-78a4f43a2877"],
  mediterranean: ["1544510808-91bcbee6c0f6", "1540189549336-e6e99c3679fe", "1512621776951-a57141f2eefd"],
  french: ["1414235077428-338989a2e8c0", "1467003909585-2f8a72700288", "1550547660-d9450f859349"],
  korean: ["1583224964978-2257b960c3d3", "1498654896293-37aacf113fd9", "1590301157890-4810ed352733"],
  vegan: ["1512621776951-a57141f2eefd", "1490645935967-10de6ba17061", "1546069901-ba9599a7e63c"],
};

// Category-name keyword → photo. Matched case-insensitively as a substring so
// "Desserts", "Sweet Desserts" and "Dessert Menu" all resolve.
const CATEGORY_KEYWORDS: Record<string, string> = {
  pizza: "1513104890138-7c749659a591",
  burger: "1568901346375-23c9450c58cd",
  pasta: "1551183053-bf91a1d81141",
  salad: "1512621776951-a57141f2eefd",
  dessert: "1551024506-0bccd828d307",
  cake: "1578985545062-69928b1d9587",
  coffee: "1495474472287-4d71bcdd2085",
  drink: "1551024709-8f23befc6f87",
  cocktail: "1551024709-8f23befc6f87",
  wine: "1510812431401-41d2bd2722f3",
  beer: "1535958636474-b021ee887b13",
  breakfast: "1533089860892-a7c6f0a88666",
  brunch: "1533089860892-a7c6f0a88666",
  seafood: "1519708227418-c8fd9a32b7a2",
  steak: "1600891964092-4316c288032e",
  taco: "1565299585323-38d6b0865b47",
  sushi: "1553621042-f6e147245754",
  soup: "1547592180-85f173990554",
  sandwich: "1553909489-cd47e0907980",
  chicken: "1562967914-608f82629710",
  bread: "1509440159596-0249088772ff",
  appetizer: "1541014741259-de529411b96a",
  side: "1541014741259-de529411b96a",
  main: "1504674900247-0877df9cc836",
  special: "1467003909585-2f8a72700288",
  vegetarian: "1490645935967-10de6ba17061",
  vegan: "1490645935967-10de6ba17061",
};

const HERO_BY_TYPE: Record<string, string[]> = {
  restaurant: ["1517248135467-4c7edcad34c4", "1414235077428-338989a2e8c0", "1550966871-3ed3cdb5ed0c"],
  cafe: ["1554118811-1e0d58224f24", "1445116572660-236099ec97a0", "1495474472287-4d71bcdd2085"],
  "coffee shop": ["1554118811-1e0d58224f24", "1453614512568-c4024d13c247", "1521017432531-fbd92d768814"],
  bakery: ["1509440159596-0249088772ff", "1555507036-ab1f4038808a", "1568254183919-78a4f43a2877"],
  bar: ["1514933651103-005eec06c04b", "1470337458703-46ad1756a187", "1510812431401-41d2bd2722f3"],
  "cocktail-bar": ["1514933651103-005eec06c04b", "1551024709-8f23befc6f87", "1470337458703-46ad1756a187"],
  bistro: ["1517248135467-4c7edcad34c4", "1600891964092-4316c288032e", "1414235077428-338989a2e8c0"],
  pizzeria: ["1513104890138-7c749659a591", "1565299624946-b28f40a0ae38", "1571997478779-2adcbbe9ab2f"],
  deli: ["1553909489-cd47e0907980", "1568254183919-78a4f43a2877", "1509440159596-0249088772ff"],
  diner: ["1568901346375-23c9450c58cd", "1550547660-d9450f859349", "1571091718767-18b5b1457add"],
  grocery: ["1542838132-92c53300491e", "1550989460-0adf9ea622e2", "1604719312566-8912e9227c6a"],
  retail: ["1441986300917-64674bd600d8", "1472851294608-062f824d29cc", "1555529669-e69e7aa0ba9a"],
};

const GENERIC_HERO: string[] = ["1517248135467-4c7edcad34c4", "1414235077428-338989a2e8c0", "1550966871-3ed3cdb5ed0c", "1424847651672-bf20a4b0982b"];

function pickFrom(pool: string[], key: string, width: number): string {
  const id = pool[stableHash(key) % pool.length];
  return u(id, width);
}

function normalize(value: string | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

export interface StockPhotoInput {
  slot: ImagerySlot;
  /** brandProfile.cuisine, e.g. "italian". */
  cuisine?: string;
  /** brandProfile.businessType, e.g. "cafe". */
  businessType?: string;
  /** The item or category name — drives keyword matching and deterministic variety. */
  key: string;
}

/**
 * Returns a curated stock photo URL for the slot, matched to the business and
 * (for food/category slots) the item/category name. Always returns a URL;
 * callers layer it over a generated fallback so a failed load never shows an
 * empty box.
 */
export function pickStockPhoto(input: StockPhotoInput): string {
  const cuisine = normalize(input.cuisine);
  const businessType = normalize(input.businessType);
  const name = normalize(input.key);

  if (input.slot === "hero") {
    const pool = HERO_BY_TYPE[businessType] ?? HERO_BY_TYPE[cuisine] ?? CUISINE_FOOD[cuisine] ?? GENERIC_HERO;
    return pickFrom(pool, input.key || businessType || cuisine || "hero", 1600);
  }

  // food + category: try a name keyword first, then cuisine pool, then generic.
  const keyword = Object.keys(CATEGORY_KEYWORDS).find((kw) => name.includes(kw));
  if (keyword) return u(CATEGORY_KEYWORDS[keyword], input.slot === "category" ? 800 : 600);

  const pool = CUISINE_FOOD[cuisine] ?? GENERIC_FOOD;
  return pickFrom(pool, input.key || cuisine || "food", input.slot === "category" ? 800 : 600);
}

/**
 * A deterministic set of distinct gallery photos for a business — used when
 * the owner hasn't uploaded a gallery yet, so the Gallery section still shows
 * real imagery instead of vanishing.
 */
export function galleryStockPhotos(input: { cuisine?: string; businessType?: string; count: number }): string[] {
  const cuisine = normalize(input.cuisine);
  // Combine the cuisine pool with the generic pool (deduped) so we can always
  // supply the requested count of distinct photos even for a small cuisine set.
  const pool = [...new Set([...(CUISINE_FOOD[cuisine] ?? []), ...GENERIC_FOOD])];
  const seed = `${cuisine || "food"}-gallery`;
  const start = stableHash(seed) % pool.length;
  const out: string[] = [];
  for (let i = 0; i < Math.min(input.count, pool.length); i++) {
    out.push(u(pool[(start + i) % pool.length], 600));
  }
  return out;
}

export { UNSPLASH_HOST };
