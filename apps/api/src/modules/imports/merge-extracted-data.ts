import type { ExtractedMenuData } from "./types";

/**
 * Combines multiple extraction results (e.g. a website's text extraction
 * plus one per candidate menu image, or several Google Maps listing
 * photos) into the single ExtractedMenuData an ImportJob stores.
 * Categories are concatenated in order (no cross-result de-duplication —
 * left for the human reviewer at approve/reject time). businessProfile
 * fields are filled from the first result that has each one.
 */
export function mergeExtractedMenuData(results: ExtractedMenuData[]): ExtractedMenuData {
  const categories = results.flatMap((result) => result.categories);

  const businessProfile: NonNullable<ExtractedMenuData["businessProfile"]> = {};
  const socialLinksByPlatform = new Map<string, string>();
  for (const result of results) {
    if (!result.businessProfile) continue;
    businessProfile.name ??= result.businessProfile.name;
    businessProfile.address ??= result.businessProfile.address;
    businessProfile.phone ??= result.businessProfile.phone;
    businessProfile.website ??= result.businessProfile.website;
    businessProfile.hours ??= result.businessProfile.hours;
    businessProfile.logoUrl ??= result.businessProfile.logoUrl;
    for (const link of result.businessProfile.socialLinks ?? []) {
      if (!socialLinksByPlatform.has(link.platform)) {
        socialLinksByPlatform.set(link.platform, link.url);
      }
    }
  }
  if (socialLinksByPlatform.size > 0) {
    businessProfile.socialLinks = [...socialLinksByPlatform].map(([platform, url]) => ({ platform, url }));
  }

  const hasProfile = Object.values(businessProfile).some((value) => value !== undefined);

  return {
    categories,
    ...(hasProfile ? { businessProfile } : {}),
  };
}
