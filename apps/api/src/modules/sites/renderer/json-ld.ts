import type { SitePage } from "../types";
import type { LiveMenuCategory } from "./render-context";
import { formatPrice } from "./render-context";

export interface JsonLdInput {
  restaurantName: string;
  cuisine: string;
  siteUrl: string;
  facts: { address?: string; phone?: string; hasReservations: boolean };
  heroImageUrl?: string;
  liveMenu: LiveMenuCategory[];
  pages: SitePage[];
  currentPage: SitePage;
}

/** §11 Schema.org — Restaurant + Menu/MenuSection/MenuItem + BreadcrumbList, one script per page. */
export function buildRestaurantJsonLd(input: JsonLdInput): Record<string, unknown> {
  const restaurant: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: input.restaurantName,
    servesCuisine: input.cuisine,
    url: input.siteUrl,
    acceptsReservations: input.facts.hasReservations,
  };
  if (input.facts.address) restaurant.address = input.facts.address;
  if (input.facts.phone) restaurant.telephone = input.facts.phone;
  if (input.heroImageUrl) restaurant.image = input.heroImageUrl;

  const availableItems = input.liveMenu.filter((category) => category.items.some((item) => item.isAvailable));
  if (availableItems.length > 0) {
    restaurant.hasMenu = {
      "@type": "Menu",
      hasMenuSection: availableItems.map((category) => ({
        "@type": "MenuSection",
        name: category.name,
        hasMenuItem: category.items
          .filter((item) => item.isAvailable)
          .map((item) => ({
            "@type": "MenuItem",
            name: item.name,
            ...(item.description ? { description: item.description } : {}),
            offers: { "@type": "Offer", price: formatPrice(item.priceCents), priceCurrency: "USD" },
          })),
      })),
    };
  }

  return restaurant;
}

export function buildBreadcrumbJsonLd(input: JsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: input.pages.map((page, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: page.title,
      item: `${input.siteUrl}${page.slug === "/" ? "" : page.slug}`,
    })),
  };
}
