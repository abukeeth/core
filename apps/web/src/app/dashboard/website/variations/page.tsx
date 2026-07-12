import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";
import type { GenerationJob, SiteVersion, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { GenerationProgress } from "./generation-progress";
import { SelectButton } from "./select-button";

const FAMILY_LABEL: Record<string, string> = { LUXURY: "Luxury", MODERN: "Modern", MINIMAL: "Minimal" };

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

  const bestScore = Math.max(0, ...variations.map((v) => v.scores?.[0]?.overall ?? 0));

  return (
    <PageShell maxWidth="5xl">
        <header className="pt-2 lg:pt-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">WEBSITE VARIATIONS</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Choose your website</h1>
        </header>

        {job && (job.status === "PENDING" || job.status === "RUNNING" || job.status === "FAILED") && (
          <GenerationProgress siteId={site.id} initialJob={job} />
        )}

        {variations.length > 0 && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {variations.map((variation) => {
              const score = variation.scores?.[0];
              const isBest = score !== undefined && score.overall === bestScore && bestScore > 0;
              const definition = variation.definition;
              return (
                <div
                  key={variation.id}
                  className="flex flex-col gap-3 rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-bold">
                      {FAMILY_LABEL[variation.styleFamily ?? ""] ?? variation.styleFamily}
                    </h2>
                    {isBest && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        Best match
                      </span>
                    )}
                  </div>

                  <p className="text-sm italic text-[#756B5D]">&ldquo;{definition.tagline}&rdquo;</p>

                  {score && (
                    <div className="flex flex-col gap-1 text-xs text-[#756B5D]">
                      <p className="text-sm font-bold text-[#171512]">Score: {score.overall}/100</p>
                      <p>
                        SEO {score.seo} · Perf {score.performance} · A11y {score.accessibility} · Brand {score.brandConsistency} · Conv{" "}
                        {score.conversion}
                      </p>
                    </div>
                  )}

                  {definition.designRationale && definition.designRationale.length > 0 && (
                    <p className="text-xs text-[#8A7D6C]">
                      Why this design: {definition.designRationale.join("; ")}
                    </p>
                  )}

                  <div className="mt-auto flex flex-col gap-2">
                    <Link
                      href={`/dashboard/website/variations/${variation.id}`}
                      className="min-h-11 rounded-2xl border border-[#E7DDCF] bg-white px-4 py-2 text-center text-sm font-bold text-[#171512]"
                    >
                      Open full preview
                    </Link>
                    <SelectButton siteId={site.id} versionId={variation.id} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {variations.length === 0 && !job && (
          <p className="rounded-2xl border border-[#E7DDCF] bg-white px-4 py-3 text-sm text-[#756B5D]">No variations yet — generate a website from the Website hub.</p>
        )}
    </PageShell>
  );
}
