import { createLogger } from "../../../lib/logger";
import type { IngestData } from "../types";
import { generateCreativeBriefs, type GenerateBriefsDeps } from "./briefs/brief-generator";
import { validateDiversity, type DiversityReport } from "./briefs/diversity-validator";
import { buildBusinessUnderstanding, type BuildUnderstandingInput } from "./understanding/build-understanding";
import type { BusinessUnderstanding, CreativeBrief } from "./contracts";

/**
 * Generation V2 — shadow mode (P1, plan §8 phase 1).
 *
 * Runs understanding → briefs → diversity for a V2-scoped business ALONGSIDE
 * V1 (which keeps serving the customer untouched), and emits the full result
 * as structured logs for inspection. Never throws: any failure is logged and
 * swallowed so shadow work can never break a real generation.
 */

export interface ShadowResult {
  understanding: BusinessUnderstanding;
  briefs: CreativeBrief[];
  origin: "ai" | "procedural";
  diversity: DiversityReport;
}

const logger = createLogger("generation-v2-shadow");

export async function runV2Shadow(
  input: BuildUnderstandingInput & { seed?: string },
  deps: GenerateBriefsDeps = {},
): Promise<ShadowResult | undefined> {
  try {
    const understanding = buildBusinessUnderstanding(input);
    const { briefs, origin, attempts } = await generateCreativeBriefs(understanding, { ...deps, seed: deps.seed ?? input.seed });
    const diversity = validateDiversity(briefs);
    logger.info(
      {
        business: understanding.identity.name,
        vertical: understanding.identity.resolvedVertical,
        origin,
        attempts,
        diversityPass: diversity.pass,
        briefs: briefs.map((b) => ({
          id: b.id,
          centralIdea: b.centralIdea,
          display: b.typography.display,
          ground: b.colorLogic.ground,
          hero: b.heroConcept.composition,
          layout: b.productPresentation.layout,
          sections: b.structure.home,
        })),
      },
      "V2 shadow generation complete (inspection only — V1 served the customer)",
    );
    return { understanding, briefs, origin, diversity };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "V2 shadow generation failed (V1 unaffected)");
    return undefined;
  }
}

export function shadowSeedFrom(ingest: IngestData, batchId: string): string {
  return `${ingest.restaurantId}::${batchId}`;
}
