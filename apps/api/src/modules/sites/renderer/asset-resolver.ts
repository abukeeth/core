import type { RenderContext } from "./render-context";
import { stockCategoryImage, stockHeroImage } from "./stock-library";

/**
 * Sprint 5 · T3/T4 — Impression Asset Resolver.
 *
 * Resolves imagery for the "impression" surfaces (hero, category) through a
 * fixed, AI-ready priority chain:
 *
 *   1. real approved business image   (owner upload / website / Google) — wins
 *   2. AI-generated atmospheric image (Sprint 5.5 — read from ctx.assets.ai*)
 *   3. curated stock image            (stock-library.ts)
 *   4. premium SVG floor              (applied by the CALLER, per surface)
 *
 * These functions return the resolved URL for tiers 1–3, or `undefined` when
 * none is available — each caller then applies its own SVG floor
 * (heroPlaceholder / fullBleedFallback / insetFallback / ambientPlaceholder), so
 * every surface keeps its most fitting placeholder.
 *
 * The AI tier (2) reads from `ctx.assets.aiHeroUrl` / `ctx.assets.aiCategoryImages`,
 * which the Sprint 5.5 AI atmospheric stage populates upstream. Until then those
 * fields are undefined and the chain falls through unchanged — so Sprint 5 output
 * is byte-identical to today and enabling AI is zero-rework.
 */

function verticalHint(ctx: RenderContext): string | undefined {
  return ctx.definition.businessType || ctx.definition.cuisine || undefined;
}

/** Hero background (cinematic / full-bleed variants): real → AI → stock. */
export function resolveHeroImage(ctx: RenderContext): string | undefined {
  return (
    ctx.assets.heroBackgroundUrl ??
    ctx.assets.heroUrl ??
    ctx.assets.aiHeroUrl ??
    stockHeroImage(verticalHint(ctx))
  );
}

/**
 * Hero inset (text-forward variants that prefer the foreground photo): real → AI
 * → stock. Preserves the historical `heroUrl`-first precedence for inset heroes
 * (it does not fall back to the full-bleed background image).
 */
export function resolveHeroInsetImage(ctx: RenderContext): string | undefined {
  return ctx.assets.heroUrl ?? ctx.assets.aiHeroUrl ?? stockHeroImage(verticalHint(ctx));
}

/** Category tile / banner image: real → AI → stock. */
export function resolveCategoryImage(
  categoryName: string,
  realUrl: string | undefined,
  ctx: RenderContext,
): string | undefined {
  return realUrl ?? ctx.assets.aiCategoryImages?.[categoryName] ?? stockCategoryImage(verticalHint(ctx), categoryName);
}
