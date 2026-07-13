import { PageShell } from "@/components/ui";
import type { DomainEvent, GenerationJob, Restaurant, SiteDomain, SiteVersion, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { AiSuggestions } from "./studio/ai-suggestions";
import { BuilderStageStepper } from "./studio/builder-stage-stepper";
import { computeBuilderStage } from "./studio/builder-stage";
import { CurrentWebsiteCard } from "./studio/current-website-card";
import { DomainDashboard } from "./studio/domain/domain-dashboard";
import { DomainHistory } from "./studio/domain/domain-history";
import { PublishingHistory } from "./studio/publishing-history";
import { QuickActions } from "./studio/quick-actions";
import { slugify } from "./studio/slugify";
import { WebsiteAnalytics } from "./studio/website-analytics";
import { WebsiteDesignStatus } from "./studio/website-design-status";
import { WebsiteHealthCard } from "./studio/website-health-card";
import { WebsiteStatusCard } from "./studio/website-status-card";
import { fallbackStorefrontUrl } from "@/lib/site-url";

export default async function WebsiteHubPage() {
  const restaurantResult = await serverFetch<{ restaurant: Restaurant }>("/api/restaurants/me");
  const restaurantName = restaurantResult.ok ? restaurantResult.data.restaurant.name : "your business";

  const siteResult = await serverFetch<{ site: WebsiteSite; url: string; temporaryDomain: string }>("/api/sites/me");
  const site = siteResult.ok ? siteResult.data.site : null;
  // Only reached before a Site row exists at all (no real slug to link to
  // yet) — an illustrative preview of the URL shape, not a real link.
  const domain = siteResult.ok ? siteResult.data.url : fallbackStorefrontUrl(slugify(restaurantName));
  const temporaryDomain = siteResult.ok ? siteResult.data.temporaryDomain : domain;

  const [releases, domains, domainEvents, job, variations, versions] = site
    ? await Promise.all([
        serverFetch<{ releases: SiteVersion[] }>(`/api/sites/${site.id}/releases`).then((r) => (r.ok ? r.data.releases : [])),
        serverFetch<{ domains: SiteDomain[] }>(`/api/sites/${site.id}/domains`).then((r) => (r.ok ? r.data.domains : [])),
        serverFetch<{ events: DomainEvent[] }>(`/api/sites/${site.id}/domain-history`).then((r) => (r.ok ? r.data.events : [])),
        serverFetch<{ job: GenerationJob | null }>(`/api/sites/${site.id}/generation`).then((r) => (r.ok ? r.data.job : null)),
        serverFetch<{ variations: SiteVersion[] }>(`/api/sites/${site.id}/variations`).then((r) => (r.ok ? r.data.variations : [])),
        serverFetch<{ versions: SiteVersion[] }>(`/api/sites/${site.id}/versions`).then((r) => (r.ok ? r.data.versions : [])),
      ])
    : [
        [] as SiteVersion[],
        [] as SiteDomain[],
        [] as DomainEvent[],
        null as GenerationJob | null,
        [] as SiteVersion[],
        [] as SiteVersion[],
      ];

  const hasDraft = versions.some((v) => v.status === "DRAFT");
  const builderStage = computeBuilderStage(site, job, variations, hasDraft);

  return (
    <PageShell maxWidth="5xl">
      <div className="flex flex-col gap-5">
        <WebsiteStatusCard restaurantName={restaurantName} status={site?.status ?? null} />
        <BuilderStageStepper stage={builderStage} />
        <CurrentWebsiteCard domain={domain} status={site?.status ?? null} />
        <DomainDashboard siteId={site?.id ?? null} siteStatus={site?.status ?? null} temporaryDomain={temporaryDomain} primaryUrl={domain} domains={domains} />
        <WebsiteHealthCard />
        <WebsiteDesignStatus siteId={site?.id ?? null} job={job} variations={variations} />
        <QuickActions domain={domain} siteId={site?.id ?? null} alreadyPublished={site?.status === "PUBLISHED"} />
        <PublishingHistory siteId={site?.id ?? null} releases={releases} currentVersionId={site?.publishedVersionId ?? null} />
        <DomainHistory events={domainEvents} />
        <AiSuggestions />
        <WebsiteAnalytics />
      </div>
    </PageShell>
  );
}
