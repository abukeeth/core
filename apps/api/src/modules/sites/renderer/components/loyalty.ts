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

  return `<section class="loyalty" style="text-align:center;background:var(--color-primary-50);">
  <h2>${escapeHtml(title)}</h2>
  ${description ? `<p>${escapeHtml(description)}</p>` : ""}
  ${earnRate ? `<p>${escapeHtml(earnRate)}</p>` : ""}
  ${redeemRate ? `<p>${escapeHtml(redeemRate)}</p>` : ""}
  <a class="cta" href="${escapeHtml(ctx.orderingBaseUrl)}/order/${escapeHtml(ctx.restaurantId)}">Start Earning</a>
</section>`;
}
