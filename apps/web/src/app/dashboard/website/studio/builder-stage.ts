import type { GenerationJob, SiteVersion, WebsiteSite } from "@/lib/api";

export const BUILDER_STAGES = [
  "MENU_READY",
  "WEBSITE_GENERATING",
  "DESIGNS_READY",
  "DESIGN_SELECTED",
  "PREVIEW_READY",
  "PREVIEW_APPROVED",
  "PUBLISHING",
  "LIVE",
] as const;

export type BuilderStage = (typeof BUILDER_STAGES)[number];

export const BUILDER_STAGE_LABELS: Record<BuilderStage, string> = {
  MENU_READY: "Menu ready",
  WEBSITE_GENERATING: "Generating designs",
  DESIGNS_READY: "Designs ready",
  DESIGN_SELECTED: "Design selected",
  PREVIEW_READY: "Preview ready",
  PREVIEW_APPROVED: "Preview approved",
  PUBLISHING: "Publishing",
  LIVE: "Live",
};

/**
 * Every value here is read directly off backend rows already fetched by the
 * hub page — there is no timer or client-guessed progress. DESIGN_SELECTED
 * and PREVIEW_READY become true at the same instant (a DRAFT SiteVersion
 * exists — the studio always has a preview available on demand), so both
 * are marked complete together the moment a draft exists; the "current"
 * pointer then rests on whichever real gate is still open.
 */
export function computeBuilderStage(
  site: WebsiteSite | null,
  job: GenerationJob | null,
  variations: SiteVersion[],
  hasDraft: boolean,
): BuilderStage {
  if (site?.status === "PUBLISHED") return "LIVE";
  if (site?.status === "PUBLISHING" || site?.status === "REPUBLISHING") return "PUBLISHING";
  if (site?.previewApprovedAt) return "PREVIEW_APPROVED";
  if (hasDraft) return "PREVIEW_READY";
  if ((job && job.status === "COMPLETED") || variations.length > 0) return "DESIGNS_READY";
  if (job && (job.status === "PENDING" || job.status === "RUNNING")) return "WEBSITE_GENERATING";
  return "MENU_READY";
}
