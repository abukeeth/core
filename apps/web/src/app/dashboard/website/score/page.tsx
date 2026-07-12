import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";
import type { SiteVersion, WebsiteScore, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { RescoreButton, SuggestionRow } from "./suggestion-actions";

function DimensionBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
        <span>{label}</span>
        <span>{value}/100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-foreground" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default async function ScorePage() {
  const siteResult = await serverFetch<{ site: WebsiteSite }>("/api/sites/me");
  if (!siteResult.ok) notFound();
  const { site } = siteResult.data;

  const versionsResult = await serverFetch<{ versions: SiteVersion[] }>(`/api/sites/${site.id}/versions`);
  const versions = versionsResult.ok ? versionsResult.data.versions : [];
  const draft = versions.find((v) => v.status === "DRAFT");

  if (!draft) {
    return (
      <PageShell maxWidth="2xl">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No active draft yet — select a variation from the{" "}
          <Link href="/dashboard/website/variations" className="underline">
            Variation Picker
          </Link>{" "}
          first.
        </p>
      </PageShell>
    );
  }

  const scoreResult = await serverFetch<{ score: WebsiteScore | null }>(`/api/sites/${site.id}/versions/${draft.id}/score`);
  const score = scoreResult.ok ? scoreResult.data.score : null;

  const rankedSuggestions = score?.suggestions ?? [];

  return (
    <PageShell maxWidth="2xl">
        <div className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-black dark:text-zinc-50">Website Score</h1>
            <RescoreButton siteId={site.id} versionId={draft.id} />
          </div>

          {score ? (
            <>
              <p className="text-2xl font-semibold text-black dark:text-zinc-50">{score.overall}/100</p>
              <div className="flex flex-col gap-3">
                <DimensionBar label="SEO" value={score.seo} />
                <DimensionBar label="Performance" value={score.performance} />
                <DimensionBar label="Accessibility" value={score.accessibility} />
                <DimensionBar label="Brand Consistency" value={score.brandConsistency} />
                <DimensionBar label="Conversion" value={score.conversion} />
              </div>

              <h2 className="mt-2 text-sm font-semibold text-black dark:text-zinc-50">
                Suggested improvements ({rankedSuggestions.length})
              </h2>
              {rankedSuggestions.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">No issues found.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {rankedSuggestions.map((suggestion) => (
                    <SuggestionRow key={suggestion.id} siteId={site.id} versionId={draft.id} suggestion={suggestion} />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No score yet — click Re-score to run one.</p>
          )}
        </div>
    </PageShell>
  );
}
