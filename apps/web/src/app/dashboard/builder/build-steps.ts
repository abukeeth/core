/**
 * The build pipeline's narrative, ordered to match REAL backend execution
 * order (GenerationJob.stage's actual sequence, then the client-orchestrated
 * select -> publish -> QR steps) rather than a scripted sequence — every
 * step here corresponds to genuine work happening server-side, not a timer.
 */
export interface BuildCaptionContext {
  restaurantName: string;
  /** Known once a design has been picked (SELECTING onward) — undefined before then. */
  cuisine?: string;
  tagline?: string;
}

export interface BuildStep {
  id: string;
  group: string;
  title: string;
  captions: (ctx: BuildCaptionContext) => string[];
}

export const BUILD_STEPS: BuildStep[] = [
  {
    id: "INGEST",
    group: "Understanding your restaurant",
    title: "Menu Organization",
    captions: (ctx) => [`Reading ${ctx.restaurantName}'s menu and profile…`, "Organizing your categories and items…"],
  },
  {
    id: "BRAND_ANALYSIS",
    group: "Understanding your restaurant",
    title: "Business Analysis & Brand Discovery",
    captions: (ctx) => [
      `Analyzing ${ctx.restaurantName}'s personality…`,
      "Finding your brand colors…",
      ctx.cuisine ? `Understanding your ${ctx.cuisine} cuisine and style…` : "Understanding your cuisine and style…",
    ],
  },
  {
    id: "THEME_SELECTION",
    group: "Designing your website",
    title: "Theme Selection",
    captions: () => ["Matching your brand to the perfect theme…"],
  },
  {
    id: "CONTENT_GENERATION",
    group: "Designing your website",
    title: "Category Optimization",
    captions: (ctx) => [`Writing ${ctx.restaurantName}'s homepage copy…`, "Polishing your menu descriptions…"],
  },
  {
    id: "ASSEMBLY",
    group: "Designing your website",
    title: "Homepage Creation",
    captions: () => ["Assembling three complete designs…"],
  },
  {
    id: "ASSETS",
    group: "Designing your website",
    title: "Image Optimization",
    captions: () => ["Preparing your photos…"],
  },
  {
    id: "SCORING",
    group: "Designing your website",
    title: "Mobile Optimization & Final Polish",
    captions: () => ["Checking mobile readiness…", "Scoring each design…"],
  },
  {
    id: "FINALIZE",
    group: "Designing your website",
    title: "Final Restaurant Review",
    captions: () => ["Wrapping up your three designs…"],
  },
  {
    id: "SELECTING",
    group: "Publishing your business",
    title: "Choosing Your Best Design",
    captions: (ctx) => [
      ctx.tagline ? `Choosing the design that says "${ctx.tagline}"…` : "Picking your best-scoring design…",
    ],
  },
  {
    id: "PUBLISHING",
    group: "Publishing your business",
    title: "Publishing & SEO Generation",
    captions: (ctx) => [`Publishing ${ctx.restaurantName}'s website…`, "Generating your sitemap and SEO tags…"],
  },
  {
    id: "PROVISIONING",
    group: "Publishing your business",
    title: "QR Ordering Creation",
    captions: () => ["Setting up your QR ordering code…"],
  },
];

export function stepIndex(id: string): number {
  return BUILD_STEPS.findIndex((step) => step.id === id);
}

export type StepStatus = "done" | "active" | "upcoming";

export function statusFor(id: string, activeId: string): StepStatus {
  const activeIndex = stepIndex(activeId);
  const thisIndex = stepIndex(id);
  if (activeIndex === -1 || thisIndex === -1) return "upcoming";
  if (thisIndex < activeIndex) return "done";
  if (thisIndex === activeIndex) return "active";
  return "upcoming";
}

/**
 * Relative real-world duration of each stage, used to weight the progress
 * bar so it reflects how long stages actually take (AI content generation
 * and design assembly run long; theme selection and QR provisioning are
 * near-instant) instead of one uniform tick per step.
 */
const STEP_WEIGHTS: Record<string, number> = {
  INGEST: 6,
  BRAND_ANALYSIS: 10,
  THEME_SELECTION: 4,
  CONTENT_GENERATION: 14,
  ASSEMBLY: 12,
  ASSETS: 8,
  SCORING: 8,
  FINALIZE: 4,
  SELECTING: 3,
  PUBLISHING: 6,
  PROVISIONING: 3,
};

const TOTAL_WEIGHT = BUILD_STEPS.reduce((sum, step) => sum + (STEP_WEIGHTS[step.id] ?? 1), 0);

export function overallProgressPercent(activeId: string): number {
  const activeIndex = stepIndex(activeId);
  if (activeIndex === -1) return 0;
  const completedWeight = BUILD_STEPS.slice(0, activeIndex + 1).reduce(
    (sum, step) => sum + (STEP_WEIGHTS[step.id] ?? 1),
    0,
  );
  return Math.round((completedWeight / TOTAL_WEIGHT) * 100);
}

/** The value-pitch checklist shown alongside the timeline during the wait — ticks off as its gating stage completes. */
export interface ValuePitchItem {
  label: string;
  doneAtStepId: string;
}

export const VALUE_PITCH_ITEMS: ValuePitchItem[] = [
  { label: "Website", doneAtStepId: "ASSEMBLY" },
  { label: "Mobile-ready", doneAtStepId: "SCORING" },
  { label: "SEO", doneAtStepId: "PUBLISHING" },
  { label: "QR ordering", doneAtStepId: "PROVISIONING" },
];
