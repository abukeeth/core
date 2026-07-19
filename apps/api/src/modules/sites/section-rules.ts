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
      case "signatureDishes":
      case "menu":
        return availability.hasMenuItems;
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
