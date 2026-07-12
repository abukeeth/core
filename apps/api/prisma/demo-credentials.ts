/**
 * Shared demo-only constant, split out of seed-beta.ts so importing it
 * (from scripts/seed-beta-orders.ts, scripts/demo-assign-driver.ts) never
 * re-runs seed-beta.ts's top-level main() as a side effect.
 */
export const DEMO_PASSWORD = "OrdervoraDemo!23";
