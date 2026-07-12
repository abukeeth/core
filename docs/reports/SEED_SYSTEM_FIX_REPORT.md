# Seed System Fix Report

Implements the fix approved in `docs/reports/SEED_SYSTEM_BLOCKER_ANALYSIS.md`. This report documents the change made, the verification performed against a real local database, and rollback instructions. No deployment was performed.

---

## Files Changed

**One file, as specified:**

- `apps/api/scripts/seed-if-empty.ts`

No other file was modified — confirmed via `git diff --stat HEAD`, which shows exactly one file changed (11 insertions, 11 deletions). `render.yaml`, `apps/api/scripts/start.sh`, `apps/api/prisma/seed.ts`, `apps/api/prisma/seed-beta.ts`, `apps/api/prisma/schema.prisma`, and everything under `apps/api/prisma/migrations/` are untouched.

### Exact diff

```diff
--- a/apps/api/scripts/seed-if-empty.ts
+++ b/apps/api/scripts/seed-if-empty.ts
@@ -1,26 +1,27 @@
 import "dotenv/config";
 import path from "node:path";
 import { execFileSync } from "node:child_process";
+import { Role } from "@prisma/client";
 import { prisma } from "../src/lib/prisma";
 
 /**
  * A hosting platform's pre-deploy hook (e.g. Render's `preDeployCommand`)
- * runs on every deploy, not just the first — but `prisma/seed-beta.ts`
- * itself isn't safe to re-run unconditionally (most of its rows have no
- * upsert-by-name guard and would duplicate). This wrapper makes chaining
- * it into a pre-deploy hook safe: it only invokes the real seed once,
- * the first time the database is empty, and is a no-op on every deploy
- * after that.
+ * runs on every deploy, not just the first. This wrapper makes chaining
+ * the production bootstrap (`prisma/seed.ts`, which creates the single
+ * ADMIN_EMAIL-based platform admin — see render.yaml) into a pre-deploy
+ * hook safe: it only invokes it once, the first time no ADMIN user
+ * exists, and is a no-op on every deploy after that.
  */
 async function main() {
-  const existing = await prisma.restaurant.count();
-  if (existing > 0) {
-    console.log(`seed-if-empty: ${existing} restaurant(s) already present, skipping beta seed.`);
+  const existingAdmins = await prisma.user.count({ where: { role: Role.ADMIN } });
+  if (existingAdmins > 0) {
+    console.log(`seed-if-empty: ${existingAdmins} ADMIN user(s) already present, skipping bootstrap seed.`);
     return;
   }
 
-  console.log("seed-if-empty: database is empty, running beta seed...");
-  execFileSync(process.execPath, [path.join(__dirname, "../prisma/seed-beta.js")], { stdio: "inherit" });
+  console.log("seed-if-empty: no ADMIN user found, running production bootstrap seed...");
+  execFileSync(process.execPath, [path.join(__dirname, "../prisma/seed.js")], { stdio: "inherit" });
 }
```

---

## Behavior Before

On the first boot against an empty database, `start.sh` → `seed-if-empty.js` unconditionally ran `prisma/seed-beta.ts`, regardless of `NODE_ENV` or any of the `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` values set in the environment. This created:

- A `Role.ADMIN` user at the hardcoded address `admin@demo.ordervora.example`, password `OrdervoraDemo!23` (public — defined in the committed `apps/api/prisma/demo-credentials.ts`).
- 3 fictitious demo restaurants (Golden Dragon Bistro, Bella Italia Trattoria, Taco Fiesta Cantina) with full staff/menu/coupon/table data.
- 5 additional demo accounts (owner, staff, kitchen, driver, customer), all sharing the same public password.

The operator's own `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` values, though required and prompted for by `render.yaml`, were read by nothing and had no effect.

The guard preventing re-runs checked `restaurant.count() > 0` — correct for `seed-beta.ts` (which is not fully idempotent) but irrelevant to the real bootstrap.

## Behavior After

Verified live against a fresh local PostgreSQL 16 database (full steps in §Verification below). On the first boot against an empty database, `seed-if-empty.js` now runs `prisma/seed.ts`, which:

- Creates exactly one `Role.ADMIN` user, using the operator's own `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` (confirmed: a user seeded with `ADMIN_EMAIL=real-admin@ordervora-production.example` produced a database row with that exact email and `role = ADMIN` — no demo admin created).
- Seeds the `Theme` catalog (8 rows) — real platform reference data used by the site builder, unrelated to demo restaurants.
- Creates **zero** restaurants and **zero** demo accounts (confirmed: `SELECT count(*) FROM "Restaurant"` returned `0` after the bootstrap ran).

The guard now checks `user.count({ where: { role: Role.ADMIN } }) > 0` — matching what `prisma/seed.ts` actually creates. A second run against the same (now-seeded) database logged `"1 ADMIN user(s) already present, skipping bootstrap seed."` and performed no further writes, confirmed by output alone (no additional DB queries beyond the count).

The demo seed is no longer run automatically on any deploy, but remains fully available on demand: `pnpm --filter api run seed:beta` was run manually against the same database after the bootstrap and completed successfully, producing the exact same Sprint 08 demo environment as before this change (3 restaurants, 6 demo accounts, unaffected by the fix).

---

## Verification Performed

All steps executed for real, against a live local PostgreSQL 16.13 instance (not simulated):

| Step | Result |
|---|---|
| `pnpm run typecheck` (apps/api) | **Pass** — `tsc -p tsconfig.json --noEmit`, no errors |
| `pnpm run test` (apps/api) | **Pass** — 1113 passed, 5 skipped (153 test files); no test targets `seed-if-empty.ts` or the seed scripts directly, so none were affected, and the full suite confirms no regression elsewhere |
| `pnpm run build` (apps/api) | **Pass** — `prisma generate` + `tsc` compiled cleanly; `dist/scripts/seed-if-empty.js` inspected directly and confirmed to reference `../prisma/seed.js` and `Role.ADMIN`, not `seed-beta.js` |
| Fresh-database bootstrap run | `node dist/scripts/seed-if-empty.js` with `ADMIN_EMAIL=real-admin@ordervora-production.example` set → logged `"no ADMIN user found, running production bootstrap seed..."` → `"Seeded ADMIN user: real-admin@ordervora-production.example"` → `"Seeded 8 themes"` |
| DB state confirmed via direct query | `SELECT email, role, name FROM "User"` → exactly one row, `real-admin@ordervora-production.example` / `ADMIN` / `Real Production Admin`. `SELECT count(*) FROM "Restaurant"` → `0`. `SELECT count(*) FROM "Theme"` → `8`. |
| Idempotency re-run | Second `node dist/scripts/seed-if-empty.js` run → logged `"1 ADMIN user(s) already present, skipping bootstrap seed."`, no further writes |
| Demo seed preservation | `pnpm --filter api run seed:beta` run manually against the same database → completed successfully, same output as always (3 restaurants, demo admin, demo accounts, shared demo password) — confirms the demo path is fully intact and still usable on demand |
| Scope check | `git diff --stat HEAD` → exactly one file changed (`apps/api/scripts/seed-if-empty.ts`); no diff in `render.yaml`, `start.sh`, `seed.ts`, `seed-beta.ts`, `schema.prisma`, or `prisma/migrations/` |

**Verify production bootstrap now uses `ADMIN_EMAIL`/`ADMIN_PASSWORD`:** Confirmed above — the seeded user's email exactly matched the configured `ADMIN_EMAIL`.

**Verify demo seed is no longer executed automatically:** Confirmed above — the automatic first-boot path (`seed-if-empty.js`) created zero restaurants and zero demo accounts; the demo seed only ran when invoked explicitly and separately via `pnpm run seed:beta`.

---

## Risk Assessment

| Risk | Severity | Notes |
|---|---|---|
| Databases that were already seeded by the old beta-seed path before this fix | Medium, not applicable here | The guard now checks for an existing `Role.ADMIN` user. A database that already has the demo admin (`admin@demo.ordervora.example`, `Role.ADMIN`) will satisfy `existingAdmins > 0` and skip — it will **not** retroactively create the real `ADMIN_EMAIL`-based admin. Not a concern for this deployment (targets a brand-new, never-seeded Supabase project per `docs/reports/SUPABASE_DEPLOYMENT_CHECKLIST.md`), but relevant if this fix is ever applied to an environment that was seeded under the old code first. |
| `prisma/seed.ts` requires `ADMIN_EMAIL`/`ADMIN_PASSWORD` to be set (throws via `requireEnv()` otherwise) | Low | Not a new risk — `render.yaml` already marks both `sync: false` (required, prompted at Blueprint-apply time), so this requirement was already enforced by the deployment checklist before this fix; the fix simply makes that requirement actually matter. |
| Scope/blast radius | Low | Single file, 11 lines changed each way, no schema/migration/build-config/start-script changes, no dependency changes (`Role` is already imported identically elsewhere in this codebase, e.g. `prisma/seed.ts`, `prisma/seed-beta.ts`). |
| Test coverage | Low | No dedicated unit test existed for `seed-if-empty.ts` before or after this change (confirmed via `git diff` and a repo search) — the verification in this report is a real, executed integration check against a live database in lieu of a unit test, matching how this script has always been validated (Sprint 08's own completion report used the same live-verification approach, not unit tests, for its seed changes). |

---

## Rollback Instructions

Single-file, ~10-line change, no schema/migration component.

1. **Before this commit reaches a deployed environment:** `git revert <this commit's SHA>`, or restore `apps/api/scripts/seed-if-empty.ts` to its prior contents (reproduced in `docs/reports/SEED_SYSTEM_BLOCKER_ANALYSIS.md` §1 if needed for reference). No database action required.
2. **If already deployed and a rollback is wanted:** revert the commit and redeploy. The next boot's guard would check `restaurant.count()` again (the old logic) — since a real admin now exists but no restaurant yet, this would cause the old code to run `seed-beta.ts` once more on the next boot after rollback. If that's undesired, either don't roll back, or manually verify/clean up before rolling back.
3. **To get the demo environment after this fix, without rolling back:** no rollback needed at all — run `pnpm --filter api run seed:beta` manually (confirmed still fully functional in this report's verification).

---

## Verdict

Fix implemented exactly as approved: one file changed, production bootstrap now correctly uses `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME`, demo seed no longer runs automatically but remains fully available on demand, typecheck/tests/build all pass, and live verification against a real database confirms the corrected behavior end to end. No deployment was performed.
