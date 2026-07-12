import { describe, expect, it } from "vitest";
import { buildBreadcrumbJsonLd, buildRestaurantJsonLd, type JsonLdInput } from "./json-ld";

function input(overrides: Partial<JsonLdInput> = {}): JsonLdInput {
  return {
    restaurantName: "Trattoria Bella",
    cuisine: "italian",
    siteUrl: "https://trattoria-bella.sites.ordervora.example",
    facts: { address: "123 Main St", phone: "555-0100", hasReservations: true },
    liveMenu: [
      {
        name: "Mains",
        items: [{ name: "Spaghetti", description: "Classic", priceCents: 1500, isAvailable: true }],
      },
    ],
    pages: [
      { slug: "/", title: "Home", metaDescription: "x", sections: [] },
      { slug: "/menu", title: "Menu", metaDescription: "x", sections: [] },
    ],
    currentPage: { slug: "/", title: "Home", metaDescription: "x", sections: [] },
    ...overrides,
  };
}

describe("buildRestaurantJsonLd", () => {
  it("produces a valid Restaurant type with core fields", () => {
    const jsonLd = buildRestaurantJsonLd(input());
    expect(jsonLd["@type"]).toBe("Restaurant");
    expect(jsonLd.name).toBe("Trattoria Bella");
    expect(jsonLd.address).toBe("123 Main St");
    expect(jsonLd.acceptsReservations).toBe(true);
  });

  it("includes a hasMenu with MenuSection/MenuItem/Offer for available items", () => {
    const jsonLd = buildRestaurantJsonLd(input()) as { hasMenu: { hasMenuSection: { hasMenuItem: { name: string; offers: { price: string } }[] }[] } };
    expect(jsonLd.hasMenu.hasMenuSection[0].hasMenuItem[0]).toEqual({
      "@type": "MenuItem",
      name: "Spaghetti",
      description: "Classic",
      offers: { "@type": "Offer", price: "15.00", priceCurrency: "USD" },
    });
  });

  it("excludes unavailable items from the menu", () => {
    const jsonLd = buildRestaurantJsonLd(
      input({
        liveMenu: [
          {
            name: "Mains",
            items: [
              { name: "Spaghetti", priceCents: 1500, isAvailable: true },
              { name: "86'd Special", priceCents: 2000, isAvailable: false },
            ],
          },
        ],
      }),
    ) as { hasMenu: { hasMenuSection: { hasMenuItem: { name: string }[] }[] } };
    const names = jsonLd.hasMenu.hasMenuSection[0].hasMenuItem.map((i) => i.name);
    expect(names).toEqual(["Spaghetti"]);
  });

  it("omits hasMenu entirely when there are no available items", () => {
    const jsonLd = buildRestaurantJsonLd(input({ liveMenu: [] }));
    expect(jsonLd.hasMenu).toBeUndefined();
  });

  it("never fabricates a review/rating/award field", () => {
    const jsonLd = buildRestaurantJsonLd(input());
    expect(jsonLd).not.toHaveProperty("aggregateRating");
    expect(jsonLd).not.toHaveProperty("review");
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("lists every page in order with 1-based positions", () => {
    const jsonLd = buildBreadcrumbJsonLd(input()) as { itemListElement: { position: number; name: string }[] };
    expect(jsonLd.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://trattoria-bella.sites.ordervora.example" },
      { "@type": "ListItem", position: 2, name: "Menu", item: "https://trattoria-bella.sites.ordervora.example/menu" },
    ]);
  });
});
