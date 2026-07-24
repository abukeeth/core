import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

export function renderCtaBanner(section: SectionBlock, ctx: RenderContext): string {
  const label = typeof section.props.label === "string" ? section.props.label : "View Menu";
  // Opens the Ordering Storefront (A), not a dead self-anchor.
  const orderUrl = `${ctx.orderingBaseUrl}/order/${ctx.restaurantId}`;

  return `<section class="cta-banner" style="text-align:center;background:var(--color-primary-50);">
  <a class="cta" href="${escapeHtml(orderUrl)}" id="primary-action">${escapeHtml(label)}</a>
</section>`;
}
