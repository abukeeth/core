import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";
import { StorefrontShowcase, StorefrontShowcaseSection } from "@/app/dashboard/builder/storefront-showcase";
import type { GenerationJob, SiteVersion, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { GenerationProgress } from "./generation-progress";
import { SelectButton } from "./select-button";

/**
 * The storefront hub — the same full-height scroll-through Storefront Showcase
 * as onboarding: each generated storefront opens as a complete website (real
 * render, hero-first) with one "Use This Storefront" action. No cards, names,
 * descriptions, or design metadata; the best-scoring storefront is simply first.
 */
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

  // Best storefront leads; the rest follow. Stable order so the hub matches
  // the onboarding review — one storefront selection experience.
  const ordered = [...variations].sort(
    (a, b) => (b.scores?.[0]?.overall ?? 0) - (a.scores?.[0]?.overall ?? 0) || a.id.localeCompare(b.id),
  );

  if (ordered.length > 0) {
    return (
      <StorefrontShowcase>
        {ordered.map((variation, i) => (
          <StorefrontShowcaseSection
            key={variation.id}
            siteId={site.id}
            variationId={variation.id}
            name={`${variation.definition.restaurantName} — storefront ${i + 1}`}
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
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Your storefront</h1>
      </header>

      {job && (job.status === "PENDING" || job.status === "RUNNING" || job.status === "FAILED") && (
        <GenerationProgress siteId={site.id} initialJob={job} />
      )}

      {variations.length === 0 && !job && (
        <p className="mt-6 rounded-2xl border border-[#E7DDCF] bg-white px-4 py-3 text-sm text-[#756B5D]">
          No storefronts yet — generate one from the Website hub.
        </p>
      )}
    </PageShell>
  );
}
