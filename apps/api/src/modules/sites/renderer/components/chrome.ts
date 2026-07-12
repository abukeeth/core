import { escapeHtml } from "../html-escape";
import { computeCtaLabel } from "../../cta";
import type { HeaderSettings } from "../../types";
import type { RenderContext } from "../render-context";

const NAV_LABELS: Record<string, string> = {
  "/": "Home",
  "/menu": "Menu",
  "/about": "About",
  "/contact": "Contact",
  "/gallery": "Gallery",
};

/**
 * The real, live customer ordering flow (cart/checkout) lives in the main
 * OrderVora web app, not in this static storefront renderer — a tenant's
 * own domain can't itself run the commerce engine. Header "Cart"/"Order"
 * buttons link out to it by absolute URL so they're real navigations, not
 * dead anchors; "Account" likewise. Search has no equivalent real backend
 * (no site-search endpoint exists), so it's implemented as a genuine
 * client-side filter over the menu page's own already-rendered items
 * (see SEARCH_SCRIPT below) rather than linking anywhere fake.
 */
function orderingUrl(ctx: RenderContext, path = ""): string {
  return `${ctx.orderingBaseUrl}/order/${ctx.restaurantId}${path}`;
}

const SEARCH_SCRIPT = `<script>
(function () {
  var input = document.getElementById('site-search-input');
  if (!input) return;
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    document.querySelectorAll('.menu-category li[data-item-name]').forEach(function (li) {
      var name = (li.getAttribute('data-item-name') || '').toLowerCase();
      li.style.display = !q || name.indexOf(q) !== -1 ? '' : 'none';
    });
  });
})();
</script>`;

function renderAnnouncementBar(header: HeaderSettings | undefined): string {
  const bar = header?.announcementBar;
  if (!bar?.enabled || !bar.text) return "";
  const content = bar.link ? `<a href="${escapeHtml(bar.link)}" style="color:inherit;">${escapeHtml(bar.text)}</a>` : escapeHtml(bar.text);
  return `<div class="announcement-bar" style="background:var(--color-primary-600);color:#fff;text-align:center;padding:0.5rem 1rem;font-size:var(--step--1);">${content}</div>`;
}

/** §22/25 SiteHeader/Nav — present on every page, not a section block. Sprint 20A Task 5 extends it with real, owner-controlled layout/action settings. */
export function renderHeaderNav(ctx: RenderContext): string {
  const header = ctx.definition.header;
  const logoUrl = ctx.assets.logoUrl;
  const logoPosition = header?.logoPosition ?? "left";
  const layout = header?.headerLayout ?? "standard";
  const sticky = header?.stickyHeader ?? false;
  const showSearch = header?.showSearch ?? false;
  const showCart = header?.showCart ?? true;
  const showAccount = header?.showAccount ?? false;
  const showOrderButton = header?.showOrderButton ?? true;

  const brandHtml = logoUrl
    ? `<a href="/" style="display:flex;align-items:center;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(ctx.definition.restaurantName)}" style="height:40px;width:auto;" /></a>`
    : `<a href="/" style="font-family:var(--font-display);font-weight:700;font-size:var(--step-1);text-decoration:none;color:inherit;">${escapeHtml(ctx.definition.restaurantName)}</a>`;

  const links =
    layout === "minimal"
      ? ""
      : ctx.definition.pages
          .map((page) => `<a href="${escapeHtml(page.slug)}" style="text-decoration:none;color:inherit;">${escapeHtml(NAV_LABELS[page.slug] ?? page.slug)}</a>`)
          .join("\n");

  const searchHtml = showSearch
    ? `<input id="site-search-input" type="search" placeholder="Search menu…" aria-label="Search menu" style="border:1px solid var(--color-surface-300);border-radius:var(--radius);padding:0.4rem 0.75rem;min-height:44px;" />`
    : "";
  const cartHtml = showCart
    ? `<a href="${escapeHtml(orderingUrl(ctx, "/cart"))}" aria-label="Cart" style="text-decoration:none;color:inherit;">Cart</a>`
    : "";
  const accountHtml = showAccount ? `<a href="${escapeHtml(ctx.orderingBaseUrl)}/account" style="text-decoration:none;color:inherit;">Account</a>` : "";
  const orderHtml = showOrderButton
    ? `<a class="cta" href="${escapeHtml(orderingUrl(ctx))}">${escapeHtml(computeCtaLabel(ctx.definition.facts, ctx.definition.styleFamily))}</a>`
    : "";

  const actions = [searchHtml, accountHtml, cartHtml, orderHtml].filter(Boolean).join("\n  ");

  const headerStyle = [
    "display:flex",
    "align-items:center",
    "gap:1rem",
    "padding:1rem",
    "flex-wrap:wrap",
    layout === "centered" ? "flex-direction:column;text-align:center;" : "justify-content:space-between;",
    sticky ? "position:sticky;top:0;z-index:20;background:var(--color-surface-50);" : "",
    logoPosition === "center" && layout !== "centered" ? "justify-content:center;" : "",
  ].join(";");

  return `${renderAnnouncementBar(header)}
<header style="${headerStyle}">
  ${brandHtml}
  <nav style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;">${links}</nav>
  <div style="display:flex;gap:0.75rem;align-items:center;">${actions}</div>
</header>
${showSearch ? SEARCH_SCRIPT : ""}`;
}

/**
 * §16 Mobile-First Design — sticky bottom action bar: Call / Directions /
 * Order-or-Menu, present on every page below 768px (theme-css.ts hides it
 * at desktop widths via a media query).
 */
export function renderMobileActionBar(ctx: RenderContext): string {
  const { facts } = ctx.definition;
  const items: string[] = [];

  if (facts.phone) {
    items.push(`<a href="tel:${escapeHtml(facts.phone.replace(/[^\d+]/g, ""))}" class="cta">Call</a>`);
  }
  if (facts.address) {
    items.push(
      `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(facts.address)}" class="cta" target="_blank" rel="noopener noreferrer">Directions</a>`,
    );
  }
  items.push(`<a href="#primary-action" class="cta">${escapeHtml(computeCtaLabel(facts, ctx.definition.styleFamily))}</a>`);

  return `<div class="mobile-action-bar">${items.join("\n")}</div>`;
}
