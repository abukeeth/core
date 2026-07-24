import type { SectionType } from "./types";

export interface SectionAvailability {
  hasMenuItems: boolean;
  hasPhotos: boolean;
  hasHoursOrLocation: boolean;
}

/**
 * Home page rules engine (§4): sections with missing data are skipped
 * entirely rather than rendered empty; order is otherwise whatever the
 * theme's layout preset specifies. Testimonials never pass through here —
 * there's no testimonial data source in this data model yet, and the
 * generator must never fabricate one (§2 Guardrails), so it's excluded
 * unconditionally rather than gated on a flag that would always be false.
 */
export function filterSectionsByAvailability(order: SectionType[], availability: SectionAvailability): SectionType[] {
  return order.filter((type) => {
    switch (type) {
      // signatureDishes / menu, plus the flagship sections that are meaningless
      // without a menu (productCollection / featuredBrands / comboDeals) — all
      // dropped early when there are no items (each also self-omits at render).
      // The deli catering / build-your-own bands are deliberately NOT here: they
      // are generic marketing content with no menu dependency, so a brand-new
      // store still gets them.
      case "signatureDishes":
      case "menu":
      case "productCollection":
      case "featuredBrands":
      case "comboDeals":
        return availability.hasMenuItems;
      case "storeLocations":
        return availability.hasHoursOrLocation;
      // Gallery is always kept: a theme may render an immersive editorial
      // gallery from art-directed imagery when the owner has uploaded none
      // (restaurant-maison), while themes that only show real uploads simply
      // render nothing and are dropped by the layout engine's empty filter.
      case "hoursLocation":
        return availability.hasHoursOrLocation;
      case "testimonials":
        return false;
      default:
        return true;
    }
  });
}
