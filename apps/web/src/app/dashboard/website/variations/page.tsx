import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";
import { StorefrontPicker, StorefrontPickerOption } from "@/app/dashboard/builder/storefront-picker";
import type { GenerationJob, SiteVersion, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { GenerationProgress } from "./generation-progress";
import { SelectButton } from "./select-button";

/**
 * The storefront hub — the same "Choose your favorite storefront" picker as
 * onboarding: three phone-framed complete storefronts (real renders), each
 * with its generated personality words and one action. No cards, no theme
 * vocabulary, no design metadata.
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

  const ordered = [...variations].sort(
    (a, b) => (b.scores?.[0]?.overall ?? 0) - (a.scores?.[0]?.overall ?? 0) || a.id.localeCompare(b.id),
  );

  if (ordered.length > 0) {
    return (
      <main className="min-h-[100svh] w-full bg-[#161310] text-[#F5EFE3]">
        <StorefrontPicker>
          {ordered.map((variation, index) => (
            <StorefrontPickerOption
              key={variation.id}
              index={index}
              siteId={site.id}
              variationId={variation.id}
              businessName={variation.definition.restaurantName}
              personality={variation.definition.displayPersonality ?? null}
              action={<SelectButton siteId={site.id} versionId={variation.id} label="Choose this design →" />}
            />
          ))}
        </StorefrontPicker>
      </main>
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
