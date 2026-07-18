# PR #12 — Onboarding Persistence: Deployment Report

**Date:** 2026-07-18
**Change:** `onboarding_status` table + `onboarding_progress` API (onboarding persistence). Backend (`apps/api`) + a small web client wrapper (`apps/web/src/lib/api.ts`). Includes a **database migration**.

---

## 1. Pull Request

| | |
|---|---|
| **PR** | **#12** — https://github.com/abukeeth/core/pull/12 |
| Title | Onboarding persistence: onboarding_status table + onboarding_progress API |
| Head → Base | `claude/onboarding-persistence-cqjtdb` → `main` |
| Merge method | Squash |
| **Merge commit on `main`** | `235d0846728a391164ab6eebed38959eb361d377` |
| Mergeable state at merge | `clean` |

## 2. CI Results (gate for merge — all passed)

| Check | Conclusion |
|---|---|
| Validate, lint, typecheck, test, build | ✅ success (completed 14:49:21Z) |
| **Migration check** | ✅ success |
| Vercel Preview Comments | ✅ success |

Behind CI (reproduced locally before merge): **API 1248 tests passed** (+11 new onboarding tests), **Web 271 tests passed**, typecheck/lint/build exit 0 on both.

## 3. Migration Status

| | |
|---|---|
| Migration | `apps/api/prisma/migrations/20260718000000_onboarding_status/migration.sql` |
| **Included in merge?** | ✅ Yes — confirmed present in the PR diff and on `main` after merge |
| Ordering | Sorts **after** the previous last migration (`20260714120000_job_durability`), so it applies last |
| Type | **Additive & safe** — `CREATE TABLE "OnboardingStatus"` + unique index on `restaurantId` + FK to `Restaurant` (`ON DELETE RESTRICT`). No `DROP`, no column changes to existing tables (only an additive relation field on `Restaurant`). |
| Generation | Produced by `prisma migrate diff` (schema-to-schema), so it matches Prisma's own output — no hand-edited SQL drift. |

**Migration SQL (as merged):**
```sql
CREATE TABLE "OnboardingStatus" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "paymentSkippedAt" TIMESTAMP(3),
    "menuSkippedAt" TIMESTAMP(3),
    "websiteSkippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnboardingStatus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingStatus_restaurantId_key" ON "OnboardingStatus"("restaurantId");
ALTER TABLE "OnboardingStatus" ADD CONSTRAINT "OnboardingStatus_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

## 4. Deployment Status

This change spans two deploy targets. **Verified vs. not-confirmable-from-here is called out explicitly — nothing is claimed that could not be checked.**

### 4a. Web frontend — Vercel ✅ VERIFIED
The web app rebuilt because `apps/web/src/lib/api.ts` changed (added the client wrappers/types).

| | |
|---|---|
| Deployment | `dpl_eENyLimhZoWWRNxhD78X5Dgc6aEE` |
| Source commit | `235d0846` (the PR #12 merge) |
| **State** | ✅ **READY**, `target: production` |
| Production URL | **https://ordervora.com** (main-branch production alias) |

### 4b. API + database migration — Railway ⚠️ MECHANISM VERIFIED, EXECUTION NOT CONFIRMABLE FROM AVAILABLE TOOLS
The `onboarding_progress` API and the `onboarding_status` **table** live in the backend (`apps/api`), which deploys on **Railway** (not Vercel). Railway's Git integration deploys `main`, and the migration runs in its pre-deploy step:

- **`railway.json` `deploy.preDeployCommand`:** `pnpm --filter api prisma:migrate:deploy && pnpm --filter api seed:if-empty` — i.e. **`prisma migrate deploy` runs on every API deploy**, which applies the new `onboarding_status` migration. ✅ *Config verified on `main`.*
- **What could not be verified from this environment:** I have **no Railway tooling**, and the sandbox's outbound proxy blocks arbitrary hosts, so I could not: trigger/observe the Railway deploy, confirm `prisma migrate deploy` actually ran, confirm the `OnboardingStatus` table now exists in the production database, or call the live `GET /api/onboarding/progress`. These are **stated as unverified rather than assumed done.** (The API production host referenced by the frontend build is `ordervora-api-production-bcc7.up.railway.app`.)

> Note: the GitHub Actions "Deploy" workflow remains a placeholder (per prior reports) and is **not** the deploy mechanism for either target.

## 5. Production Verification Results

| # | Item | Result |
|---|---|---|
| 1 | Migration included in merge | ✅ **Verified** — present on `main` (`20260718000000_onboarding_status`) |
| 2 | Railway will run `prisma migrate deploy` | ✅ **Verified in config** (`railway.json` preDeployCommand) |
| 3 | `onboarding_status` table exists after deployment | ⏳ **Not confirmable from here** — will be created by `prisma migrate deploy` on the API deploy; needs a check against the production DB (Railway/Supabase console or `prisma migrate status`) |
| 4 | `GET /api/onboarding/progress` works in production | ⏳ **Not confirmable from here** (no Railway tools, egress blocked). **Contract verified in code**: route mounted (`app.ts` → `/api/onboarding`), owner-scoped (`requireAuth` + `requireRole`), 11 passing unit tests cover the derivation across every step state. |
| 5 | Onboarding resume — refresh / logout-login / continue from last step | ✅ **Verified in code** (mechanism unchanged & pre-existing): the wizard resumes from `Restaurant.setupStep`, loaded server-side by `setup/page.tsx` on every mount — so a refresh or a fresh login on any device renders the same step. This PR additionally records `OnboardingStatus.lastActiveAt`/`completedAt` (server-side, best-effort). Interactive confirmation on a device is a manual step (below). |

### What the code guarantees for resume (item 5)
- **Refresh:** `setup/page.tsx` calls `getRestaurant()` on mount and renders the step named by `restaurant.setupStep` — no client-only state to lose.
- **Logout / login (any device):** `setupStep` is a DB column on the owner's `Restaurant`, so the resumed step is identical after re-auth.
- **Continue from last step:** each step's advance persists via `setSetupStep` (now also stamping `OnboardingStatus`); in-progress menu imports also resume via `listImportJobs`.

## 6. Manual Checks Still Required (need production API live + a real owner account)

These can't be run from this environment and should be confirmed once the Railway API has redeployed:

1. **DB:** `prisma migrate status` against production shows `20260718000000_onboarding_status` applied; `OnboardingStatus` table present.
2. **API:** authenticated `GET https://<api-host>/api/onboarding/progress` returns `{ progress: { currentStep, steps{…}, … } }` (200), and `404` for a user with no business.
3. **Resume (mobile Safari):** start onboarding, advance a step, **refresh** → same step; **log out and back in** → same step; confirm `lastActiveAt` advanced.
4. **Skip:** skip Stripe → `payment` reads `skipped` in the progress response.

---

## Summary

- ✅ PR #12 merged to `main` (`235d0846`); CI all green including the Migration check.
- ✅ Migration is **included, additive, and correctly ordered**; Railway's `preDeployCommand` runs `prisma migrate deploy`, which will create the `onboarding_status` table on the API deploy.
- ✅ Web (Vercel) production deploy **READY** at ordervora.com.
- ⚠️ The **API (Railway) deploy, the migration execution, the table's existence in prod, and the live endpoint** could **not** be verified from available tooling — they are reported as pending confirmation, not as done. Code + config verify the mechanism; §6 lists the exact manual checks to close them out.
