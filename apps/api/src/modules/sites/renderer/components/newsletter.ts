import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/**
 * Sprint 20A Task 5 — a real signup capture, not a decorative form: submits
 * to the public, unauthenticated newsletter endpoint for this site (see
 * newsletter.controller.ts), spam-protected the same way contact.ts's form
 * is (honeypot field + server-side rate limiting).
 */
export function renderNewsletter(section: SectionBlock, ctx: RenderContext): string {
  const title = typeof section.props.title === "string" ? section.props.title : "Stay in the loop";
  const description = typeof section.props.description === "string" ? section.props.description : "Get updates on new menu items and offers.";

  return `<section class="newsletter" style="text-align:center;background:var(--color-surface-100);">
  <h2>${escapeHtml(title)}</h2>
  <p>${escapeHtml(description)}</p>
  <form method="post" action="/public/sites/${escapeHtml(ctx.siteId)}/newsletter" data-site-newsletter-form style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">
    <label class="sr-only" for="newsletter-email">Email</label>
    <input id="newsletter-email" type="email" name="email" placeholder="you@example.com" required style="border:1px solid var(--color-surface-300);border-radius:var(--radius);padding:0.6rem 1rem;min-height:44px;min-width:220px;" />
    <input type="text" name="honeypot" style="position:absolute;left:-9999px;" tabindex="-1" autocomplete="off" aria-hidden="true" />
    <button type="submit">Subscribe</button>
  </form>
</section>`;
}
