# Storefront, Preview, Routing & Temporary-Domain Rebuild — Implementation Report

Branch: `claude/storefront-preview-rebuild` (pushed to origin; **not merged**).

**Do not merge, deploy, or activate wildcard DNS from this report alone — it is the review artifact requested before those steps.** Production (Render `ordervora-web`/`ordervora-api`, the live `ordervora.com` domain) was not touched by this work.

## 1. Audit finding: Task 7 status

Task 7 (the AI-generated multi-page storefront renderer at `apps/api/src/modules/sites/renderer/*`) was **already complete, real, and fully wired at the rendering layer** — `renderSitePage()`/`renderPage()` produce real HTML from real restaurant data (name, hero, categories, products, images, theme colors/typography, About/Contact, Gallery) and are covered by extensive pre-existing tests (`render-site.test.ts`, `hero.test.ts`, `menu-section.test.ts`, `gallery.test.ts`, `theme-css.test.ts`, etc.). It was never disconnected from production routes.

What was actually broken/disconnected sat one layer up, in the **dashboard's own UI wrapper** around that renderer:

| Symptom reported | Root cause | File/line |
|---|---|---|
| Static placeholder content, tiny non-full-screen phone illustration | An entirely separate, self-labeled `"simulated, not real AI"` feature (`AiBrandConcepts`) rendered on the dashboard instead of the real renderer | `apps/web/src/app/dashboard/website/studio/ai-brand-concepts.tsx` (deleted) + `brand-concepts/*` (deleted) |
| Defaults to Desktop on iPhone; device switcher doesn't change layout | `DevicePreview` had no viewport detection and no width-driven frame | `apps/web/src/app/dashboard/website/variations/[id]/device-preview.tsx` (rewritten) |
| No internal navigation; raw Next.js 404 in preview | The renderer's real root-relative links (`<a href="/menu">`) navigated the iframe straight to the dashboard's own Next.js routes, which don't exist | same file — click interception added |
| Test order shows "Restaurant not found" | `isPublished` only flips to `true` on the setupStep→DONE *transition* (existing fix); restaurants that reached DONE before that fix landed were never backfilled | `apps/api/scripts/backfill-published-restaurants.ts` (new) |
| Invalid placeholder domains (`tete.placeholder.example`, `tete.sites.ordervora.example`) | Fallback URL construction hardcoded `sites.ordervora.example` / `.ordervora.app` in multiple places instead of one shared, env-gated source | `site.service.ts`, `finale-reveal.tsx`, `dashboard/website/page.tsx`, `edit-temporary-domain.tsx` |

**Conclusion: reuse-and-repair, not rebuild.** No second storefront renderer was created. Every fix in this task is either (a) at the DevicePreview iframe-wrapper layer, deliberately never touching the renderer's own deterministic output, or (b) URL-construction logic that now reads from one backend source of truth.

## 2. Root cause → fix, file/line references

- `apps/web/src/app/dashboard/website/page.tsx:12` (was pointing at fake concepts) → now renders `WebsiteDesignStatus` (`apps/web/src/app/dashboard/website/studio/website-design-status.tsx`, new), driven by real `GenerationJob`/`SiteVersion[]` data.
- `apps/web/src/app/dashboard/website/variations/[id]/device-preview.tsx` — full rewrite: `detectDevice()` (lines ~9-14) for viewport-aware default, corrected post-mount via `useEffect` (avoids SSR hydration mismatch since the server has no viewport), `DEVICE_WIDTHS` drives the actual frame's `maxWidth` style, `handleIframeLoad` (~91-125) reads the same-origin iframe's `contentDocument` to intercept internal link clicks and to detect the new `data-ordervora-preview-error` marker.
- **Bug found and fixed during test-writing**: the "Back to home" recovery button (line ~168 pre-fix) called `setPath("/")` but never cleared `previewError` state, so a real preview error was permanently stuck once shown. Fixed by also calling `setPreviewError(null)`.
- `apps/api/src/modules/sites/public-render.routes.ts` — added `sendPreviewError()` (emits `data-ordervora-preview-error="<code>"` instead of bare text) on all 4 error paths in `handlePreviewRequest`; extracted `serveSiteRelease()` so both hostname-based (`siteEdgeMiddleware`) and the new path-based (`storeRouteHandler`) routes share one serving implementation — no drift possible between them.
- `apps/api/src/modules/sites/site.service.ts` — added `RESERVED_SUBDOMAINS`, `temporaryStorefrontUrl()` (env-gated on `SITE_WILDCARD_DNS_ACTIVE`), reserved-name-aware `findAvailableSlug()`. `resolveSiteUrl()` now delegates the no-custom-domain case to `temporaryStorefrontUrl()`.
- `apps/api/src/modules/sites/site.controller.ts` — both `getMine` and `create` now call `temporaryStorefrontUrl()` instead of manually building `https://${slug}.${PLATFORM_DOMAIN}`.
- `apps/web/src/lib/site-url.ts` (new) — the one frontend-side fallback used only when no Site/domain row exists yet at all (illustrative preview text, not a real link); previously duplicated as separate hardcoded literals in `finale-reveal.tsx` and `dashboard/website/page.tsx`.
- `apps/web/src/app/dashboard/website/studio/domain/edit-temporary-domain.tsx` — rewritten slug-extraction (`splitAroundSlug`/`guessSlug`) to work with both the `/store/<slug>` and future `<slug>.ordervora.com` URL shapes, since the backend change would have silently broken the old hostname-only assumption.

## 3. Route map

**Before:**
- `/preview/:token` (Express, apps/api) — existing, real, used by DevicePreview.
- No path-based fallback storefront route existed; a site with no verified custom domain had no working customer-facing URL other than an invalid placeholder-domain string.

**After (added, nothing removed):**
- `GET /store/:slug` and `GET /store/:slug/*splat` (Express, apps/api, `public-render.routes.ts`) — new. Proxied same-origin by `apps/web/next.config.ts`'s `rewrites()` (`/store/:path*` → API), mirroring the existing `/preview/*` and `/assets/*` proxy pattern. No Next.js page exists at this path deliberately — it's a pure proxy.
- Both `/store/*` and the existing hostname-based path now call the same `serveSiteRelease()` function — guaranteed identical behavior (publish state, sitemap/robots, 503 holding page, 404s).

## 4. Example URLs

- Generated storefront URL today (pre-wildcard-DNS, production): `https://ordervora.com/store/trattoria-bella`
- Generated storefront URL after `SITE_WILDCARD_DNS_ACTIVE=true` (future, once DNS is live): `https://trattoria-bella.ordervora.com`
- Preview URL (dashboard, unchanged shape, now with graceful errors and real navigation): `/preview/<short-lived-token>?variation=<variationId>&path=/menu`

## 5. Evidence

This sandbox has no live browser/production environment to capture screenshots against real data, so evidence here is the automated-test proof of each behavior instead:

- Mobile/tablet/desktop default + actual width change: `device-preview.test.tsx`, describe block "device defaults (§B)" — 6 tests, including the one asserting `maxWidth` genuinely changes (not just tab styling).
- Real navigation inside the phone frame: describe block "internal navigation stays inside the preview context" — clicks a real `<a href="/menu">` inside the iframe's own document and asserts the *same* iframe's `src` updates to `path=/menu`, never leaving the preview.
- Graceful error state (replacing raw 404): describe block "graceful error states" — 3 tests, including the recovery-button bug fix.
- Theme switching changes real visual config: `theme-css.test.ts` ("is deterministic for the same theme + seed" + per-theme token/font tests) at the renderer level; each variation card in `variations/page.tsx` now renders its own live `DevicePreview` (task 21), so switching between theme cards shows genuinely different real previews, not a shared static mock.
- Test order resolves to the real current restaurant: `launch-center.test.tsx`, `test-order-flow.test.tsx` — assert the URL is built from `restaurant.id` (real API data), never a hardcoded slug, and that QR code + Copy Link render the identical URL.
- No placeholder/stale domains reachable: negative assertions across `finale-reveal.test.tsx`, `edit-temporary-domain.test.tsx`, `launch-center.test.tsx` for `placeholder.example`, `sites.ordervora.example`, `ordervora-web.onrender.com`.
- `/store/<slug>` and `/preview/:token` both return 200 on a real published page: `public-render.routes.test.ts` (explicit `res.statusCode === 200` assertions added).
- Restaurant publication state correct after setup completion: `restaurant.service.test.ts`'s existing "publishes the restaurant when setupStep advances to DONE" test, plus the new backfill script for restaurants that completed setup before that fix existed.

## 6. Typecheck / lint / build / test results

All run in this sandbox, on this branch, after all changes:

- `pnpm run typecheck` (both `apps/api` and `apps/web`): **clean, 0 errors**.
- `pnpm run lint` (both apps): **clean** (2 pre-existing, unrelated `<img>` warnings in `apps/web/src/app/page.tsx`; not touched by this task). One real lint error was found and fixed along the way (`react-hooks/set-state-in-effect` in the new `DevicePreview` effects — matched the existing codebase convention of an `eslint-disable-next-line` with a justifying comment, same pattern already used in `launch-center.tsx`/`test-order-flow.tsx`).
- `apps/api` build (`prisma generate && tsc`): succeeds (this sandbox has no `DATABASE_URL` configured at all — a pre-existing sandbox limitation unrelated to this task; `prisma generate` only needs the var to be *present*, not a live database, and was verified with a dummy connection string).
- `apps/web` build (`next build`): succeeds, full route map generated including all `/dashboard/website/*` and `/dashboard/launch/*` routes.
- Full test suites: **apps/api 1141 passed, 5 skipped (pre-existing skips, unrelated) / 0 failed**. **apps/web 167 passed / 0 failed.**

## 7. Migration risk

- **Database**: no schema changes. The backfill script (`apps/api/scripts/backfill-published-restaurants.ts`) is a one-time, idempotent `updateMany` (`WHERE setupStep = DONE AND isPublished = false`) — safe to re-run, no-op once applied. Not run automatically; ops runs it manually via `pnpm backfill:published-restaurants` when ready.
- **Environment variables**: two new optional vars, both default to today's behavior if unset — `SITE_WILDCARD_DNS_ACTIVE` (default `false`), and `SITE_PLATFORM_DOMAIN` is pre-existing (default unchanged). No existing env var's meaning changed.
- **Routing**: `/store/*` is strictly additive — no existing route was removed or changed in a way that alters its response for existing callers.
- **Frontend**: `AiBrandConcepts` and its `brand-concepts/*` subtree were deleted; confirmed via repo-wide grep that nothing else imports them.

## 8. Rollback plan

- Code: revert the 3 commits on `claude/storefront-preview-rebuild` (`e0363c2`, `4df40cf`, `06cbb4f`) — clean revert, no data migration to undo.
- If already deployed and only the wildcard needs undoing: set `SITE_WILDCARD_DNS_ACTIVE=false` (or leave unset) — instantly reverts every temporary storefront URL back to the `/store/<slug>` fallback, no data was changed by activation (see `docs/runbooks/wildcard-subdomains.md`).
- The backfill script is additive-only (`isPublished: false → true`); there's no meaningful "undo" needed, but reverting a specific restaurant's `isPublished` back to `false` manually is always possible if one was flipped in error.

## 9. Confirmation production wasn't changed

- No commits were pushed to `main`. The completed infra-hardening PR (#1) was not modified, reverted, or reopened.
- `render.yaml`'s `ordervora-web` Render service definition was not touched — nothing in this task removes or reconfigures it.
- The live `ordervora.com` / `www.ordervora.com` DNS and Vercel domain configuration were not touched; wildcard DNS was not configured (deliberately deferred to `docs/runbooks/wildcard-subdomains.md`, an ops-driven manual activation).
- `SITE_WILDCARD_DNS_ACTIVE` defaults to off, so no runtime behavior changes for any existing deployment until an operator explicitly sets it.

## 10. Complete changed-file list

**Backend (`apps/api`)**
- `apps/api/.env.example` — documented `SITE_WILDCARD_DNS_ACTIVE`.
- `apps/api/package.json` — added `backfill:published-restaurants` script.
- `apps/api/scripts/backfill-published-restaurants.ts` — new.
- `apps/api/src/app.ts` — mounted `storeRouter` at `/store`.
- `apps/api/src/config/env.ts` — added `SITE_WILDCARD_DNS_ACTIVE` to `KNOWN_ENV_KEYS`.
- `apps/api/src/modules/sites/public-render.routes.ts` — `sendPreviewError`, `serveSiteRelease` extraction, `storeRouteHandler`/`storeRouter`.
- `apps/api/src/modules/sites/public-render.routes.test.ts` — new tests for `storeRouteHandler`, error markers, explicit 200-status assertions.
- `apps/api/src/modules/sites/site.controller.ts` — use `temporaryStorefrontUrl()`.
- `apps/api/src/modules/sites/site.service.ts` — `RESERVED_SUBDOMAINS`, `temporaryStorefrontUrl()`, reserved-aware `findAvailableSlug()`.
- `apps/api/src/modules/sites/site.service.test.ts` — new/updated tests for the above.

**Frontend (`apps/web`)**
- `apps/web/next.config.ts` — `/store/:path*` rewrite.
- `apps/web/src/app/dashboard/builder/finale-reveal.tsx` / `.test.tsx` — canonical fallback URL.
- `apps/web/src/app/dashboard/website/page.tsx` — canonical fallback URL, wired `WebsiteDesignStatus`.
- `apps/web/src/app/dashboard/website/studio/ai-brand-concepts.tsx` and `studio/brand-concepts/*` — deleted (7 files).
- `apps/web/src/app/dashboard/website/studio/website-design-status.tsx` / `.test.tsx` — new.
- `apps/web/src/app/dashboard/website/studio/domain/edit-temporary-domain.tsx` / `.test.tsx` — slug-extraction fix.
- `apps/web/src/app/dashboard/website/variations/[id]/device-preview.tsx` / `.test.tsx` — rewrite + tests.
- `apps/web/src/app/dashboard/website/variations/page.tsx` — real thumbnails per variation.
- `apps/web/src/app/dashboard/launch/launch-center.test.tsx`, `test-order-flow.test.tsx` — new.
- `apps/web/src/lib/site-url.ts` — new.

**Docs**
- `docs/runbooks/wildcard-subdomains.md` — new.
- `docs/reports/STOREFRONT_PREVIEW_REBUILD.md` — this report.
