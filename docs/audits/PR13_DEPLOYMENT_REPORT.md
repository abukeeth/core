# PR #13 — Theme Engine v1 (Inline Theme Switcher): Deployment Report

**Date:** 2026-07-18
**Change:** Inline **Modern / Luxury / Local** theme switcher on the design review (approval) gate, plus a backend **single-draft invariant** in `selectVariation`. Frontend (`apps/web`) + backend (`apps/api`). **No database migration** (schema already had `styleFamily`, `Theme`, `Site.themeId`).

---

## 1. Pull Request

| | |
|---|---|
| **PR** | **#13** — https://github.com/abukeeth/core/pull/13 |
| Title | Theme Engine v1: inline Modern/Luxury/Local switcher at the review gate |
| Head → Base | `claude/theme-switcher-cqjtdb` → `main` |
| Merge method | Squash |
| **Merge commit on `main`** | `9cf9c18653938b060a9a7f71b9a04e35daac1789` |
| Mergeable state at merge | `clean` |
| Diff | 9 files, +202 / −12 |

## 2. CI Results (gate for merge — all passed)

| Run | Event | Conclusion |
|---|---|---|
| CI #47 (`ci.yml`) on head `cc0ff65` | `pull_request` | ✅ success (completed 15:18:43Z) |
| Vercel (preview) on head `cc0ff65` | deployment | ✅ success — READY |
| CI #48 (`ci.yml`) on merge `9cf9c18` | `push` (main) | ✅ success (completed 15:22:16Z) |

Reproduced locally before merge: **API 1249 tests passed** (+1 single-draft-invariant test), **Web builder suite 60 passed**; typecheck / lint / build exit 0 on both `apps/api` and `apps/web`.

> Note on the "Deploy" GitHub Actions workflow: it remains a **placeholder** that reports `failure` on `workflow_run` and does **not** perform or gate the real deployments (Vercel + Railway do). This is unchanged from prior releases (PR #9–#12) and is not a regression.

## 3. Database / Migration Status

| | |
|---|---|
| Schema change | **None** |
| Migration added | **None** |
| Why | The three style families (`StyleFamily = LUXURY / MODERN / MINIMAL`), the `Theme` model, and `Site.themeId` already existed. Theme selection persists through the pre-existing `POST /api/sites/:id/variations/:vid/select` endpoint. |

No `prisma migrate deploy` work is required for this release.

## 4. Production Deployment

### Web (Vercel — automatic on `main` push)

| | |
|---|---|
| Deployment ID | `dpl_EGiMchgPVF66VRRqSB6Y3V23kq3Q` |
| Commit | `9cf9c18` (PR #13) |
| Target | **production** |
| State | ✅ **READY** (built 15:33:11Z region `iad1`) |
| Aliases | **ordervora.com**, **www.ordervora.com**, ordervora-web.vercel.app |
| `aliasError` | `null` |

The switcher UI (design review screen) ships with this web deploy.

### API (Railway — automatic on `main` push)

| | |
|---|---|
| Backend change in this PR | `selectVariation` single-draft invariant (`apps/api/src/modules/sites/generation.service.ts`) |
| Requires API redeploy? | **Yes** — the invariant only takes effect once the API redeploys |
| Migration on deploy | None (no schema change) |
| Verification from available tools | **Not directly verifiable here.** This session has no Railway tooling, and outbound egress to the production hosts is blocked by network policy (see §5). Railway's documented behavior is to auto-deploy the API on `main` push; that mechanism is unchanged from prior releases. |

## 5. Functional Verification

### What was verified (automated, pre-merge — green)

The four required behaviors are each covered by tests that assert the exact contract, and all pass:

| Required check | How it is proven | Result |
|---|---|---|
| **Theme switching works** | `design-review-screen.test.tsx`: renders one chip per style family in Modern/Luxury/Local order; clicking "Local" fires `onSelectTheme("v-local")`. `use-restaurant-builder.test.ts`: `selectTheme` calls `selectVariation(siteId, versionId)` and updates `selectedVersionId`. | ✅ pass |
| **Theme persists** | Persistence goes through `selectVariation`, which promotes the chosen version to the single `DRAFT` in the DB (server test: promotes to DRAFT + updates site). The builder re-reads the selected version, so a refresh reflects the persisted draft. Backend single-draft-invariant test proves exactly one `DRAFT` survives repeated switches. | ✅ pass |
| **Selected theme is published** | `publishSite` renders `getActiveDraft` (the single `DRAFT`). The invariant guarantees the active draft is the theme the owner last selected — so publish can no longer pick a stale/other draft (the previous multi-draft ambiguity). | ✅ pass (unit/service level) |
| **Mobile preview updates** | The preview is the real `DevicePreview` iframe keyed on `selectedVersionId`; switching themes updates `selectedVersionId`, re-rendering the preview. Switcher is mobile-first (horizontally-scrollable chip row, `min-h-11` tap targets). Test asserts the real preview reflects the selected version. | ✅ pass |

Full suites behind CI: **API 1249 passed**, **Web builder 60 passed**, typecheck/lint/build clean.

### What was NOT click-tested in live production (and why)

A true end-to-end click-through in production — log in as a business owner, generate a site (three real variations), switch themes on the live review screen, refresh, publish, and inspect the published storefront on a mobile viewport — was **not** performed from this session because:

1. **No authenticated owner session / test business.** Exercising the switcher requires a real onboarding run that generates three variations; there is no seeded production owner+site available to this session.
2. **Egress to production is blocked.** The sandbox network policy denies outbound CONNECT to `ordervora.com` / `www.ordervora.com` (agent proxy returned `403 connect_rejected` for both). So even an unauthenticated smoke fetch of the production domain isn't possible from here. The Vercel control-plane API (READY + aliased to ordervora.com, `aliasError: null`) is the authoritative signal that the web deploy is live.

**Recommended manual pre-release pass (owner account, real device):** onboard a test business → reach the review gate → confirm three chips (Modern/Luxury/Local), the correct one pressed → tap each and confirm the real preview re-renders per theme → refresh and confirm the last-picked theme is still selected → approve/publish → open the published storefront on a phone and confirm it matches the chosen theme. No schema/data risk; this validates the live wiring the tests validate structurally.

## 6. Rollback

Frontend rollback is a Vercel promote of the prior production deployment (`dpl_C3jZHtpLaXsVVicNSNRwGXjeCha5`, commit `9216d27`, `isRollbackCandidate: true`). Backend rollback would be a Railway redeploy of the prior `main` commit. Because there is **no migration**, rollback carries no data-migration risk in either direction.

## 7. Summary

- ✅ CI green on both the PR head and the `main` merge commit.
- ✅ PR #13 squash-merged to `main` (`9cf9c18`).
- ✅ Web deployed to production (Vercel READY, aliased to ordervora.com).
- ✅ No database migration required or performed.
- ✅ Required behaviors (switch / persist / publish-selected / mobile preview) verified by passing tests.
- ⚠️ API redeploy (Railway) for the backend invariant, and a live authenticated click-through of the four behaviors, are **expected but not directly verifiable from this session** (no Railway tooling; production egress blocked). Manual pre-release steps documented in §5.
