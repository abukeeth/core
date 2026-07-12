import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

const SOCIAL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
  website: "Website",
};

/**
 * Sprint 20A Task 5 extends the footer with real owner-controlled content
 * (description, social/legal links, hours, an inline newsletter form,
 * custom copyright text). "Powered by OrderVora" always shows — there is
 * no plan/entitlement/billing system in this codebase yet to gate it on
 * (see PROJECT_MEMORY), so a toggle to hide it would be an editable
 * control with nothing real behind it; this stays unconditional until a
 * real entitlement system exists.
 */
export function renderFooter(section: SectionBlock, ctx: RenderContext): string {
  const restaurantName = typeof section.props.restaurantName === "string" ? section.props.restaurantName : ctx.definition.restaurantName;
  const footerSettings = ctx.definition.footer;
  const year = new Date().getFullYear();
  const logoUrl = ctx.assets.logoUrl;

  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(restaurantName)}" style="height:32px;width:auto;margin-bottom:0.75rem;" />`
    : "";

  const description = footerSettings?.description ? `<p style="max-width:40ch;margin:0 auto 1rem;">${escapeHtml(footerSettings.description)}</p>` : "";

  const contactHtml =
    footerSettings?.showContactInfo && (ctx.definition.facts.address || ctx.definition.facts.phone)
      ? `<p style="margin:0 0 0.5rem;">
      ${ctx.definition.facts.address ? escapeHtml(ctx.definition.facts.address) : ""}
      ${ctx.definition.facts.phone ? ` &middot; <a href="tel:${escapeHtml(ctx.definition.facts.phone.replace(/[^\d+]/g, ""))}" style="color:inherit;">${escapeHtml(ctx.definition.facts.phone)}</a>` : ""}
    </p>`
      : "";

  const hoursHtml = footerSettings?.showHours && ctx.definition.facts.hours ? `<p style="margin:0 0 0.5rem;">${escapeHtml(ctx.definition.facts.hours)}</p>` : "";

  const socialHtml =
    footerSettings?.socialLinks && footerSettings.socialLinks.length > 0
      ? `<div style="display:flex;gap:1rem;justify-content:center;margin:0.75rem 0;">
      ${footerSettings.socialLinks
        .map(
          (link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit;">${escapeHtml(SOCIAL_LABEL[link.platform] ?? link.platform)}</a>`,
        )
        .join("\n      ")}
    </div>`
      : "";

  const legalHtml =
    footerSettings?.legalLinks && footerSettings.legalLinks.length > 0
      ? `<div style="display:flex;gap:1rem;justify-content:center;margin:0.5rem 0;font-size:var(--step--1);">
      ${footerSettings.legalLinks.map((link) => `<a href="${escapeHtml(link.url)}" style="color:inherit;">${escapeHtml(link.label)}</a>`).join("\n      ")}
    </div>`
      : "";

  const newsletterHtml = footerSettings?.newsletterEnabled
    ? `<form method="post" action="/public/sites/${escapeHtml(ctx.siteId)}/newsletter" data-site-newsletter-form style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin:1rem 0;">
      <label class="sr-only" for="footer-newsletter-email">Email</label>
      <input id="footer-newsletter-email" type="email" name="email" placeholder="you@example.com" required style="border:1px solid var(--color-surface-300);border-radius:var(--radius);padding:0.5rem 0.75rem;min-height:44px;" />
      <input type="text" name="honeypot" style="position:absolute;left:-9999px;" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <button type="submit">Subscribe</button>
    </form>`
    : "";

  const copyrightText = footerSettings?.copyrightText ?? `&copy; ${year} ${escapeHtml(restaurantName)}`;

  return `<footer style="padding:2rem 0;text-align:center;color:var(--color-text-700);border-top:1px solid var(--color-surface-200);">
  ${logoHtml}
  ${description}
  ${contactHtml}
  ${hoursHtml}
  ${socialHtml}
  ${newsletterHtml}
  ${legalHtml}
  <p style="margin:0.75rem 0 0;">${footerSettings?.copyrightText ? escapeHtml(copyrightText) : copyrightText}</p>
  <p style="margin:0.25rem 0 0;font-size:var(--step--1);opacity:0.7;">Powered by OrderVora</p>
</footer>`;
}
