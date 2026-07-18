import type { SiteDefinition } from "../types";

export interface LiveMenuCategory {
  name: string;
  imageUrl?: string;
  items: { name: string; description?: string; priceCents: number; isAvailable: boolean; imageUrl?: string }[];
}

export interface RenderAssets {
  heroUrl?: string;
  heroAlt?: string;
  heroBackgroundUrl?: string;
  galleryImages: { url: string; alt: string }[];
  logoUrl?: string;
  faviconUrl?: string;
}

/** Real order history, not fabricated — see analytics.service.ts's getTopItems. */
export interface BestSellerItem {
  menuItemId: string;
  name: string;
  quantitySold: number;
  imageUrl?: string;
}

/** Real, currently-redeemable coupons — see coupons.service.ts's listActiveCoupons. */
export interface RenderOffer {
  code: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_DELIVERY";
  value: number;
  minOrderCents: number | null;
  expiresAt: string | null;
}

/** The restaurant's real loyalty program config — see loyalty.service.ts's getProgram. Null when the owner has never enabled loyalty. */
export interface RenderLoyaltyProgram {
  isActive: boolean;
  pointsPerDollarCents: number;
  redemptionRateCentsPerPoint: number;
}

/**
 * The service options the tenant has actually enabled — resolved from the
 * real DeliveryConfig flags (pickup/delivery/dine-in) plus facts.hasReservations.
 * Never fabricated: a service is `true` only when the owner has enabled it.
 */
export interface ServiceAvailability {
  pickup: boolean;
  delivery: boolean;
  dineIn: boolean;
  reservations: boolean;
}

/**
 * A real, verified customer review — see reviews.service.ts's
 * listRestaurantReviews (created only from a COMPLETED order by the customer
 * who placed it). Never auto-generated; the section is omitted entirely when
 * there are none.
 */
export interface RenderReview {
  author: string;
  rating: number;
  quote: string;
  createdAt?: string;
}

/**
 * Everything a section renderer needs beyond its own `props`. Menu data is
 * live (fetched fresh at render time, not baked into the stored
 * SiteDefinition JSON) per §5: "renders directly from the live menu
 * database — menu edits reflect on the site without regeneration."
 */
export interface RenderContext {
  siteId: string;
  restaurantId: string;
  definition: SiteDefinition;
  liveMenu: LiveMenuCategory[];
  assets: RenderAssets;
  // The main OrderVora app's own URL (Sprint 20A Task 5) — a tenant's
  // storefront can't run the commerce engine itself, so header Cart/
  // Order/Account links point out to it by absolute URL. Resolved once at
  // the render-site.ts layer (which already reads config for siteUrl)
  // rather than inside a leaf component, so every renderer component stays
  // a pure function of its inputs — no env access, no DB access, fully
  // unit-testable with a plain object.
  orderingBaseUrl: string;
  // Real backend data for the Sprint 20A Task 5 section types — resolved
  // once at render-site.ts alongside liveMenu/assets, same "always live,
  // never baked into the stored definition" contract §5 already established
  // for the menu section.
  bestSellers: BestSellerItem[];
  activeOffers: RenderOffer[];
  loyaltyProgram: RenderLoyaltyProgram | null;
  // Theme Engine V3 real-data additions — resolved once at render-site.ts,
  // same "always live, never baked into the stored definition" contract.
  // Optional so the many unit-test render contexts (and any pre-existing
  // caller) keep compiling; the components treat `undefined` as "no data"
  // and degrade gracefully (the service band / reviews section self-omit).
  services?: ServiceAvailability;
  reviews?: RenderReview[];
}

export function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}
