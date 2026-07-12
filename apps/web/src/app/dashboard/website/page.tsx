import { PageShell } from "@/components/ui";
import type { DomainEvent, Restaurant, SiteDomain, SiteVersion, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { AiBrandConcepts } from "./studio/ai-brand-concepts";
import { AiSuggestions } from "./studio/ai-suggestions";
import { CurrentWebsiteCard } from "./studio/current-website-card";
import { DomainDashboard } from "./studio/domain/domain-dashboard";
import { DomainHistory } from "./studio/domain/domain-history";
import { PublishingHistory } from "./studio/publishing-history";
import { QuickActions } from "./studio/quick-actions";
import { slugify } from "./studio/slugify";
import { WebsiteAnalytics } from "./studio/website-analytics";
import { WebsiteHealthCard } from "./studio/website-health-card";
import { WebsiteStatusCard } from "./studio/website-status-card";

export default async function WebsiteHubPage() {
  const restaurantResult = await serverFetch<{ restaurant: Restaurant }>("/api/restaurants/me");
  const restaurantName = restaurantResult.ok ? restaurantResult.data.restaurant.name : "your business";

  const siteResult = await serverFetch<{ site: WebsiteSite; url: string; temporaryDomain: string }>("/api/sites/me");
  const site = siteResult.ok ? siteResult.data.site : null;
  const domain = siteResult.ok ? siteResult.data.url : `https://${slugify(restaurantName)}.ordervora.app`;
  const temporaryDomain = siteResult.ok ? siteResult.data.temporaryDomain : domain;

  const [releases, domains, domainEvents] = site
    ? await Promise.all([
        serverFetch<{ releases: SiteVersion[] }>(`/api/sites/${site.id}/releases`).then((r) => (r.ok ? r.data.releases : [])),
        serverFetch<{ domains: SiteDomain[] }>(`/api/sites/${site.id}/domains`).then((r) => (r.ok ? r.data.domains : [])),
        serverFetch<{ events: DomainEvent[] }>(`/api/sites/${site.id}/domain-history`).then((r) => (r.ok ? r.data.events : [])),
      ])
    : [[] as SiteVersion[], [] as SiteDomain[], [] as DomainEvent[]];

  return (
    <PageShell maxWidth="5xl">
      <div className="flex flex-col gap-5">
        <WebsiteStatusCard restaurantName={restaurantName} status={site?.status ?? null} />
        <CurrentWebsiteCard domain={domain} status={site?.status ?? null} />
        <DomainDashboard siteId={site?.id ?? null} siteStatus={site?.status ?? null} temporaryDomain={temporaryDomain} primaryUrl={domain} domains={domains} />
        <WebsiteHealthCard />
        <AiBrandConcepts />
        <QuickActions domain={domain} siteId={site?.id ?? null} alreadyPublished={site?.status === "PUBLISHED"} />
        <PublishingHistory releases={releases} currentVersionId={site?.publishedVersionId ?? null} />
        <DomainHistory events={domainEvents} />
        <AiSuggestions />
        <WebsiteAnalytics />
      </div>
    </PageShell>
  );
}
