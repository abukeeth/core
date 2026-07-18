import { escapeHtml } from "../html-escape";
import { computeCtaLabel } from "../../cta";
import type { HeaderSettings, ThemeCatalogEntry } from "../../types";
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

/**
 * Storefront serving-base detection. The same static release is served two
 * ways: at the root of the real `<slug>.<PLATFORM_DOMAIN>` subdomain, and —
 * while SITE_WILDCARD_DNS_ACTIVE is still false — under the `/store/<slug>`
 * fallback path on the platform's own domain (public-render.routes.ts). This
 * returns the `/store/<slug>` base when a pathname is being served that way,
 * or "" for the subdomain/root case.
 */
export function resolveStoreBasePath(pathname: string): string {
  const match = pathname.match(/^\/store\/[^/]+/);
  return match ? match[0] : "";
}

/**
 * Storefront production fix — internal page links (`href="/menu"`, the brand
 * logo's `href="/"`, featured-category cards' `href="/menu#..."`, footer nav,
 * etc.) are root-relative. That is correct on the real subdomain, but wrong
 * under the `/store/<slug>` fallback base, where "/menu" leaves the site and
 * 404s. This tiny, deterministic inline script prefixes root-relative
 * internal page links with the `/store/<slug>` base when — and only when —
 * the page is actually served under it (a no-op on the subdomain, where the
 * base is empty). Infrastructure paths (`/assets`, `/api`, `/preview`, an
 * already-prefixed `/store`) and absolute/protocol-relative/fragment/tel/
 * mailto links are left untouched. Runs immediately (placed at end of
 * <body>, so every link is already parsed) — before any click can happen.
 */
export function renderInternalLinkBaseScript(): string {
  return `<script>
(function () {
  var m = location.pathname.match(/^\\/store\\/[^\\/]+/);
  var base = m ? m[0] : "";
  if (!base) return;
  var skip = /^\\/(assets|api|preview|store)(\\/|$)/;
  var links = document.querySelectorAll('a[href^="/"]');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (!href || href.charAt(1) === '/' || skip.test(href)) continue;
    links[i].setAttribute('href', base + href);
  }
})();
</script>`;
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

interface HeaderParts {
  brandHtml: string;
  navLinks: { href: string; label: string }[];
  searchHtml: string;
  cartHtml: string;
  accountHtml: string;
  orderHtml: string;
  showSearch: boolean;
}

function buildHeaderParts(ctx: RenderContext, header: HeaderSettings | undefined): HeaderParts {
  const logoUrl = ctx.assets.logoUrl;
  const layout = header?.headerLayout ?? "standard";
  const showSearch = header?.showSearch ?? false;
  const showCart = header?.showCart ?? true;
  const showAccount = header?.showAccount ?? false;
  const showOrderButton = header?.showOrderButton ?? true;

  const brandHtml = logoUrl
    ? `<a href="/" style="display:flex;align-items:center;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(ctx.definition.restaurantName)}" style="height:40px;width:auto;" /></a>`
    : `<a href="/" style="font-family:var(--font-display);font-weight:700;font-size:var(--step-1);text-decoration:none;color:inherit;">${escapeHtml(ctx.definition.restaurantName)}</a>`;

  const navLinks =
    layout === "minimal"
      ? []
      : ctx.definition.pages.map((page) => ({ href: page.slug, label: NAV_LABELS[page.slug] ?? page.slug }));

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

  return { brandHtml, navLinks, searchHtml, cartHtml, accountHtml, orderHtml, showSearch };
}

function navLinksHtml(links: { href: string; label: string }[], linkStyle: string): string {
  return links.map((link) => `<a href="${escapeHtml(link.href)}" style="${linkStyle}">${escapeHtml(link.label)}</a>`).join("\n");
}

/** Pre-existing behavior, byte-for-byte unchanged — every theme without an explicit chrome variant (all 9 original catalog entries) renders exactly as before this task. */
function renderStandardChrome(ctx: RenderContext, header: HeaderSettings | undefined, parts: HeaderParts): string {
  const logoPosition = header?.logoPosition ?? "left";
  const layout = header?.headerLayout ?? "standard";
  const sticky = header?.stickyHeader ?? false;

  const links = navLinksHtml(parts.navLinks, "text-decoration:none;color:inherit;");
  const actions = [parts.searchHtml, parts.accountHtml, parts.cartHtml, parts.orderHtml].filter(Boolean).join("\n  ");

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
  ${parts.brandHtml}
  <nav style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;">${links}</nav>
  <div style="display:flex;gap:0.75rem;align-items:center;">${actions}</div>
</header>
${parts.showSearch ? SEARCH_SCRIPT : ""}`;
}

/** §Website Builder — Modern Editorial: understated serif brand, thin-underline text nav, minimal actions, airy padding. Mobile nav simply wraps (no collapse). */
function renderEditorialChrome(ctx: RenderContext, header: HeaderSettings | undefined, parts: HeaderParts): string {
  const sticky = header?.stickyHeader ?? false;
  const links = navLinksHtml(parts.navLinks, "text-decoration:underline;text-underline-offset:4px;color:inherit;letter-spacing:0.02em;");
  const actions = [parts.searchHtml, parts.accountHtml, parts.cartHtml].filter(Boolean).join("\n  ");
  const orderHtml = parts.orderHtml
    ? parts.orderHtml.replace('class="cta"', 'class="cta" style="background:transparent;color:var(--color-primary-700);border:1px solid var(--color-primary-700);box-shadow:none;"')
    : "";

  return `${renderAnnouncementBar(header)}
<header class="chrome-editorial" style="display:flex;align-items:center;justify-content:space-between;gap:1.5rem;padding:1.5rem 1rem;flex-wrap:wrap;border-bottom:1px solid var(--color-surface-200);${sticky ? "position:sticky;top:0;z-index:20;background:var(--color-surface-50);" : ""}">
  ${parts.brandHtml}
  <nav style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center;">${links}</nav>
  <div style="display:flex;gap:0.75rem;align-items:center;">${actions}${orderHtml}</div>
</header>
${parts.showSearch ? SEARCH_SCRIPT : ""}`;
}

/** §Website Builder — Warm Local: centered logo, nav as a rounded pill bar, big warm CTA. Mobile: the pill bar scrolls horizontally instead of wrapping. */
function renderWarmChrome(ctx: RenderContext, header: HeaderSettings | undefined, parts: HeaderParts): string {
  const links = navLinksHtml(parts.navLinks, "text-decoration:none;color:inherit;padding:0 0.75rem;white-space:nowrap;");
  const actions = [parts.searchHtml, parts.accountHtml, parts.cartHtml, parts.orderHtml].filter(Boolean).join("\n    ");

  return `${renderAnnouncementBar(header)}
<header class="chrome-warm" style="display:flex;flex-direction:column;align-items:center;gap:0.75rem;padding:1.5rem 1rem;text-align:center;">
  ${parts.brandHtml}
  <nav style="display:flex;align-items:center;background:var(--color-surface-100);border-radius:999px;padding:0.5rem 0.5rem;max-width:100%;overflow-x:auto;">${links}</nav>
  <div style="display:flex;gap:0.75rem;align-items:center;">${actions}</div>
</header>
${parts.showSearch ? SEARCH_SCRIPT : ""}`;
}

/** §Website Builder — Bold Commerce: bold colored sticky bar, uppercase spaced nav, high-contrast CTA. Mobile: nav links collapse behind a native <details> disclosure instead of wrapping. */
function renderBoldChrome(ctx: RenderContext, header: HeaderSettings | undefined, parts: HeaderParts): string {
  const links = navLinksHtml(
    parts.navLinks,
    "text-decoration:none;color:inherit;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;font-size:var(--step--1);",
  );
  const actions = [parts.searchHtml, parts.accountHtml, parts.cartHtml].filter(Boolean).join("\n    ");
  const orderHtml = parts.orderHtml
    ? parts.orderHtml.replace('class="cta"', 'class="cta" style="background:#fff;color:var(--color-primary-700);"')
    : "";

  return `${renderAnnouncementBar(header)}
<header class="chrome-bold" style="position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem;background:var(--color-primary-600);color:#fff;flex-wrap:wrap;">
  ${parts.brandHtml}
  <details class="chrome-bold-nav-toggle">
    <summary style="cursor:pointer;list-style:none;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Menu</summary>
    <nav style="display:flex;flex-direction:column;gap:0.75rem;padding:0.75rem 0;">${links}</nav>
  </details>
  <div style="display:flex;gap:0.75rem;align-items:center;">${actions}${orderHtml}</div>
</header>
<style>
.chrome-bold a { color:#fff; }
.chrome-bold-nav-toggle summary::-webkit-details-marker { display:none; }
@media (min-width: 768px) {
  .chrome-bold-nav-toggle { display: contents; }
  .chrome-bold-nav-toggle summary { display: none; }
  .chrome-bold-nav-toggle nav { flex-direction: row !important; gap: 1.5rem !important; padding: 0 !important; }
}
</style>
${parts.showSearch ? SEARCH_SCRIPT : ""}`;
}

/** §22/25 SiteHeader/Nav — present on every page, not a section block. §Website Builder — theme.variants.chrome selects the structural design system (standard/editorial/warm/bold); every pre-existing theme defaults to "standard" (byte-identical to before this task). */
export function renderHeaderNav(ctx: RenderContext, theme?: ThemeCatalogEntry): string {
  const header = ctx.definition.header;
  const parts = buildHeaderParts(ctx, header);
  const chromeStyle = theme?.variants.chrome?.[0] ?? "standard";

  if (chromeStyle === "editorial") return renderEditorialChrome(ctx, header, parts);
  if (chromeStyle === "warm") return renderWarmChrome(ctx, header, parts);
  if (chromeStyle === "bold") return renderBoldChrome(ctx, header, parts);
  return renderStandardChrome(ctx, header, parts);
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
