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
    res.status(401).send("Invalid or expired preview link");
    return;
  }

  const site = await prisma.site.findUnique({ where: { id: payload.siteId } });
  if (!site) {
    res.status(404).send("Not found");
    return;
  }

  const variationId = typeof req.query.variation === "string" ? req.query.variation : undefined;
  const slug = typeof req.query.path === "string" ? req.query.path : "/";

  const version = variationId
    ? await prisma.siteVersion.findFirst({ where: { id: variationId, siteId: site.id } })
    : await prisma.siteVersion.findFirst({ where: { siteId: site.id, status: "DRAFT" }, orderBy: { versionNo: "desc" } });

  if (!version) {
    res.status(404).send("No draft or variation to preview yet");
    return;
  }

  const definition = siteDefinitionSchema.parse(version.definition);
  const siteUrl = await resolveSiteUrl(site);
  const html = await renderSitePage({ siteId: site.id, restaurantId: site.restaurantId, definition, siteUrl, noindex: true }, slug);
  if (!html) {
    res.status(404).send("Page not found");
    return;
  }

  sendHtml(res, html, true);
}

previewRouter.get("/:token", handlePreviewRequest);

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

  let site = null as Awaited<ReturnType<typeof prisma.site.findUnique>> | null;

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

  if (site.status === "UNPUBLISHED") {
    res.status(503).set("Content-Type", "text/html; charset=utf-8").send(HOLDING_PAGE);
    return;
  }

  if (!site.publishedVersionId) {
    res.status(404).send("This site hasn't been published yet");
    return;
  }

  const requestPath = req.path === "" ? "/" : req.path;

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
