import type { ReactNode } from "react";
import type { StorefrontConcept } from "@/lib/storefront-concepts";
import { DevicePreview } from "../website/variations/[id]/device-preview";
import type { ConceptPalette } from "./use-restaurant-builder";

/**
 * A generated storefront's brand identity at a glance — palette swatches + the
 * business tagline. Presentation only; safe in server or client trees.
 */
export function BrandIdentityStrip({ palette, tagline }: { palette: ConceptPalette | null; tagline: string | null }) {
  const swatches = palette
    ? ([palette.background, palette.primary, palette.accent, palette.text].filter(Boolean) as string[])
    : [];
  if (swatches.length === 0 && !tagline) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      {swatches.length > 0 && (
        <div className="flex items-center gap-1.5" aria-label="Brand colors">
          {swatches.map((color, i) => (
            <span key={`${color}-${i}`} className="h-5 w-5 rounded-full border border-black/10" style={{ background: color }} />
          ))}
        </div>
      )}
      {tagline && <p className="text-center text-sm italic text-[#756B5D]">&ldquo;{tagline}&rdquo;</p>}
    </div>
  );
}

/**
 * One complete storefront concept, presented as a finished business site — a
 * real rendered preview (never a schematic/placeholder), a business-oriented
 * concept name + description, and, when it's the hero, the brand identity strip.
 * The internal theme/style family is never shown. The caller supplies the CTA
 * node so this stays usable in both the onboarding (client) and hub (server)
 * trees without duplicating the selection experience.
 */
export function StorefrontConceptCard({
  siteId,
  variationId,
  concept,
  palette,
  tagline,
  isRecommended,
  dominant,
  action,
}: {
  siteId: string;
  variationId: string;
  concept: StorefrontConcept;
  palette: ConceptPalette | null;
  tagline: string | null;
  isRecommended: boolean;
  dominant: boolean;
  action: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-3xl border bg-white p-4 sm:p-5 ${
        dominant
          ? "border-[#B97824] shadow-[0_18px_50px_rgba(48,39,27,0.10)]"
          : "border-[#E7DDCF] shadow-[0_12px_36px_rgba(48,39,27,0.05)]"
      }`}
    >
      {isRecommended && (
        <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">Recommended for you</p>
      )}
      <div className="overflow-hidden rounded-2xl">
        <DevicePreview
          siteId={siteId}
          variationId={variationId}
          hideDeviceSwitcher={!dominant}
          frameHeightClassName={dominant ? "h-[440px] sm:h-[620px]" : "h-[240px]"}
        />
      </div>
      <div className="text-center">
        <h2 className={dominant ? "text-2xl font-bold sm:text-3xl" : "text-lg font-bold"}>{concept.name}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-[#756B5D]">{concept.description}</p>
      </div>
      {dominant && <BrandIdentityStrip palette={palette} tagline={tagline} />}
      {action}
    </section>
  );
}
