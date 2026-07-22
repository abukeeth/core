import type { SitePage, ThemeCatalogEntry } from "../types";
import { renderHeaderNav, renderInternalLinkBaseScript, renderMobileActionBar } from "./components/chrome";
import { renderThemeCss } from "./theme-css";
import { renderWebFonts } from "./web-fonts";
import { renderSeoHead } from "./seo-head";
import { renderSections } from "./layout-engine";
import type { RenderContext } from "./render-context";

export interface RenderPageInput {
  ctx: RenderContext;
  page: SitePage;
  theme: ThemeCatalogEntry;
  siteUrl: string;
  noindex?: boolean;
}

/**
 * THE shared renderer (§0, §18: "Preview served by same renderer as
 * production (no drift)"). One pure function: given a definition + page +
 * theme + already-resolved live data, always produces the identical HTML
 * document (§15: "Deterministic: same definition + theme version →
 * identical output"). Called both by the on-demand preview route and by
 * publishSite's static-generation step — neither has its own rendering
 * logic, so they can never diverge.
 */
export function renderPage(input: RenderPageInput): string {
  const { ctx, page, theme, siteUrl, noindex } = input;

  const head = renderSeoHead({
    restaurantName: ctx.definition.restaurantName,
    cuisine: ctx.definition.cuisine,
    siteUrl,
    facts: ctx.definition.facts,
    heroImageUrl: ctx.assets.heroUrl,
    liveMenu: ctx.liveMenu,
    pages: ctx.definition.pages,
    currentPage: page,
    page,
    noindex,
    faviconUrl: ctx.assets.faviconUrl,
  });

  const css = renderThemeCss(theme, ctx.definition.colorSeed, ctx.definition.brandSettings);
  // Actually deliver the theme's typefaces (resolved the same way theme-css
  // does) — without this the storefront falls back to system fonts.
  const headingFont = ctx.definition.brandSettings?.headingFont ?? theme.tokens.typography.display;
  const bodyFont = ctx.definition.brandSettings?.bodyFont ?? theme.tokens.typography.body;
  const webFonts = renderWebFonts(headingFont, bodyFont);
  const headerNav = renderHeaderNav(ctx, theme);
  const sections = renderSections(page.sections, ctx);
  const mobileActionBar = renderMobileActionBar(ctx);

  return `<!DOCTYPE html>
<html lang="en">
<head>
${head}
${webFonts}
${css}
</head>
<body>
${headerNav}
<main>
${sections}
</main>
${mobileActionBar}
${renderInternalLinkBaseScript()}
</body>
</html>`;
}
