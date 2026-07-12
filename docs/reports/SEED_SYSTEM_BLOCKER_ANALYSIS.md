# Seed System Blocker — Root Cause Analysis & Proposed Fix

Investigation only. **No code has been modified.** This report documents why `start.sh` seeds demo data on production boot, classifies the defect, verifies what `render.yaml` actually expects, and proposes the smallest possible fix for approval. Implementation is withheld pending sign-off, per instructions.

---

## 1. Why `start.sh` executes `prisma/seed-beta.ts` instead of `prisma/seed.ts`

`start.sh` itself does not choose which seed script runs — it only calls `node dist/scripts/seed-if-empty.js`. The actual decision is inside `apps/api/scripts/seed-if-empty.ts`:

```ts
async function main() {
  const existing = await prisma.restaurant.count();
  if (existing > 0) {
    console.log(`seed-if-empty: ${existing} restaurant(s) already present, skipping beta seed.`);
    return;
  }

  console.log("seed-if-empty: database is empty, running beta seed...");
  execFileSync(process.execPath, [path.join(__dirname, "../prisma/seed-beta.js")], { stdio: "inherit" });
}
```

It unconditionally shells out to `prisma/seed-beta.js`, gated only by "does the `restaurant` table have zero rows" — never by `NODE_ENV`, a feature flag, or any other environment signal.

### Historical trace (via repo docs — no separate `.git` history exists; this is a single-commit clean import)

- **`apps/api/scripts/start.sh` predates the demo seed.** Production Hardening **Phase 4**'s completion report (`docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_4_COMPLETION_REPORT.md`) introduces `start.sh` and describes its `exec`-form entrypoint and graceful-shutdown handling in detail — it says nothing about seeding at all. `seed-if-empty.ts` did not exist at that point.
- **`prisma/seed.ts` is the original, real bootstrap.** It reads `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` via `requireEnv()` (the Phase 3 "single source of truth for environment configuration" helper — `apps/api/src/config/env.ts`), upserts exactly one `Role.ADMIN` user, and seeds `THEME_CATALOG` (real platform reference data used by the site builder, not restaurant demo data). It is also wired into Prisma's own standard seed hook (`apps/api/package.json`: `"prisma": { "seed": "tsx prisma/seed.ts" }`), the conventional mechanism `prisma migrate dev`/`prisma db seed` use.
- **`prisma/seed-beta.ts` was built later, in Sprint 08 ("Beta Experience").** Its own completion report (`docs/reports/Sprint08/SPRINT_08_BETA_EXPERIENCE_REPORT.md`) states the objective explicitly: *"Turn the production-ready codebase from Sprint 07 ... into a realistic, fully-functional beta environment the user could personally experience end to end."* It seeds 3 fictitious restaurants, 6 demo accounts (including a demo `Role.ADMIN`), and 70 historical orders — all clearly demo/preview content, not production bootstrap data.
- **`prisma/seed-beta.ts`'s own code comments show its author knew the two scripts serve different purposes.** Line 202-204: *"Platform Admin (separate from the ADMIN_EMAIL bootstrap account in seed.ts, so real production admin credentials are never printed in any committed demo guide)."* This is a deliberate design choice **for the demo script** — the demo admin is intentionally different from the real one specifically so real credentials never leak into a demo guide.
- **`seed-if-empty.ts` itself is not mentioned in any Sprint 07 or Sprint 08 completion report**, including Sprint 08's own "Files changed" list (which lists `seed-beta.ts`, `demo-credentials.ts`, `seed-beta-orders.ts`, `demo-place-delivery-order.ts`, `demo-assign-driver.ts`, and 3 other files — not `seed-if-empty.ts`, not `start.sh`, not `render.yaml`). It was added at some undocumented point after Sprint 08, wiring the already-built demo seed into the production boot path with no corresponding report explaining the decision.
- **A later, separate document (`RAILWAY_DEPLOYMENT.md`) already treats this wiring as an established fact**, describing `seed:if-empty` as *"the same idempotent guard already used for the Render deployment"* and explicitly calling it *"the beta seed"* — confirming the author of that later document understood this to be demo/beta content, and simply reused the existing (already demo-seeding) wiring for a second deployment target without questioning it.

**Conclusion: this is not a copy-paste accident or an unrelated bug** — `seed-if-empty.ts` correctly and deliberately calls `seed-beta.ts`, by design, at the time it was written. The defect is that this demo-convenience wiring, built so a user could "personally experience" the product immediately after a Sprint 08 demo deployment, was never gated behind an opt-in and was never swapped back to the real bootstrap (`prisma/seed.ts`) before being treated as the general-purpose, permanent production entrypoint — which is what it now is, unconditionally, on every fresh deploy including this "clean" one.

---

## 2. Classification

**Forgotten demo code — not intentional for production, not inert legacy code either.**

- **Not "intentional" (for production launches):** every deployment-facing document produced across this engagement — `render.yaml`'s own inline comment, `docs/PRODUCTION_SOURCE_OF_TRUTH.md`, `docs/reports/RENDER_DEPLOYMENT_GUIDE.md`, `docs/reports/RENDER_DEPLOYMENT_CHECKLIST.md` — describes `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` as bootstrapping the real admin account. None of them mention that three demo restaurants and a public-password demo admin will also be created. If this were an intentional, currently-endorsed production behavior, at least one of these documents — written concurrently with, and specifically about, this exact deployment — would say so.
- **Not "legacy code" in the inert sense:** it is not dead, unreachable, or superseded code sitting unused. It is actively wired into `start.sh`, the literal production entrypoint, and will execute on the very next fresh deploy.
- **"Forgotten demo code" fits precisely:** it was built for one narrow, explicitly-scoped purpose (Sprint 08's personal demo walkthrough), reused unmodified for a second deployment target (Railway) without re-examination, and left as the default for every subsequent "first empty database" boot — including a brand-new, intentionally clean production deployment where it was never re-evaluated.

---

## 3. Does `render.yaml` expect `ADMIN_EMAIL`/`ADMIN_PASSWORD` to bootstrap the first administrator?

**Yes, confirmed explicitly, in two independent places:**

- `render.yaml` itself, directly above the `ADMIN_EMAIL` variable:
  > `# Bootstraps the single platform ADMIN account on first boot (see apps/api/prisma/seed.ts) — required for the seed step in start.sh to succeed. Never exposed through any HTTP endpoint.`

  This comment names `apps/api/prisma/seed.ts` specifically — the real bootstrap script — as the mechanism these variables feed. `apps/api/prisma/seed.ts` is never invoked anywhere in the current boot path.

- `docs/PRODUCTION_SOURCE_OF_TRUTH.md`, under "Render API" → "Environment ownership," lists `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` alongside `DATABASE_URL`, JWT secrets, and other genuine production secrets Render owns — treating them as real, load-bearing production configuration, not demo placeholders.

**Verified mismatch:** `render.yaml`'s own documentation of its own environment variables does not match what the code it deploys actually does. This is a documentation/implementation drift, consistent with the "forgotten" classification in §2 — not a case where the code and its accompanying docs agree on an intentional demo-first launch strategy.

---

## 4. Proposed Fix (smallest possible — not yet implemented)

### Root cause (one-line summary)

`apps/api/scripts/seed-if-empty.ts` invokes `prisma/seed-beta.ts` (Sprint 08's demo/beta seed) instead of `prisma/seed.ts` (the `ADMIN_EMAIL`-based production bootstrap that `render.yaml` and `docs/PRODUCTION_SOURCE_OF_TRUTH.md` both document as the intended mechanism), with no environment gating of any kind.

### Files affected

**One file only:** `apps/api/scripts/seed-if-empty.ts`

No other file requires a code change:
- `apps/api/scripts/start.sh` is unaffected — it already just calls `node dist/scripts/seed-if-empty.js`; the fix is entirely inside that script.
- `render.yaml` requires **no change** — its `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` declarations and its comment describing `apps/api/prisma/seed.ts` are already correct; they simply become true instead of aspirational once this fix lands.
- `apps/api/prisma/seed.ts` requires **no change** — it is already correct and complete.
- `apps/api/prisma/seed-beta.ts` and its supporting scripts (`seed-beta-orders.ts`, `demo-place-delivery-order.ts`, `demo-assign-driver.ts`, `demo-credentials.ts`) require **no change and are not removed** — they remain fully intact, still runnable manually and on demand (`pnpm run seed:beta`, `pnpm run seed:beta:orders`, `pnpm run seed:beta:delivery-order`), for anyone who deliberately wants the Sprint 08 demo experience (e.g., a separate non-production database, or a manual run via Render's Shell tab — already documented as a manual step in `docs/runbooks/render-deploy.md`'s "One-time follow-up" section).
- No `schema.prisma` change, no new migration.

### Exact code change

```diff
--- a/apps/api/scripts/seed-if-empty.ts
+++ b/apps/api/scripts/seed-if-empty.ts
@@ -1,6 +1,7 @@
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
 
 main()
```

Full resulting file for clarity:

```ts
import "dotenv/config";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

/**
 * A hosting platform's pre-deploy hook (e.g. Render's `preDeployCommand`)
 * runs on every deploy, not just the first. This wrapper makes chaining
 * the production bootstrap (`prisma/seed.ts`, which creates the single
 * ADMIN_EMAIL-based platform admin — see render.yaml) into a pre-deploy
 * hook safe: it only invokes it once, the first time no ADMIN user
 * exists, and is a no-op on every deploy after that.
 */
async function main() {
  const existingAdmins = await prisma.user.count({ where: { role: Role.ADMIN } });
  if (existingAdmins > 0) {
    console.log(`seed-if-empty: ${existingAdmins} ADMIN user(s) already present, skipping bootstrap seed.`);
    return;
  }

  console.log("seed-if-empty: no ADMIN user found, running production bootstrap seed...");
  execFileSync(process.execPath, [path.join(__dirname, "../prisma/seed.js")], { stdio: "inherit" });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Why the guard condition also changes (`restaurant.count()` → `user.count({role: ADMIN})`)

This is the one place the fix goes slightly beyond a pure find-and-replace, and it's necessary, not optional: `prisma/seed.ts` never creates a `Restaurant` row (only `prisma/seed-beta.ts` does). If the guard were left checking `restaurant.count()` while the target script became `seed.ts`, the guard would never see a nonzero count from the bootstrap's own actions — it would keep re-running the admin/theme bootstrap on every single container boot until a real restaurant owner eventually signs up through the app. `prisma/seed.ts`'s own operations are all idempotent upserts (`user.upsert`, `theme.upsert`), so this would not corrupt data or error — but it would silently do unnecessary work (password hashing, ~2 DB round trips, N theme upserts) on every restart indefinitely, which the original guard was explicitly designed to prevent. Checking for an existing `Role.ADMIN` user instead directly matches what `prisma/seed.ts` actually creates, restoring the "run once, then no-op forever" behavior the wrapper's own name and doc comment promise.

### What changes in behavior after this fix

| | Before (current) | After (proposed) |
|---|---|---|
| First boot on an empty database | Creates `admin@demo.ordervora.example` (`Role.ADMIN`, password `OrdervoraDemo!23`, public), 3 demo restaurants, 6 demo accounts, 70 historical demo orders | Creates exactly one `Role.ADMIN` user at the operator's own `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME`, plus the theme catalog reference data. No restaurants, no demo accounts, no demo orders. |
| Subsequent boots | Skips (guarded by `restaurant.count() > 0`) | Skips (guarded by `user.count({role: ADMIN}) > 0`) |
| Demo/beta experience availability | Automatic on every fresh deploy | Still fully available, run manually: `pnpm --filter api run seed:beta` (+ `seed:beta:orders`, `seed:beta:delivery-order` as already documented in `docs/reports/Sprint08/BETA_DEMO_GUIDE.md`) |
| `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` in `render.yaml` | Declared, prompted for, silently unused | Declared, prompted for, actually used — matches the existing `render.yaml` comment and `docs/PRODUCTION_SOURCE_OF_TRUTH.md` for the first time |

---

## 5. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Fix only prevents the issue on a database that has **never** been seeded yet. On a database where the beta seed has already run (an existing demo `Role.ADMIN` already present), this fix's guard sees `existingAdmins > 0` and skips — it will **not** retroactively create the real `ADMIN_EMAIL`-based admin. | Medium, but not applicable to the current scenario | This deployment is explicitly a **fresh, empty Supabase project** (per `docs/reports/SUPABASE_DEPLOYMENT_CHECKLIST.md` — a brand-new project, never seeded). The fix fully resolves the blocker for this deployment. Noted here only so it isn't assumed to auto-heal an already-seeded environment (e.g., the earlier Railway trial, if one was ever run). |
| `prisma/seed.ts` reads `ADMIN_EMAIL`/`ADMIN_PASSWORD` via `requireEnv()`, which throws if either is unset — this was already true before this fix, since `render.yaml` already marks both `sync: false` (required, prompted). No new failure mode introduced. | Low | Already covered by the existing Render Blueprint prompts (`docs/reports/RENDER_DEPLOYMENT_CHECKLIST.md` §16, "Before opening Render" checklist). |
| One-file diff, ~10 lines changed, no dependency additions (`@prisma/client`'s `Role` export is already used identically in `prisma/seed.ts` and `prisma/seed-beta.ts`), no schema/migration touch, no changes to `start.sh`/`render.yaml`/build config. | Low | Narrow blast radius by construction — verified against the four explicit rules in this task (no redesign, no unrelated files, no schema change, demo functionality preserved). |
| Regression risk: does the new guard correctly skip on a database that already has a real admin (post-fix, second deploy)? | Low | Directly testable — see verification plan below; this is the same idempotent-guard *pattern* already proven correct in the Phase 2C dry run, just pointed at a different condition. |

---

## 6. Verification Plan (to run after approval, before this is considered done)

Re-run the same dry-run method already used in Phase 2C (`docs/reports/DEPLOYMENT_BLOCKERS.md`), against a fresh local PostgreSQL database:

1. `prisma migrate deploy` on an empty database (already proven clean — 13/13 migrations).
2. Build (`pnpm run build`), then run `node dist/scripts/seed-if-empty.js` with `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` set.
3. Confirm: exactly one `User` row exists, with `role = ADMIN` and `email` equal to the configured `ADMIN_EMAIL` — **not** `admin@demo.ordervora.example`.
4. Confirm: zero `Restaurant` rows exist.
5. Confirm: `Theme` rows exist (catalog seeded).
6. Run `node dist/scripts/seed-if-empty.js` a second time — confirm it logs `"... ADMIN user(s) already present, skipping bootstrap seed."` and performs no further writes.
7. Confirm `/health` and `/ready` still return `200` after boot (unaffected by this change, but re-confirm as a regression check).
8. Separately, confirm the demo path still works untouched: `pnpm --filter api run seed:beta` against a scratch database still produces the full Sprint 08 demo environment exactly as before.

---

## 7. Rollback Plan

Trivial. This is a single-file, ~10-line change with no schema/migration component and no changes to `start.sh`, `render.yaml`, or any build configuration.

- **If not yet deployed:** `git revert` the single commit, or restore the file to its current (pre-fix) contents. No database action needed.
- **If already deployed and a rollback is wanted:** revert the commit and redeploy — the next boot's guard (`user.count({role: ADMIN})`) will see the already-created real admin and skip, so reverting does not re-trigger any seed. If the demo environment is specifically wanted after rollback, run `pnpm --filter api run seed:beta` manually (it remains fully intact and unaffected by this change either way).
- No data migration, no manual database cleanup, and no coordination with Supabase/Render configuration is required in either direction.

---

## Verdict

**Fix required before first production deploy.** Root cause identified with full supporting evidence, classified as forgotten Sprint 08 demo-convenience code never gated for general production use, and confirmed against `render.yaml`'s own documentation that `ADMIN_EMAIL`/`ADMIN_PASSWORD` were always meant to bootstrap the real admin. A minimal, single-file, ~10-line fix is proposed above and is **not yet implemented**, pending approval.
