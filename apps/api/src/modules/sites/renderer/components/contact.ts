import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

export function renderContactInfo(section: SectionBlock, ctx: RenderContext): string {
  const address = typeof section.props.address === "string" ? section.props.address : ctx.definition.facts.address;
  const phone = typeof section.props.phone === "string" ? section.props.phone : ctx.definition.facts.phone;

  return `<section class="contact-info">
  <h2>Contact</h2>
  ${address ? `<p>${escapeHtml(address)}</p>` : ""}
  ${phone ? `<p><a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}">${escapeHtml(phone)}</a></p>` : ""}
</section>`;
}

/**
 * §7 — spam-protected with a honeypot field (invisible to real users via
 * CSS, mirrors the server-side check in contact.service.ts) plus the
 * server's own rate limiting. Submits to the public, unauthenticated
 * contact endpoint for this site.
 */
export function renderContactForm(_section: SectionBlock, ctx: RenderContext): string {
  return `<section class="contact-form">
  <h2>Send us a message</h2>
  <form method="post" action="/public/sites/${escapeHtml(ctx.siteId)}/contact" data-site-contact-form>
    <label>Name<br /><input type="text" name="name" required /></label><br />
    <label>Email<br /><input type="email" name="email" required /></label><br />
    <label>Message<br /><textarea name="message" required></textarea></label><br />
    <input type="text" name="honeypot" style="position:absolute;left:-9999px;" tabindex="-1" autocomplete="off" aria-hidden="true" />
    <button type="submit">Send</button>
  </form>
</section>`;
}
