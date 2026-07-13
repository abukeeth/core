import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { getStringEnv } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { releaseStorage } from "../../lib/release-storage";
import { verifyPreviewToken } from "./preview-token";
import { renderSitePage } from "./renderer/render-site";
import { resolveSiteUrl } from "./site.service";
import { siteDefinitionSchema } from "./types";

const PLATFORM_DOMAIN = getStringEnv("SITE_PLATFORM_DOMAIN", "sites.ordervora.example");

function sendHtml(res: Response, html: string, noindex: boolean): void {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "no-store");
  if (noindex) res.set("X-Robots-Tag", "noindex, nofollow");
  res.send(html);
}

/**
 * A previous version of this route returned bare plain-text bodies
 * ("Not found", "Invalid or expired preview link") for every failure —
 * harmless for a real browser tab, but the dashboard's DevicePreview
 * iframe (device-preview.tsx) had no way to distinguish "the preview
 * failed" from real, if minimal, page content, so it just displayed the
 * raw text inside the phone frame. Emitting real (same-origin, so
 * readable from the parent frame) HTML with a stable `data-` marker lets
 * DevicePreview detect this specific case on load and swap in a proper
 * dashboard error state instead — see that component's `handleIframeLoad`.
 */
function sendPreviewError(res: Response, status: number, message: string, code: string): void {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Preview unavailable</title></head>
<body data-ordervora-preview-error="${code}"><p>${message}</p></body></html>`;
  res.status(status).set("Content-Type", "text/html; charset=utf-8").set("Cache-Control", "no-store").send(html);
}

const HOLDING_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Site unavailable</title></head>
<body><h1>This website is temporarily unavailable.</h1></body></html>`;

/**
 * §18 Preview System — signed/expiring/site-scoped token; always renders
 * on demand from the latest draft (or a specific `?variation=vid`), never
 * from a static file, per "Preview always renders latest draft version."
 * Uses the exact same renderSitePage() the production path reads its
 * precomputed output from — "same renderer, no drift" (§18).
 */
export const previewRouter = Router();

export async function handlePreviewRequest(req: Request, res: Response): Promise<void> {
  let payload;
  try {
    payload = verifyPreviewToken(String(req.params.token));
  } catch {
    sendPreviewError(res, 401, "This preview link has expired.", "expired-token");
    return;
  }

  const site = await prisma.site.findUnique({ where: { id: payload.siteId } });
  if (!site) {
    sendPreviewError(res, 404, "This website could not be found.", "site-not-found");
    return;
  }

  const variationId = typeof req.query.variation === "string" ? req.query.variation : undefined;
  const slug = typeof req.query.path === "string" ? req.query.path : "/";

  const version = variationId
    ? await prisma.siteVersion.findFirst({ where: { id: variationId, siteId: site.id } })
    : await prisma.siteVersion.findFirst({ where: { siteId: site.id, status: "DRAFT" }, orderBy: { versionNo: "desc" } });

  if (!version) {
    sendPreviewError(res, 404, "There's no draft or design to preview yet.", "no-version");
    return;
  }

  const definition = siteDefinitionSchema.parse(version.definition);
  const siteUrl = await resolveSiteUrl(site);
  const html = await renderSitePage({ siteId: site.id, restaurantId: site.restaurantId, definition, siteUrl, noindex: true }, slug);
  if (!html) {
    sendPreviewError(res, 404, "That page doesn't exist on this website.", "page-not-found");
    return;
  }

  sendHtml(res, html, true);
}

previewRouter.get("/:token", handlePreviewRequest);

type ResolvedSite = NonNullable<Awaited<ReturnType<typeof prisma.site.findUnique>>>;

/**
 * The actual "serve this site's published release at this path" logic —
 * shared by every way a request can resolve to a site (hostname today,
 * slug-in-path for the /store fallback below, and whatever else section M
 * adds later). One implementation means the wildcard-subdomain path and
 * the /store/<slug> fallback path can never silently diverge in behavior.
 */
async function serveSiteRelease(site: ResolvedSite, requestPath: string, res: Response): Promise<void> {
  if (site.status === "UNPUBLISHED") {
    res.status(503).set("Content-Type", "text/html; charset=utf-8").send(HOLDING_PAGE);
    return;
  }

  if (!site.publishedVersionId) {
    res.status(404).send("This site hasn't been published yet");
    return;
  }

  if (requestPath === "/sitemap.xml" || requestPath === "/robots.txt" || requestPath === "/og-image.svg") {
    const filename = requestPath.slice(1);
    const content = await releaseStorage.readAsset(site.id, site.publishedVersionId, filename);
    if (!content) {
      res.status(404).send("Not found");
      return;
    }
    const contentType =
      filename === "sitemap.xml" ? "application/xml" : filename === "robots.txt" ? "text/plain" : "image/svg+xml";
    res.set("Content-Type", `${contentType}; charset=utf-8`).set("Cache-Control", "public, max-age=300").send(content);
    return;
  }

  const html = await releaseStorage.readPage(site.id, site.publishedVersionId, requestPath);
  if (!html) {
    res.status(404).send("Page not found");
    return;
  }

  res.set("Content-Type", "text/html; charset=utf-8").set("Cache-Control", "public, max-age=300").send(html);
}

/**
 * §20 Domain Architecture — "Edge routing: Host header → domains table
 * lookup (cached) → site release." This environment has no real edge/CDN,
 * so the API itself doubles as that edge: this middleware resolves the
 * request's Host header to a Site (via the platform subdomain pattern or
 * the Domain table for a verified custom domain) and serves that site's
 * pre-rendered static release. If the hostname doesn't resolve to any
 * site, it calls next() so /api, /public, /preview, and /health are
 * unaffected — this only intercepts requests for an actual site's domain.
 */
export async function siteEdgeMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const hostname = req.hostname;

  let site: ResolvedSite | null = null;

  if (hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
    const slug = hostname.slice(0, -(PLATFORM_DOMAIN.length + 1));
    site = await prisma.site.findUnique({ where: { slug } });
  } else {
    const domain = await prisma.domain.findFirst({ where: { hostname, verificationStatus: "VERIFIED" } });
    if (domain) {
      site = await prisma.site.findUnique({ where: { id: domain.siteId } });
    }
  }

  if (!site) {
    next();
    return;
  }

  const requestPath = req.path === "" ? "/" : req.path;
  await serveSiteRelease(site, requestPath, res);
}

/**
 * The pre-wildcard-DNS fallback (§M): identical serving behavior to
 * siteEdgeMiddleware above, keyed by a slug path segment instead of the
 * Host header — so `https://ordervora-web.vercel.app/store/<slug>` (proxied
 * here by apps/web's rewrites()) works today without *.ordervora.com's
 * wildcard DNS being active yet, and behaves byte-for-byte like the real
 * subdomain will once it is. Unknown slug -> 404 (there's no "fall through
 * to somewhere else" concept for a path-based route the way there is for
 * an unrecognized hostname).
 */
export async function storeRouteHandler(req: Request, res: Response): Promise<void> {
  const slug = String(req.params.slug ?? "");
  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) {
    res.status(404).send("Not found");
    return;
  }

  // Express 5's named wildcard (`*splat`) captures the remaining path
  // segments as a string array, e.g. /store/tete/gallery/photo1 ->
  // ["gallery", "photo1"] — never a single string, so this must be
  // joined, not cast.
  const splat = req.params.splat;
  const rest = Array.isArray(splat) ? splat.join("/") : "";
  const requestPath = rest ? `/${rest}` : "/";
  await serveSiteRelease(site, requestPath, res);
}

export const storeRouter = Router();
storeRouter.get("/:slug", storeRouteHandler);
storeRouter.get("/:slug/*splat", storeRouteHandler);
