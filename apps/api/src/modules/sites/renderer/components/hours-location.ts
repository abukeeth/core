import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/**
 * Combines Hours & Location card with a map embed (§4, §7 MapEmbed) — a
 * plain Google Maps search-query link, which needs no API key and works
 * for any address, rather than an embedded iframe (which would need a
 * Maps API key not available in this environment).
 */
export function renderHoursLocation(section: SectionBlock, ctx: RenderContext): string {
  const address = typeof section.props.address === "string" ? section.props.address : ctx.definition.facts.address;
  const phone = typeof section.props.phone === "string" ? section.props.phone : ctx.definition.facts.phone;
  const hours = ctx.definition.facts.hours;

  if (!address && !phone) return "";

  const mapLink = address
    ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}" target="_blank" rel="noopener noreferrer">Get directions</a>`
    : "";

  return `<section class="hours-location">
  <h2>Hours &amp; Location</h2>
  ${address ? `<p>${escapeHtml(address)}</p>` : ""}
  ${phone ? `<p><a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}">${escapeHtml(phone)}</a></p>` : ""}
  ${hours ? `<p>${escapeHtml(hours)}</p>` : ""}
  ${mapLink}
</section>`;
}
