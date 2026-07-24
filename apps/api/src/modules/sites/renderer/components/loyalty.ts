import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/** Sprint 20A Task 5 — real LoyaltyProgram data (ctx.loyaltyProgram, resolved by render-site.ts via loyalty.service.ts's getProgram). Renders nothing if the owner has never enabled loyalty. */
export function renderLoyalty(section: SectionBlock, ctx: RenderContext): string {
  const program = ctx.loyaltyProgram;
  if (!program || !program.isActive) return "";

  const title = typeof section.props.title === "string" ? section.props.title : "Earn Rewards";
  const description = typeof section.props.description === "string" ? section.props.description : "";

  const earnRate = program.pointsPerDollarCents > 0 ? `Earn ${program.pointsPerDollarCents} point${program.pointsPerDollarCents === 1 ? "" : "s"} for every dollar you spend.` : "";
  const redeemRate =
    program.redemptionRateCentsPerPoint > 0
      ? `Redeem points for $${(program.redemptionRateCentsPerPoint / 100).toFixed(2)} off per point.`
      : "";
  const orderUrl = `${ctx.orderingBaseUrl}/order/${ctx.restaurantId}`;

  // Vape flagship — a dark, neon rewards panel. The shared band below uses a
  // light primary-50 tint that would sink light text into an unreadable haze on
  // this theme's near-black ground; this branch owns readable-on-dark styling.
  if (ctx.definition.themeKey === "vape-lab") {
    const lines = [earnRate, redeemRate, description].filter(Boolean);
    return `<section aria-labelledby="loyalty-title" style="text-align:center;">
  <div style="border-radius:var(--radius);padding:clamp(2rem,5vw,3.25rem);background:
      radial-gradient(80% 120% at 20% 0%, color-mix(in srgb, var(--color-primary-500) 34%, transparent), transparent 60%),
      radial-gradient(70% 110% at 90% 100%, color-mix(in srgb, var(--color-accent-500) 26%, transparent), transparent 60%),
      var(--color-surface-100);border:1px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent);">
    <p style="margin:0 0 0.6rem;font-size:0.7rem;letter-spacing:0.3em;text-transform:uppercase;color:var(--color-accent-500);">Rewards</p>
    <h2 id="loyalty-title" style="margin:0 0 0.75rem;color:#fff;">${escapeHtml(title)}</h2>
    ${lines.map((l) => `<p style="margin:0.25rem auto;max-width:52ch;color:rgba(237,234,247,0.82);">${escapeHtml(l)}</p>`).join("\n    ")}
    <a href="${escapeHtml(orderUrl)}" style="display:inline-block;margin-top:1.4rem;background:var(--color-primary-600);color:#fff;text-decoration:none;border-radius:var(--button-radius);padding:0.8rem 1.9rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-size:0.82rem;">Start Earning</a>
  </div>
</section>`;
  }

  return `<section class="loyalty" style="text-align:center;background:var(--color-primary-50);">
  <h2>${escapeHtml(title)}</h2>
  ${description ? `<p>${escapeHtml(description)}</p>` : ""}
  ${earnRate ? `<p>${escapeHtml(earnRate)}</p>` : ""}
  ${redeemRate ? `<p>${escapeHtml(redeemRate)}</p>` : ""}
  <a class="cta" href="${escapeHtml(orderUrl)}">Start Earning</a>
</section>`;
}
