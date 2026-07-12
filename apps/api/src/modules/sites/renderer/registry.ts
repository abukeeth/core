import type { SectionBlock, SectionType } from "../types";
import { renderAboutStory, renderAboutTeaser } from "./components/about-teaser";
import { renderAppPromotion } from "./components/app-promotion";
import { renderBestSellers } from "./components/best-sellers";
import { renderContactForm, renderContactInfo } from "./components/contact";
import { renderCtaBanner } from "./components/cta-banner";
import { renderCustomTextImage } from "./components/custom-text-image";
import { renderFeaturedCategories } from "./components/featured-categories";
import { renderFeaturedProducts } from "./components/featured-products";
import { renderFooter } from "./components/footer";
import { renderGallery } from "./components/gallery";
import { renderHero } from "./components/hero";
import { renderHoursLocation } from "./components/hours-location";
import { renderLoyalty } from "./components/loyalty";
import { renderMenuSection } from "./components/menu-section";
import { renderNewsletter } from "./components/newsletter";
import { renderOffers } from "./components/offers";
import { renderReviews } from "./components/reviews";
import { renderSignatureDishes } from "./components/signature-dishes";
import type { RenderContext } from "./render-context";

export type SectionRenderer = (section: SectionBlock, ctx: RenderContext) => string;

/**
 * §15 Layout Engine: "Registry maps block type → component." Deliberately
 * has NO entry for "testimonials" — the generator never emits that block
 * (no testimonial data source exists, and none should ever be fabricated,
 * §2 Guardrails), so it's left to fall through the same
 * unknown-block-degrades-gracefully path real future/deprecated block
 * types would use, rather than shipping a component that can never run.
 * ("reviews", Sprint 20A Task 5's owner-authored replacement for the same
 * idea, DOES have a real registered component — see reviews.ts's doc
 * comment for why that one's different.)
 */
const REGISTRY: Partial<Record<SectionType, SectionRenderer>> = {
  hero: renderHero,
  signatureDishes: renderSignatureDishes,
  featuredCategories: renderFeaturedCategories,
  featuredProducts: renderFeaturedProducts,
  bestSellers: renderBestSellers,
  offers: renderOffers,
  aboutTeaser: renderAboutTeaser,
  aboutStory: renderAboutStory,
  hoursLocation: renderHoursLocation,
  reviews: renderReviews,
  gallery: renderGallery,
  loyalty: renderLoyalty,
  appPromotion: renderAppPromotion,
  ctaBanner: renderCtaBanner,
  menu: renderMenuSection,
  contactInfo: renderContactInfo,
  contactForm: renderContactForm,
  newsletter: renderNewsletter,
  customTextImage: renderCustomTextImage,
  footer: renderFooter,
};

export function getSectionRenderer(type: SectionType): SectionRenderer | undefined {
  return REGISTRY[type];
}

export function registeredSectionTypes(): SectionType[] {
  return Object.keys(REGISTRY) as SectionType[];
}
