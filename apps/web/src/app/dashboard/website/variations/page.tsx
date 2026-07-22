import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";
import { StorefrontConceptCard } from "@/app/dashboard/builder/storefront-concept-card";
import { StorefrontShowcase, StorefrontShowcaseSection } from "@/app/dashboard/builder/storefront-showcase";
import type { ConceptPalette } from "@/app/dashboard/builder/use-restaurant-builder";
import type { GenerationJob, SiteVersion, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { storefrontConcept } from "@/lib/storefront-concepts";
import { GenerationProgress } from "./generation-progress";
import { SelectButton } from "./select-button";

const SHOWCASE_ENABLED = process.env.NEXT_PUBLIC_STOREFRONT_SHOWCASE === "true";

function paletteOf(definition: SiteVersion["definition"]): ConceptPalette | null {
  const b = definition.brandSettings;
  return b ? { primary: b.primaryColor, accent: b.accentColor, background: b.backgroundColor, text: b.textColor } : null;
}

export default async function VariationsPage() {
  const siteResult = await serverFetch<{ site: WebsiteSite }>("/api/sites/me");
  if (!siteResult.ok) {
    notFound();
  }
  const { site } = siteResult.data;

  const jobResult = await serverFetch<{ job: GenerationJob | null }>(`/api/sites/${site.id}/generation`);
  const job = jobResult.ok ? jobResult.data.job : null;

  const variationsResult = await serverFetch<{ variations: SiteVersion[] }>(`/api/sites/${site.id}/variations`);
  const variations = variationsResult.ok ? variationsResult.data.variations : [];

  // Recommended (highest score) leads; the rest follow. Stable order so the
  // hub matches the onboarding review — one storefront selection experience.
  const ordered = [...variations].sort(
    (a, b) => (b.scores?.[0]?.overall ?? 0) - (a.scores?.[0]?.overall ?? 0) || a.id.localeCompare(b.id),
  );
  const recommendedId = ordered[0]?.id ?? null;
  const [dominant, ...alternatives] = ordered;

  // Storefront Showcase: same full-height scroll-through experience as onboarding.
  if (SHOWCASE_ENABLED && ordered.length > 0) {
    return (
      <StorefrontShowcase>
        {ordered.map((variation, i) => (
          <StorefrontShowcaseSection
            key={variation.id}
            siteId={site.id}
            variationId={variation.id}
            name={storefrontConcept(variation.definition.restaurantName, i).name}
            isRecommended={variation.id === recommendedId}
            action={<SelectButton siteId={site.id} versionId={variation.id} label="Use This Storefront" />}
          />
        ))}
      </StorefrontShowcase>
    );
  }

  return (
    <PageShell maxWidth="3xl">
      <header className="pt-2 lg:pt-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">YOUR STOREFRONTS</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Choose your storefront</h1>
      </header>

      {job && (job.status === "PENDING" || job.status === "RUNNING" || job.status === "FAILED") && (
        <GenerationProgress siteId={site.id} initialJob={job} />
      )}

      {dominant && (
        <div className="mt-6">
          <StorefrontConceptCard
            siteId={site.id}
            variationId={dominant.id}
            concept={storefrontConcept(dominant.definition.restaurantName, 0)}
            palette={paletteOf(dominant.definition)}
            tagline={dominant.definition.tagline}
            isRecommended={dominant.id === recommendedId}
            dominant
            action={
              <div className="flex flex-col items-center gap-2">
                <div className="w-full max-w-sm">
                  <SelectButton siteId={site.id} versionId={dominant.id} label="Use This Storefront" />
                </div>
                <Link href={`/dashboard/website/variations/${dominant.id}`} className="text-sm font-bold text-[#9A6A2F] underline">
                  Open full preview
                </Link>
              </div>
            }
          />
        </div>
      )}

      {alternatives.length > 0 && (
        <section className="mt-8">
          <h2 className="text-center text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">Other storefronts we designed for you</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {alternatives.map((variation, i) => (
              <StorefrontConceptCard
                key={variation.id}
                siteId={site.id}
                variationId={variation.id}
                concept={storefrontConcept(variation.definition.restaurantName, i + 1)}
                palette={paletteOf(variation.definition)}
                tagline={variation.definition.tagline}
                isRecommended={variation.id === recommendedId}
                dominant={false}
                action={<SelectButton siteId={site.id} versionId={variation.id} />}
              />
            ))}
          </div>
        </section>
      )}

      {variations.length === 0 && !job && (
        <p className="mt-6 rounded-2xl border border-[#E7DDCF] bg-white px-4 py-3 text-sm text-[#756B5D]">
          No storefronts yet — generate one from the Website hub.
        </p>
      )}
    </PageShell>
  );
}
