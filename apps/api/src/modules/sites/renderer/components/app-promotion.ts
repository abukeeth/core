import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/** Sprint 20A Task 5 — owner-authored promotional content; this data model has no app-store-metadata source, so the owner supplies their own store links (real, not fabricated) rather than a generated badge. */
export function renderAppPromotion(section: SectionBlock, _ctx: RenderContext): string {
  const headline = typeof section.props.headline === "string" ? section.props.headline : "";
  const description = typeof section.props.description === "string" ? section.props.description : "";
  const iosUrl = typeof section.props.iosUrl === "string" ? section.props.iosUrl : "";
  const androidUrl = typeof section.props.androidUrl === "string" ? section.props.androidUrl : "";

  if (!headline && !iosUrl && !androidUrl) return "";

  const links = [
    iosUrl ? `<a class="cta" href="${escapeHtml(iosUrl)}" target="_blank" rel="noopener noreferrer">Download for iOS</a>` : "",
    androidUrl ? `<a class="cta" href="${escapeHtml(androidUrl)}" target="_blank" rel="noopener noreferrer">Download for Android</a>` : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  return `<section class="app-promotion" style="text-align:center;">
  <h2>${escapeHtml(headline)}</h2>
  ${description ? `<p>${escapeHtml(description)}</p>` : ""}
  <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
    ${links}
  </div>
</section>`;
}
