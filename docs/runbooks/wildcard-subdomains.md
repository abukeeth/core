# Activating real per-restaurant subdomains (`<slug>.ordervora.com`)

Prepared alongside the storefront-preview-rebuild task (branch `claude/storefront-preview-rebuild`). This doc is the activation checklist for turning on real wildcard subdomains — the code side is already built and shipped behind a flag; nothing here is required for the app to keep working today.

## Current state vs. target state

| | Today (before this doc is followed) | After activation |
|---|---|---|
| Customer-facing storefront URL for a site with no custom domain | `https://ordervora.com/store/<slug>` (or `https://<FRONTEND_URL>/store/<slug>` in non-production environments) | `https://<slug>.ordervora.com` |
| Driven by | `apps/api/src/modules/sites/site.service.ts`'s `temporaryStorefrontUrl()` | Same function — only the env vars below change |
| `SITE_WILDCARD_DNS_ACTIVE` | unset / `"false"` | `"true"` |

`ordervora.com` and `www.ordervora.com` are already attached to the `ordervora-web` Vercel project and show "Valid Configuration" as of this doc — that only covers those two exact hostnames, not the wildcard.

## Why this is safe to leave off

`resolveSiteUrl()` / `temporaryStorefrontUrl()` is the single place every screen (setup completion, Website Studio, QR code, Copy Link, Share, Open Website, Test Order) reads the storefront URL from. Flipping `SITE_WILDCARD_DNS_ACTIVE` is the only step required on the app side — no frontend redeploy, no data migration, no other code change. Until the DNS/cert steps below are done, flipping the flag would make every temporary storefront URL 404, so **do not set it to `"true"` until every step below is verified working**.

## Step 1 — Vercel: add the wildcard domain

1. Vercel dashboard → the `ordervora-web` project → Settings → Domains.
2. Add `*.ordervora.com`.
3. Vercel will show a CNAME record to create (typically `cname.vercel-dns.com`, but use the exact value Vercel's dashboard displays for your project — it can differ).

## Step 2 — DNS: wildcard CNAME record

At your DNS provider for `ordervora.com`:

| Type | Host | Value |
|---|---|---|
| CNAME | `*` | (the exact target Vercel's dashboard showed in Step 1) |

Notes:
- A wildcard CNAME at the zone apex's `*` host covers every `<anything>.ordervora.com` that doesn't already have a more specific record (e.g. `www` keeps using its own existing record).
- Do not remove or change the existing `ordervora.com` / `www.ordervora.com` records — those are unrelated to this wildcard.
- DNS propagation can take up to 24-48 hours depending on your provider's TTL; Vercel's dashboard will show the domain's status move from "Pending" to "Valid Configuration" once it resolves and the TLS certificate issues.

## Step 3 — Verify before flipping the flag

Do all of the following against a **real, already-published** restaurant's slug before touching `SITE_WILDCARD_DNS_ACTIVE`:

1. `dig <slug>.ordervora.com` resolves to Vercel's edge.
2. `https://<slug>.ordervora.com` loads in a browser with a valid TLS certificate (no cert warning) — confirms Vercel's wildcard cert issued successfully, which can lag behind DNS propagation.
3. The request reaches `apps/api`'s `siteEdgeMiddleware` (`apps/api/src/modules/sites/public-render.routes.ts`) — check `apps/api` logs for the request, or confirm the real storefront HTML (not a Vercel 404) is returned.
4. Reserved names still route correctly and are never treated as a real restaurant: `www.ordervora.com`, `app.ordervora.com`, `admin.ordervora.com`, `api.ordervora.com`, `dashboard.ordervora.com`, `support.ordervora.com`, `billing.ordervora.com`, `status.ordervora.com` (the exact list in `RESERVED_SUBDOMAINS`, `apps/api/src/modules/sites/site.service.ts`) — none of these can ever be assigned as a restaurant's slug (enforced by `findAvailableSlug`), but confirm none of them accidentally 200s as if it were a storefront.

## Step 4 — Flip the flag

On `apps/api` (Render):

1. Set `SITE_PLATFORM_DOMAIN=ordervora.com` (if not already set to this — it defaults to `sites.ordervora.example` for local/dev).
2. Set `SITE_WILDCARD_DNS_ACTIVE=true`.
3. Redeploy `apps/api` (or wait for the next deploy that picks up the env change, depending on your Render restart-on-env-change setting).

From this point on, every new `resolveSiteUrl()` / `temporaryStorefrontUrl()` call returns `https://<slug>.ordervora.com` instead of the `/store/<slug>` fallback, with zero frontend changes needed — Website Studio, setup completion, QR/Copy Link/Share, and Test Order all read this value from the API response.

## Rollback

Setting `SITE_WILDCARD_DNS_ACTIVE` back to `false` (or unsetting it) immediately reverts every temporary storefront URL to the `/store/<slug>` fallback — no data was changed by activation, so this is a same-instant, zero-risk rollback. The `/store/<slug>` route (`apps/api/src/modules/sites/public-render.routes.ts`'s `storeRouter`) is never removed or disabled by activation, so it keeps working as a permanent internal fallback regardless of the flag's state.

## What does *not* need to change for custom domains

A restaurant's own custom domain (`Domain` table, verified via existing DNS-verification flow) already takes precedence over both the `/store/<slug>` fallback and the future `<slug>.ordervora.com` subdomain in `resolveSiteUrl()` — activating the wildcard here has no effect on restaurants that already have a verified custom domain.
