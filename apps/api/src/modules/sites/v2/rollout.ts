import { getBooleanEnv, getStringEnv } from "../../../config/env";

/**
 * Generation V2 rollout gate (P0).
 *
 * V2 is OFF by default and additionally scoped to an explicit allowlist of
 * restaurant ids, so it can be exercised on test businesses in production with
 * zero effect on anyone else:
 *
 *   GENERATION_V2_ENABLED=true
 *   GENERATION_V2_RESTAURANT_IDS=id1,id2      (empty = no one, even when enabled)
 *
 * Rollback at any moment = flip the flag; V1 is untouched either way.
 * The wider default-on rollout (plan §8 P3) later relaxes the allowlist via
 * GENERATION_V2_RESTAURANT_IDS=* — an explicit, greppable decision.
 */
export function isGenerationV2Enabled(restaurantId: string): boolean {
  if (!getBooleanEnv("GENERATION_V2_ENABLED", false)) return false;
  const raw = getStringEnv("GENERATION_V2_RESTAURANT_IDS", "").trim();
  if (raw === "*") return true;
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(restaurantId);
}
