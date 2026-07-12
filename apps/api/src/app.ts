import { randomUUID } from "node:crypto";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import multer from "multer";
import { getEnv, getOptionalEnv, getStringEnv } from "./config/env";
import { errorTracker } from "./lib/error-tracker";
import { fileStorage } from "./lib/file-storage";
import { createLogger, runWithRequestContext } from "./lib/logger";
import { getMetrics, getMetricsContentType, httpMetricsMiddleware } from "./lib/metrics";
import { isObjectStorageConfigured } from "./lib/object-storage-client";
import { prisma } from "./lib/prisma";
import { getWorkerHealthSnapshot } from "./lib/worker-health";
import { authRouter } from "./modules/auth/auth.routes";
import { publicCartRouter } from "./modules/commerce/cart/cart.routes";
import { checkoutRouter } from "./modules/commerce/checkout/checkout.routes";
import { couponsRouter } from "./modules/commerce/coupons/coupons.routes";
import { customerRouter } from "./modules/commerce/customers/index.routes";
import { deliveryRulesRouter } from "./modules/commerce/delivery-rules/delivery-rules.routes";
import { loyaltyOwnerRouter, loyaltyCustomerRouter } from "./modules/commerce/loyalty/loyalty.routes";
import { analyticsRouter } from "./modules/commerce/analytics/analytics.routes";
import { reviewsCustomerRouter, reviewsPublicRouter } from "./modules/commerce/reviews/reviews.routes";
import { fulfillmentRouter } from "./modules/commerce/fulfillment/fulfillment.routes";
import { menuCommerceRouter } from "./modules/commerce/menu-commerce/menu-commerce.routes";
import { publicMenuRouter } from "./modules/commerce/menu-commerce/public-menu.routes";
import { ordersRouter, publicOrdersRouter } from "./modules/commerce/orders/orders.routes";
import { paymentsRouter, paymentWebhookRouter, publicPaymentConfigRouter } from "./modules/commerce/payments/payments.routes";
import { posRouter } from "./modules/commerce/pos/pos.routes";
import { publicTablesRouter, tablesRouter } from "./modules/commerce/qr-ordering/tables.routes";
import { importRouter } from "./modules/imports/import.routes";
import { menuRouter } from "./modules/menu/menu.routes";
import { adminAuditLogRouter } from "./modules/admin/audit-log.routes";
import { adminRestaurantRouter, restaurantRouter } from "./modules/restaurants/restaurant.routes";
import { previewRouter, siteEdgeMiddleware } from "./modules/sites/public-render.routes";
import { publicSiteRouter, siteRouter } from "./modules/sites/site.routes";

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

const logger = createLogger("app");

/**
 * Production Hardening Phase 9 — request-correlation middleware. Mounted
 * first (before helmet/cors/body-parsing), so every request — including
 * ones that fail helmet/CORS checks or never reach a route — gets a
 * request ID. Accepts an inbound `X-Request-Id` (a load balancer or
 * upstream proxy's own correlation ID, if present) rather than always
 * minting a fresh one, so a trace can be followed across service
 * boundaries; generates a fresh UUID otherwise. Propagated via
 * `runWithRequestContext` (lib/logger.ts's `AsyncLocalStorage`), so every
 * log line for the lifetime of this request — including ones from deep
 * inside a service call or a `bestEffort()` failure — is automatically
 * tagged with it, and echoed back on the response for the client's own
 * correlation.
 */
function requestCorrelationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header("X-Request-Id") ?? randomUUID();
  res.setHeader("X-Request-Id", requestId);
  runWithRequestContext({ requestId }, () => next());
}

/**
 * Treats FRONTEND_URL's apex and `www.` hosts as interchangeable, so
 * setting FRONTEND_URL to either `https://ordervora.com` or
 * `https://www.ordervora.com` allows both — Vercel's "redirect apex to
 * www" domain option means real traffic can legitimately arrive from
 * either host, and requiring an exact string match would silently break
 * whichever one isn't configured. Falls back to an exact string compare
 * if FRONTEND_URL isn't a parseable URL (e.g. a bare hostname in a local
 * dev override).
 */
function corsOriginValidator(frontendUrl: string): cors.CorsOptions["origin"] {
  let allowedHost: string;
  try {
    allowedHost = new URL(frontendUrl).hostname.replace(/^www\./, "");
  } catch {
    return frontendUrl;
  }
  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    try {
      callback(null, new URL(origin).hostname.replace(/^www\./, "") === allowedHost);
    } catch {
      callback(null, false);
    }
  };
}

/**
 * Production Hardening Phase 7 — explicit public-asset serving strategy
 * (master spec Phase 7 item 6), one of three mutually exclusive paths
 * depending on configuration:
 *
 * 1. Local disk (OBJECT_STORAGE_BUCKET unset, the pre-Phase-7 default):
 *    unchanged `express.static` serving by basename.
 * 2. Direct-from-CDN (OBJECT_STORAGE_PUBLIC_URL_BASE set): the
 *    *recommended* path once real object storage is configured — nothing
 *    is mounted here at all, since renderer/asset-url.ts already points
 *    callers straight at the CDN/bucket domain, bypassing this API
 *    entirely for asset bytes.
 * 3. Proxied through the API (object storage configured, no public URL
 *    base yet — e.g. a private bucket with no CDN in front): a thin
 *    dynamic route reading the object's bytes via the same `fileStorage`
 *    interface every other caller uses, so this still isn't a second,
 *    storage-backend-specific code path.
 */
function registerAssetsRoute(app: express.Express): void {
  if (!isObjectStorageConfigured()) {
    app.use("/assets", express.static(path.resolve(getStringEnv("IMPORT_UPLOAD_DIR", "uploads"))));
    return;
  }

  if (getOptionalEnv("OBJECT_STORAGE_PUBLIC_URL_BASE")) {
    return;
  }

  app.use("/assets", async (req: Request, res: Response) => {
    const key = decodeURIComponent(req.path.replace(/^\/+/, ""));
    try {
      const buffer = await fileStorage.read(key);
      const contentType = EXTENSION_CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.send(buffer);
    } catch {
      res.status(404).end();
    }
  });
}

export function createApp() {
  const app = express();

  // Mounted first (Production Hardening Phase 9): every request, including
  // one that fails a later check (helmet, CORS, a 404), gets a request ID
  // and a metrics observation.
  app.use(requestCorrelationMiddleware);
  app.use(httpMetricsMiddleware);

  app.use(
    helmet({
      // Published restaurant sites (renderer/render-page.ts) embed an
      // inline <style> block (theme-css.ts) and two inline
      // <script type="application/ld+json"> tags (seo-head.ts) — both are
      // escaped/validated at generation time (html-escape.ts, safeJsonLd),
      // not attacker-controllable raw HTML, but CSP's script-src/style-src
      // apply to inline tags regardless of content type. A nonce-based
      // policy isn't viable here without breaking the renderer's documented
      // "same definition + theme version -> identical output" determinism
      // (publishSite writes static HTML once; a nonce is per-request
      // random), so 'unsafe-inline' is used for both instead of disabling
      // CSP outright — default-src/object-src/frame-ancestors stay strict.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
        },
      },
      // Not needed for this app's same-origin asset-proxy architecture
      // (apps/web rewrites every /api, /assets, /preview call server-side —
      // the browser never makes a cross-origin request to apps/api
      // directly), and risks breaking the dashboard's preview iframe.
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: corsOriginValidator(getEnv().FRONTEND_URL),
      credentials: true,
    }),
  );
  // The `verify` callback stashes the raw request bytes on `req.rawBody`
  // before JSON parsing — payment webhook signature verification (BYOP,
  // one webhook secret per connected PaymentProvider) must hash the exact
  // bytes the provider signed, not a re-serialized `req.body`.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  // No express.urlencoded() here, deliberately: every real client (apps/web)
  // only ever sends application/json, and cookie-based auth (requireAuth
  // reads only req.cookies, no bearer-token/custom-header alternative)
  // plus the cross-site custom domain's SameSite=None cookie (see
  // cookies.ts) means a plain HTML <form> POST is otherwise a live CSRF
  // vector: a form can set Content-Type: application/x-www-form-urlencoded
  // or multipart/form-data (never application/json) and isn't subject to
  // CORS preflight at all, so if a urlencoded body parser were mounted
  // globally, a malicious page's auto-submitting form could populate
  // req.body with attacker-chosen fields on any authenticated route and
  // ride the victim's cookie cross-site. Restricting body parsing to
  // strict application/json closes that path: a bare form can never
  // produce that content type, and a script-driven fetch with it triggers
  // a CORS preflight our origin allowlist rejects for any other site.
  app.use(cookieParser());

  // Serves uploaded images (site assets, import files) — see
  // renderer/asset-url.ts, which decides the actual URL shape returned to
  // callers and must stay in sync with whichever of these three paths is
  // active. Public/unauthenticated by design: these are meant to be
  // embedded in public site pages. Production Hardening Phase 7 made this
  // conditional on object-storage configuration (see
  // docs/runbooks/object-storage.md for the full design rationale):
  registerAssetsRoute(app);

  // Liveness — reports the process is up; does not touch the database.
  // Used by container orchestration to decide whether to restart a stuck
  // instance, not whether to route it traffic (see /ready below).
  // Production Hardening Phase 9 (master spec item 6): also reports each
  // background worker's last-successful-poll timestamp (lib/worker-health.ts),
  // so a wedged outbox worker or stale-offer sweep is externally
  // observable here rather than only discoverable by reading logs after
  // the fact. Deliberately on /health, not /ready: a worker being stuck
  // doesn't mean this instance can't serve HTTP traffic, so it must not
  // affect load-balancer routing decisions the way /ready's DB check does.
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      workers: getWorkerHealthSnapshot(),
    });
  });

  // Prometheus-style scrape target (Production Hardening Phase 9). No
  // auth: consistent with this app's other unauthenticated operational
  // endpoints (/health, /ready) — restricting scrape access, if desired,
  // is a network/ingress-level concern (see docs/runbooks/monitoring-logging.md),
  // not an application-level one, since a scraper is infrastructure, not
  // an end user.
  app.get("/metrics", async (_req: Request, res: Response) => {
    res.setHeader("Content-Type", getMetricsContentType());
    res.send(await getMetrics());
  });

  // Readiness (Production Hardening Phase 4) — verifies live DB
  // connectivity before a load balancer/orchestrator sends traffic to a
  // new instance. Distinct from /health: a process can be alive (healthy)
  // while its database connection is down (not ready) during startup or a
  // transient outage.
  app.get("/ready", async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ready" });
    } catch (err) {
      logger.error({ err }, "Readiness check failed: database is not reachable");
      res.status(503).json({ status: "not ready" });
    }
  });

  // §20 edge routing substitute — resolves Host header to a published site
  // and serves it; falls through (next()) for any hostname that isn't a
  // known site's domain, so /api/*, /public/*, /preview/*, /health, and
  // /assets below are unaffected for the platform's own host.
  app.use(siteEdgeMiddleware);

  app.use("/preview", previewRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/restaurants", restaurantRouter);
  app.use("/api/restaurants", fulfillmentRouter);
  app.use("/api/restaurants", deliveryRulesRouter);
  app.use("/api/restaurants", menuCommerceRouter);
  app.use("/api/restaurants", paymentsRouter);
  app.use("/api/restaurants", posRouter);
  app.use("/api/restaurants", couponsRouter);
  app.use("/api/restaurants", ordersRouter);
  app.use("/api/restaurants", tablesRouter);
  app.use("/api/restaurants", loyaltyOwnerRouter);
  app.use("/api/restaurants", analyticsRouter);
  app.use("/api/admin/restaurants", adminRestaurantRouter);
  app.use("/api/admin", adminAuditLogRouter);
  app.use("/api/menu", menuRouter);
  app.use("/api/imports", importRouter);
  app.use("/api/sites", siteRouter);
  app.use("/public/sites", publicSiteRouter);

  // Commerce & Fulfillment Engine (Sprint 07) — customer-facing, public
  // (guest/customer identity resolved from cookies, not requireAuth).
  app.use("/api/public", publicMenuRouter);
  app.use("/api/public", reviewsPublicRouter);
  app.use("/api/public", publicCartRouter);
  app.use("/api/public", publicPaymentConfigRouter);
  app.use("/api/public", checkoutRouter);
  app.use("/api/public", publicOrdersRouter);
  app.use("/api/public", publicTablesRouter);

  // Customer (end-diner) account auth — separate identity from staff auth.
  app.use("/api/customer", customerRouter);
  app.use("/api/customer", loyaltyCustomerRouter);
  app.use("/api/customer", reviewsCustomerRouter);

  // BYOP webhooks — no requireAuth, signature-verified per-provider instead.
  app.use("/api/webhooks/payments", paymentWebhookRouter);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.message });
      return;
    }
    logger.error({ err }, "Unhandled error reached the top-level Express error handler");
    errorTracker.captureException(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
