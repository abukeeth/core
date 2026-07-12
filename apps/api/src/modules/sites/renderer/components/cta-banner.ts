import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

export function renderCtaBanner(section: SectionBlock, _ctx: RenderContext): string {
  const label = typeof section.props.label === "string" ? section.props.label : "View Menu";

  return `<section class="cta-banner" style="text-align:center;background:var(--color-primary-50);">
  <a class="cta" href="#primary-action" id="primary-action">${escapeHtml(label)}</a>
</section>`;
}
