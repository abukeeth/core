import Link from "next/link";
import { Card } from "@/components/ui";
import type { GenerationJob, SiteVersion } from "@/lib/api";
import { GenerateButton } from "../generate-button";
import { GenerationProgress } from "../variations/generation-progress";

/**
 * Replaces the previous "AI Brand Concepts" section, which was an entirely
 * simulated demo (concept-data.ts's own comment: "simulated, not real AI") —
 * a fixed local array of pre-written concepts, a fake 4-stage progress
 * timer with no backend call, and a wireframe phone illustration with no
 * real restaurant data. This component only ever shows genuine data from
 * the real site-generation system (use-restaurant-builder.ts's backing
 * API, the same GenerationJob/SiteVersion rows variations/page.tsx reads),
 * reusing the exact same real components rather than a second
 * implementation — no visible state here is fabricated.
 */
export function WebsiteDesignStatus({
  siteId,
  job,
  variations,
}: {
  siteId: string | null;
  job: GenerationJob | null;
  variations: SiteVersion[];
}) {
  if (!siteId) {
    return (
      <Card>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">WEBSITE DESIGN</p>
        <h2 className="mt-1 text-lg font-bold text-[#171512]">Generate your website with AI</h2>
        <p className="mt-2 text-sm leading-6 text-[#756B5D]">
          Builds real Home, Menu, About, Contact, and Gallery pages from your actual menu, branding, and photos —
          three design directions to compare and choose from.
        </p>
        <div className="mt-4">
          <GenerateButton mode="create" />
        </div>
      </Card>
    );
  }

  if (job && (job.status === "PENDING" || job.status === "RUNNING")) {
    return <GenerationProgress siteId={siteId} initialJob={job} />;
  }

  if (variations.length === 0) {
    return (
      <Card>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">WEBSITE DESIGN</p>
        <h2 className="mt-1 text-lg font-bold text-[#171512]">No designs generated yet</h2>
        <p className="mt-2 text-sm leading-6 text-[#756B5D]">Generate three real designs built from your actual menu and branding.</p>
        <div className="mt-4">
          <GenerateButton mode="create" />
        </div>
      </Card>
    );
  }

  const bestScore = Math.max(0, ...variations.map((v) => v.scores?.[0]?.overall ?? 0));

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">WEBSITE DESIGN</p>
          <h2 className="mt-1 text-lg font-bold text-[#171512]">
            {variations.length} real design{variations.length === 1 ? "" : "s"} ready to compare
          </h2>
        </div>
        {bestScore > 0 && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">Best score {bestScore}/100</span>
        )}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#756B5D]">
        Each one is your real restaurant name, menu, prices, and photos — rendered by the same engine that powers your live site.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/dashboard/website/variations" className="min-h-11 rounded-2xl bg-[#171512] px-5 py-2 text-sm font-bold text-white">
          Compare designs
        </Link>
        <GenerateButton siteId={siteId} mode="regenerate" />
      </div>
    </Card>
  );
}
