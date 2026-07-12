import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";
import type { SiteDomain, SiteVersion, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { DomainForm, DomainRow } from "./domain-form";
import { PublishButton, RollbackButton, UnpublishButton } from "./publish-actions";

export default async function PublishPage() {
  const siteResult = await serverFetch<{ site: WebsiteSite }>("/api/sites/me");
  if (!siteResult.ok) notFound();
  const { site } = siteResult.data;

  const [versionsResult, releasesResult, domainsResult] = await Promise.all([
    serverFetch<{ versions: SiteVersion[] }>(`/api/sites/${site.id}/versions`),
    serverFetch<{ releases: SiteVersion[] }>(`/api/sites/${site.id}/releases`),
    serverFetch<{ domains: SiteDomain[] }>(`/api/sites/${site.id}/domains`),
  ]);

  const versions = versionsResult.ok ? versionsResult.data.versions : [];
  const draft = versions.find((v) => v.status === "DRAFT");
  const releases = releasesResult.ok ? releasesResult.data.releases : [];
  const domains = domainsResult.ok ? domainsResult.data.domains : [];

  return (
    <PageShell maxWidth="2xl">
        <header className="pt-2 lg:pt-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">GO LIVE</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Publish &amp; domains</h1>
        </header>

        <div className="flex flex-col gap-4 rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Status</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${site.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {site.status}
            </span>
          </div>
          {!draft ? (
            <p className="text-sm text-[#756B5D]">
              No active draft to publish —{" "}
              <Link href="/dashboard/website/variations" className="font-semibold text-[#A9681F] underline">
                choose a variation
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <PublishButton siteId={site.id} />
              {site.status === "PUBLISHED" && <UnpublishButton siteId={site.id} />}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
          <h2 className="text-lg font-bold">Releases</h2>
          {releases.length === 0 ? (
            <p className="text-sm text-[#756B5D]">No releases yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {releases.map((release) => (
                <li key={release.id} className="flex flex-col gap-2 rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    v{release.versionNo} — {release.publishedAt ? new Date(release.publishedAt).toLocaleString() : "unknown"}
                    {release.id === site.publishedVersionId && <span className="ml-2 text-xs font-bold text-emerald-700">(live)</span>}
                  </span>
                  {release.id !== site.publishedVersionId && <RollbackButton siteId={site.id} versionId={release.id} />}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
          <h2 className="text-lg font-bold">Domains</h2>
          <DomainForm siteId={site.id} />
          {domains.length > 0 && (
            <ul className="flex flex-col gap-2">
              {domains.map((domain) => (
                <DomainRow key={domain.id} siteId={site.id} domain={domain} />
              ))}
            </ul>
          )}
        </div>
    </PageShell>
  );
}
