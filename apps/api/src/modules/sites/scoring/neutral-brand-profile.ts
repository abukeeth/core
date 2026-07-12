import type { BrandProfile } from "../types";

/** Used to score a SiteDefinition when no Brand Profile has been persisted yet — confidence 0 everywhere, same shape brand-analysis.ts falls back to. */
export const NEUTRAL_BRAND_PROFILE_FOR_SCORING: BrandProfile = {
  cuisine: "eclectic",
  businessType: "casual dining",
  priceTier: 2,
  personality: {
    traditionalContemporary: 0.5,
    casualFormal: 0.5,
    playfulSerious: 0.5,
    understatedBold: 0.5,
    rusticPolished: 0.5,
  },
  signalsUsed: [],
  confidence: { cuisine: 0, businessType: 0, priceTier: 0, personality: 0 },
};
