import type { AICompletionRequest } from "../../../lib/ai";
import type { IngestData, SiteDefinition } from "../types";
import { generateCreativeBriefs } from "./briefs/brief-generator";
import { validateDiversity, type DiversityReport } from "./briefs/diversity-validator";
import { compileDefinition } from "./compile/compile-definition";
import type { BusinessUnderstanding, CreativeBrief, GeneratedAssetPlan } from "./contracts";
import { proceduralCopy, writeStorefrontCopy, type StorefrontCopy } from "./content/copy-writer";
import { generatePlannedAssets, planAssets, type GenerateAssetsDeps, type StorefrontAssets } from "./imagery/asset-planner";
import { planStorefront } from "./planning/storefront-planner";
import { buildBusinessUnderstanding, type BuildUnderstandingInput } from "./understanding/build-understanding";

/**
 * Generation V2 — the full pipeline (P2):
 *
 *   Business source → BusinessUnderstanding → three ORIGINAL CreativeBriefs
 *   → three independent StorefrontPlans → independent copy & imagery →
 *   three SiteDefinitions (schemaVersion 2, theme-free).
 *
 * Pure orchestration over injected dependencies; no persistence here (the
 * service wiring that stores SiteVersions is the P3 rollout step).
 */

export interface GenerateV2Input extends BuildUnderstandingInput {
  ingest: IngestData;
  /** Varies per run (e.g. batchId) so regeneration explores fresh directions. */
  seed?: string;
}

export interface GenerateV2Deps {
  complete?: (request: AICompletionRequest) => Promise<string>;
  assets?: GenerateAssetsDeps;
}

export interface GenerateV2Result {
  understanding: BusinessUnderstanding;
  briefs: CreativeBrief[];
  briefOrigin: "ai" | "procedural";
  diversity: DiversityReport;
  assetPlan: GeneratedAssetPlan;
  storefronts: { briefId: string; copy: StorefrontCopy; assets: StorefrontAssets; definition: SiteDefinition }[];
}

export async function generateV2(input: GenerateV2Input, deps: GenerateV2Deps = {}): Promise<GenerateV2Result> {
  const understanding = buildBusinessUnderstanding(input);

  const { briefs, origin } = await generateCreativeBriefs(understanding, { complete: deps.complete, seed: input.seed });
  const diversity = validateDiversity(briefs);

  // Independent copy per storefront — one write per brief, in its own voice.
  const copies = await Promise.all(
    briefs.map((brief) => (deps.complete ? writeStorefrontCopy(understanding, brief, { complete: deps.complete }) : Promise.resolve(proceduralCopy(understanding, brief)))),
  );

  // Independent impression imagery per storefront (brief hash in every cache
  // key) + shared business-truth product photos (one per real menu item).
  const assetPlan = planAssets(
    understanding,
    briefs,
    input.ingest.menu.map((item) => ({ name: item.name, description: item.description, categoryName: item.categoryName })),
  );
  const assetResults = await generatePlannedAssets(understanding, assetPlan, input.ingest.restaurantId, deps.assets);

  const storefronts = briefs.map((brief, i) => {
    const plan = planStorefront({ understanding, brief, copy: copies[i], ingest: input.ingest });
    const definition = compileDefinition({
      understanding,
      plan,
      copy: copies[i],
      assets: assetResults[i],
      personality: brief.brandPersonality,
    });
    return { briefId: brief.id, copy: copies[i], assets: assetResults[i], definition };
  });

  return { understanding, briefs, briefOrigin: origin, diversity, assetPlan, storefronts };
}
