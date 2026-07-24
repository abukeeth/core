import { resolveHeroImage } from "../asset-resolver";
import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";

/**
 * Bespoke heroes for the flagship vertical themes. These are deliberately NOT
 * the shared hero variants recolored — each has its own structure, media
 * strategy, and rhythm:
 *   • deli-brooklyn — an editorial magazine split: oversized serif headline and
 *     a framed food photograph side by side, with a warm cream ground.
 *   • vape-lab — a cinematic full-bleed photograph under a dark scrim and neon
 *     key-lights, headline bottom-left, product-launch style.
 * Returns null for any other theme so renderHero falls through to its own logic.
 */
export function renderFlagshipHero(
  ctx: RenderContext,
  content: { headline: string; subhead: string; ctaLabel: string; ctaLink: string },
): string | null {
  const key = ctx.definition.themeKey;
  if (key === "deli-brooklyn") return renderDeliHero(ctx, content);
  if (key === "vape-lab") return renderVapeHero(ctx, content);
  return null;
}

function renderDeliHero(ctx: RenderContext, c: { headline: string; subhead: string; ctaLabel: string; ctaLink: string }): string {
  const photo = resolveHeroImage(ctx);
  const menuUrl = `${ctx.orderingBaseUrl}/order/${ctx.restaurantId}`;
  const media = photo
    ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(ctx.definition.restaurantName)}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
    : `<div aria-hidden="true" style="width:100%;height:100%;background:
        radial-gradient(120% 90% at 20% 15%, color-mix(in srgb, var(--color-accent-500) 40%, transparent), transparent 55%),
        radial-gradient(120% 90% at 90% 95%, color-mix(in srgb, var(--color-primary-600) 55%, transparent), transparent 60%),
        linear-gradient(150deg, color-mix(in srgb, var(--color-primary-600) 24%, var(--color-surface-100)), var(--color-surface-100));"></div>`;

  return `<section aria-label="Welcome" style="padding-top:clamp(1rem,3vw,2.5rem);">
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:clamp(1.5rem,4vw,3rem);align-items:center;">
    <div style="display:flex;flex-direction:column;gap:1.15rem;">
      <span style="display:inline-flex;align-items:center;gap:0.5rem;font-size:0.72rem;letter-spacing:0.24em;text-transform:uppercase;color:var(--color-primary-600);font-weight:700;">
        <span style="width:26px;height:1px;background:var(--color-accent-600);"></span>${escapeHtml(ctx.definition.cuisine || "Neighborhood deli")}
      </span>
      <h1 style="margin:0;font-size:var(--step-4);line-height:1.02;letter-spacing:-0.01em;">${escapeHtml(c.headline)}</h1>
      ${c.subhead ? `<p style="margin:0;font-size:var(--step-0);color:var(--color-text-700);max-width:46ch;line-height:1.6;">${escapeHtml(c.subhead)}</p>` : ""}
      <div style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:0.35rem;">
        <a href="${escapeHtml(menuUrl)}" style="background:var(--color-primary-600);color:#fff;text-decoration:none;border-radius:999px;padding:0.85rem 1.9rem;font-weight:700;">${escapeHtml(c.ctaLabel || "Order Now")}</a>
        <a href="/menu" style="border:1px solid var(--color-primary-600);color:var(--color-primary-700,var(--color-primary-600));text-decoration:none;border-radius:999px;padding:0.85rem 1.7rem;font-weight:700;">View the menu</a>
      </div>
    </div>
    <div style="position:relative;aspect-ratio:4/5;border-radius:calc(var(--radius) + 16px);overflow:hidden;box-shadow:var(--shadow);border:1px solid var(--hairline);min-height:280px;">
      ${media}
    </div>
  </div>
</section>`;
}

function renderVapeHero(ctx: RenderContext, c: { headline: string; subhead: string; ctaLabel: string; ctaLink: string }): string {
  const photo = resolveHeroImage(ctx);
  const shopUrl = `${ctx.orderingBaseUrl}/order/${ctx.restaurantId}`;
  const backdrop = photo
    ? `background-image:linear-gradient(180deg, rgba(4,3,10,0.35) 0%, rgba(4,3,10,0.82) 78%, var(--color-surface-50) 100%), url('${escapeHtml(photo)}');background-size:cover;background-position:center;`
    : `background:
        radial-gradient(90% 70% at 78% 12%, color-mix(in srgb, var(--color-primary-500) 42%, transparent), transparent 55%),
        radial-gradient(70% 60% at 12% 90%, color-mix(in srgb, var(--color-accent-500) 30%, transparent), transparent 55%),
        linear-gradient(180deg, #0d0a17 0%, var(--color-surface-50) 100%);`;

  return `<section aria-label="Welcome" style="position:relative;min-height:clamp(480px,78vh,760px);border-radius:var(--radius);overflow:hidden;display:flex;align-items:flex-end;${backdrop}">
    <div style="position:relative;z-index:1;padding:clamp(1.5rem,5vw,3.5rem);max-width:640px;display:flex;flex-direction:column;gap:1.15rem;">
      <span style="font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:var(--color-accent-500);font-weight:600;">${escapeHtml(ctx.definition.restaurantName)}</span>
      <h1 style="margin:0;font-size:var(--step-4);line-height:1;letter-spacing:-0.01em;color:#fff;">${escapeHtml(c.headline)}</h1>
      ${c.subhead ? `<p style="margin:0;font-size:var(--step-0);color:rgba(237,234,247,0.82);max-width:44ch;line-height:1.6;">${escapeHtml(c.subhead)}</p>` : ""}
      <div style="display:flex;flex-wrap:wrap;gap:0.85rem;margin-top:0.35rem;">
        <a href="${escapeHtml(shopUrl)}" style="background:var(--color-primary-600);color:#fff;text-decoration:none;border-radius:var(--button-radius);padding:0.85rem 1.9rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-size:0.82rem;">${escapeHtml(c.ctaLabel || "Shop Now")}</a>
        <a href="/menu" style="border:1px solid color-mix(in srgb, var(--color-accent-500) 60%, transparent);color:var(--color-accent-500);text-decoration:none;border-radius:var(--button-radius);padding:0.85rem 1.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-size:0.82rem;">Explore</a>
      </div>
    </div>
</section>`;
}
