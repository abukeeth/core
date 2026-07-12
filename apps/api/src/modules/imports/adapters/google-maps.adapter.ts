import { ImportSourceType } from "@prisma/client";
import { fileStorage } from "../../../lib/file-storage";
import { assetUrl } from "../../sites/renderer/asset-url";
import { mergeExtractedMenuData } from "../merge-extracted-data";
import type { ExtractedMenuData, ImportAdapter, ImportSourceInput } from "../types";
import { extractMenuFromImages } from "../vision-extractor";
import { getPlaceDetails, getPlacePhoto } from "./google-maps/places-client";
import { resolvePlaceId } from "./google-maps/resolve-place-id";
import { extractWebsiteData } from "./website.adapter";

const MAX_MENU_PHOTOS = 3;

export class GoogleMapsImportAdapter implements ImportAdapter {
  readonly sourceType = ImportSourceType.GOOGLE_MAPS;
  readonly implemented = true;
  readonly inputKind = "url" as const;

  async extract(input: ImportSourceInput): Promise<ExtractedMenuData> {
    if (input.kind !== "url") {
      throw new Error("Google Maps import requires a place URL or Place ID");
    }

    const placeId = await resolvePlaceId(input.url);
    const details = await getPlaceDetails(placeId);

    const results: ExtractedMenuData[] = [];

    // The listing's first photo stands in for a "logo" (Places API has no
    // dedicated logo field) — persisted through the same file-storage +
    // assetUrl pattern the sites module uses for asset images, so the
    // review screen can render it. Best-effort: no logo isn't a failure.
    const [firstPhotoName, ...menuPhotoNames] = details.photoNames;
    const logoUrl = firstPhotoName ? await this.tryPersistLogo(firstPhotoName) : undefined;

    if (details.name ?? details.address ?? details.phone ?? details.website ?? details.hours ?? logoUrl) {
      results.push({
        categories: [],
        businessProfile: {
          name: details.name,
          address: details.address,
          phone: details.phone,
          website: details.website,
          hours: details.hours,
          logoUrl,
        },
      });
    }

    for (const photoName of menuPhotoNames.slice(0, MAX_MENU_PHOTOS)) {
      results.push(...(await this.tryExtractPhoto(photoName)));
    }

    // "If a website exists, automatically discover and crawl it" — reuses
    // the exact same core the Website source uses, so a listing's site
    // gets the same text+image extraction, menu-link crawl, and social
    // link discovery a direct Website import would produce.
    if (details.website) {
      try {
        results.push(await extractWebsiteData(details.website));
      } catch {
        // Auto-crawling the listing's website is best-effort — the
        // Places-API-derived profile/photos still stand if this fails.
      }
    }

    return mergeExtractedMenuData(results);
  }

  private async tryPersistLogo(photoName: string): Promise<string | undefined> {
    try {
      const photoBuffer = await getPlacePhoto(photoName);
      const saved = await fileStorage.save(photoBuffer, "logo.jpg");
      return assetUrl(saved.path);
    } catch {
      return undefined;
    }
  }

  private async tryExtractPhoto(photoName: string): Promise<ExtractedMenuData[]> {
    try {
      const photoBuffer = await getPlacePhoto(photoName);
      return [await extractMenuFromImages([photoBuffer], "image/jpeg")];
    } catch {
      // A single bad/unavailable photo shouldn't fail the whole import.
      return [];
    }
  }
}
