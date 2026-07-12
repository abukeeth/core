import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";
import type { SiteAsset, SiteVersion, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { CustomizationStudio } from "./studio/customization-studio";

export default async function EditorPage() {
  const siteResult = await serverFetch<{ site: WebsiteSite; url: string }>("/api/sites/me");
  if (!siteResult.ok) notFound();
  const { site, url } = siteResult.data;

  const [versionsResult, assetsResult] = await Promise.all([
    serverFetch<{ versions: SiteVersion[] }>(`/api/sites/${site.id}/versions`),
    serverFetch<{ assets: SiteAsset[] }>(`/api/sites/${site.id}/assets`),
  ]);
  const versions = versionsResult.ok ? versionsResult.data.versions : [];
  const draft = versions.find((v) => v.status === "DRAFT");
  const published = versions.find((v) => v.id === site.publishedVersionId);
  const assets = assetsResult.ok ? assetsResult.data.assets : [];

  if (!draft) {
    return (
      <PageShell maxWidth="2xl">
        <p className="text-sm text-[#756B5D]">
          No active draft yet — select a brand concept from the{" "}
          <Link href="/dashboard/website" className="font-semibold text-[#A9681F] underline">
            AI Website Studio
          </Link>{" "}
          first.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="6xl">
      <header className="pt-2 lg:pt-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">CUSTOMIZE</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Website Customization Studio</h1>
        <p className="mt-1 text-sm text-[#756B5D]">Edit your storefront and see the real live preview update as you go.</p>
      </header>

      <CustomizationStudio
        siteId={site.id}
        siteStatus={site.status}
        liveUrl={url}
        lastPublishedAt={published?.publishedAt ?? null}
        initialDefinition={draft.definition}
        initialAssets={assets}
      />
    </PageShell>
  );
}
