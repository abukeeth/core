import { getStringEnv } from "../../../config/env";
import { resolveAssetRenditionKey } from "../../../lib/image-processing";
import { prisma } from "../../../lib/prisma";
import { getTopItems } from "../../commerce/analytics/analytics.service";
import { listActiveCoupons } from "../../commerce/coupons/coupons.service";
import { getProgram } from "../../commerce/loyalty/loyalty.service";
import { listRestaurantReviews } from "../../commerce/reviews/reviews.service";
import { listCategories } from "../../menu/menu.service";
import { THEME_CATALOG } from "../theme-catalog";
import { buildCarrierTheme, isThemeFreeDefinition } from "./theme-carrier";
import type { SiteDefinition, SiteFacts } from "../types";
import { assetUrl } from "./asset-url";
import type {
  BestSellerItem,
  LiveMenuCategory,
  RenderAssets,
  RenderLoyaltyProgram,
  RenderOffer,
  RenderReview,
  ServiceAvailability,
} from "./render-context";
import { renderPage } from "./render-page";

const FRONTEND_URL = getStringEnv("FRONTEND_URL", "http://localhost:3000");
const BEST_SELLERS_WINDOW_DAYS = 30;
const BEST_SELLERS_LIMIT = 8;

export async function resolveLiveMenu(restaurantId: string): Promise<LiveMenuCategory[]> {
  const categories = await listCategories(restaurantId);
  return categories.map((category) => ({
    name: category.name,
    imageUrl: category.imageKey ? assetUrl(category.imageKey) : undefined,
    items: category.items.map((item) => ({
      name: item.name,
      description: item.description ?? undefined,
      priceCents: item.priceCents,
      isAvailable: item.isAvailable,
      imageUrl: item.imageKey ? assetUrl(item.imageKey) : undefined,
    })),
  }));
}

export async function resolveRenderAssets(siteId: string): Promise<RenderAssets> {
  const assets = await prisma.siteAsset.findMany({ where: { siteId }, orderBy: { sortOrder: "asc" } });

  const hero = assets.find((asset) => asset.kind === "HERO");
  const heroBackground = assets.find((asset) => asset.kind === "HERO_BACKGROUND");
  const gallery = assets.filter((asset) => asset.kind === "GALLERY");
  const logo = assets.find((asset) => asset.kind === "LOGO");
  const favicon = assets.find((asset) => asset.kind === "FAVICON");

  // Production Hardening Phase 8: prefer the responsive WebP variant sized
  // for how each kind is actually displayed, falling back to the
  // full-resolution original when no rendition was generated (resizing
  // failed open, or the asset predates this phase).
  return {
    heroUrl: hero ? assetUrl(resolveAssetRenditionKey(hero, "full")) : undefined,
    heroAlt: hero?.altText ?? undefined,
    heroBackgroundUrl: heroBackground ? assetUrl(resolveAssetRenditionKey(heroBackground, "full")) : undefined,
    galleryImages: gallery.map((asset) => ({ url: assetUrl(resolveAssetRenditionKey(asset, "card")), alt: asset.altText ?? "" })),
    logoUrl: logo ? assetUrl(resolveAssetRenditionKey(logo, "card")) : undefined,
    faviconUrl: favicon ? assetUrl(resolveAssetRenditionKey(favicon, "thumbnail")) : undefined,
  };
}

async function resolveBestSellers(restaurantId: string): Promise<BestSellerItem[]> {
  const items = await getTopItems(restaurantId, BEST_SELLERS_WINDOW_DAYS, BEST_SELLERS_LIMIT);
  if (items.length === 0) return [];

  // A second, targeted lookup (not a join inside analytics.service.ts's
  // order-history query) — keeps the storefront's image concern in the
  // renderer module rather than reaching into the commerce/analytics one.
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: items.map((item) => item.menuItemId) } },
    select: { id: true, imageKey: true },
  });
  const imageKeyByItemId = new Map(menuItems.map((item) => [item.id, item.imageKey]));

  return items.map((item) => {
    const imageKey = imageKeyByItemId.get(item.menuItemId);
    return { menuItemId: item.menuItemId, name: item.name, quantitySold: item.quantitySold, imageUrl: imageKey ? assetUrl(imageKey) : undefined };
  });
}

async function resolveActiveOffers(restaurantId: string): Promise<RenderOffer[]> {
  const coupons = await listActiveCoupons(restaurantId);
  return coupons.map((coupon) => ({
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    minOrderCents: coupon.minOrderCents,
    expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString() : null,
  }));
}

async function resolveLoyaltyProgram(restaurantId: string): Promise<RenderLoyaltyProgram | null> {
  const program = await getProgram(restaurantId);
  if (!program) return null;
  return { isActive: program.isActive, pointsPerDollarCents: program.pointsPerDollarCents, redemptionRateCentsPerPoint: program.redemptionRateCentsPerPoint };
}

/**
 * Real service availability — the single source of truth is the tenant's own
 * DeliveryConfig (pickup/delivery/dine-in booleans) plus facts.hasReservations.
 * When no DeliveryConfig row exists the flags default to false, so the service
 * band gracefully shows nothing rather than inventing availability.
 */
async function resolveServiceAvailability(restaurantId: string, facts: SiteFacts): Promise<ServiceAvailability> {
  const config = await prisma.deliveryConfig.findUnique({ where: { restaurantId } });
  return {
    pickup: config?.isPickupEnabled ?? false,
    delivery: config?.isDeliveryEnabled ?? false,
    dineIn: config?.isDineInEnabled ?? false,
    reservations: facts.hasReservations,
  };
}

const REVIEWS_LIMIT = 6;

/** Real, verified reviews only (COMPLETED-order reviews with a written comment). Empty ⇒ the reviews section omits itself. */
async function resolveReviews(restaurantId: string): Promise<RenderReview[]> {
  const reviews = await listRestaurantReviews(restaurantId, REVIEWS_LIMIT);
  return reviews
    .filter((review) => review.comment !== null && review.comment.trim().length > 0)
    .map((review) => ({
      author: review.customerFirstName,
      rating: review.rating,
      quote: review.comment as string,
      createdAt: review.createdAt.toISOString(),
    }));
}

function resolveTheme(definition: SiteDefinition) {
  // Generation V2 definitions are theme-free — they carry their own tokens
  // and render through a synthesized carrier, never the catalog.
  if (isThemeFreeDefinition(definition)) return buildCarrierTheme(definition);
  const theme = THEME_CATALOG.find((t) => t.key === definition.themeKey && t.version === definition.themeVersion);
  if (!theme) {
    throw new Error(`Unknown theme "${definition.themeKey}" v${definition.themeVersion}`);
  }
  return theme;
}

export interface RenderSiteInput {
  siteId: string;
  restaurantId: string;
  definition: SiteDefinition;
  siteUrl: string;
  noindex?: boolean;
}

/** Resolves live data (menu, assets) then delegates to the pure renderPage() — the DB-touching half of "the same renderer" for one page. */
export async function renderSitePage(input: RenderSiteInput, slug: string): Promise<string | null> {
  const page = input.definition.pages.find((p) => p.slug === slug);
  if (!page) return null;

  const [liveMenu, assets, bestSellers, activeOffers, loyaltyProgram, services, reviews] = await Promise.all([
    resolveLiveMenu(input.restaurantId),
    resolveRenderAssets(input.siteId),
    resolveBestSellers(input.restaurantId),
    resolveActiveOffers(input.restaurantId),
    resolveLoyaltyProgram(input.restaurantId),
    resolveServiceAvailability(input.restaurantId, input.definition.facts),
    resolveReviews(input.restaurantId),
  ]);

  return renderPage({
    ctx: {
      siteId: input.siteId,
      restaurantId: input.restaurantId,
      definition: input.definition,
      liveMenu,
      // Sprint 5.5 — surface the once-generated AI impression images into the
      // resolver's AI slot; a real uploaded/Google photo still wins over AI.
      assets: {
        ...assets,
        aiHeroUrl: input.definition.aiAssets?.heroUrl,
        aiCategoryImages: input.definition.aiAssets?.categoryImages,
        aiProductImages: input.definition.aiAssets?.productImages,
        aiMarketingUrl: input.definition.aiAssets?.marketingUrl,
      },
      orderingBaseUrl: FRONTEND_URL,
      bestSellers,
      activeOffers,
      loyaltyProgram,
      services,
      reviews,
    },
    page,
    theme: resolveTheme(input.definition),
    siteUrl: input.siteUrl,
    noindex: input.noindex,
  });
}

/** Renders every page of a definition — used by publishSite's static-generation step. */
export async function renderAllPages(input: RenderSiteInput): Promise<Map<string, string>> {
  const [liveMenu, assets, bestSellers, activeOffers, loyaltyProgram, services, reviews] = await Promise.all([
    resolveLiveMenu(input.restaurantId),
    resolveRenderAssets(input.siteId),
    resolveBestSellers(input.restaurantId),
    resolveActiveOffers(input.restaurantId),
    resolveLoyaltyProgram(input.restaurantId),
    resolveServiceAvailability(input.restaurantId, input.definition.facts),
    resolveReviews(input.restaurantId),
  ]);
  const theme = resolveTheme(input.definition);
  const ctx = {
    siteId: input.siteId,
    restaurantId: input.restaurantId,
    definition: input.definition,
    liveMenu,
    assets: {
      ...assets,
      aiHeroUrl: input.definition.aiAssets?.heroUrl,
      aiCategoryImages: input.definition.aiAssets?.categoryImages,
        aiProductImages: input.definition.aiAssets?.productImages,
      aiMarketingUrl: input.definition.aiAssets?.marketingUrl,
    },
    orderingBaseUrl: FRONTEND_URL,
    bestSellers,
    activeOffers,
    loyaltyProgram,
    services,
    reviews,
  };

  const pages = new Map<string, string>();
  for (const page of input.definition.pages) {
    pages.set(page.slug, renderPage({ ctx, page, theme, siteUrl: input.siteUrl, noindex: input.noindex }));
  }
  return pages;
}
