# Production Hardening — Phase 2 Completion Report

**Phase:** 2 of 11 — CI/CD Hardening (`PRODUCTION_HARDENING_MASTER_SPEC.md`)
**Addresses:** PR-2 (CI never ran the test suite).
**Scope discipline:** exactly Phase 2's work items. No Docker, no Redis, no application source code (`apps/api/src`, `apps/web/src`) was touched — only `.github/workflows/` and one new documentation file.

---

## 1. What was done

### 1.1 `ci.yml` hardened

The existing single-job workflow (lint/typecheck/build only — no tests, no database) was split into two jobs:

- **`migration-check`** *(new)* — fast, no-install job that fails a PR immediately if `apps/api/prisma/schema.prisma` changed without a corresponding new migration file in the same diff, enforcing the migration policy `docs/runbooks/database-setup.md` §5 documents. Verified locally against three scenarios (schema changed with no migration → fails; schema changed with a migration → passes; schema untouched → passes) before being committed.
- **`verify`** *(extended)* — the original job, plus:
  - A `postgres:16` service container, giving `prisma migrate deploy` something real to apply against on every CI run — not just verified once by hand when the Phase 1 migration was written.
  - A `prisma migrate deploy` step against that service container.
  - Non-secret placeholder environment variables (`JWT_ACCESS_SECRET`, etc. — clearly named `ci-placeholder-not-a-real-secret`) so every module that reads a required env var at import time has one.
  - A `pnpm run test` step — **this is PR-2's core fix**; the test suite had never run in CI before this phase.
  - Artifact uploads (`actions/upload-artifact@v4`, `if: failure()`, 14-day retention) for both the test and build steps' captured output, so a CI failure comes with the full log as a downloadable artifact rather than requiring a rerun to see what happened.

Dependency caching (`cache: pnpm` on `actions/setup-node`) and concurrency protection (`concurrency: { group: ci-..., cancel-in-progress: true }`) were already present from the original workflow and are unchanged — both requirements were already satisfied.

### 1.2 `deploy.yml` — new, separate workflow

- Triggered via `workflow_run` on the `CI` workflow completing on `main`, proceeding only if `conclusion == 'success'` — this is the code-side enforcement of "deploy only after CI passes." (Repository branch-protection settings requiring the CI check before *merge* is a separate, repo-settings-only step this workflow cannot perform itself — flagged explicitly in the pipeline documentation rather than silently assumed done.)
- `concurrency: { group: deploy-production, cancel-in-progress: false }` — a deploy in flight is never cancelled by a subsequent push; the next one waits.
- Runs `prisma validate`/`prisma generate` as a sanity check, then a **conditional** migration step (`if: vars.PRODUCTION_DATABASE_URL_CONFIGURED == 'true'`) that is a safe no-op today since that repository variable doesn't exist yet, and becomes the real `prisma migrate deploy` against production the moment it does.
- A deploy step and a smoke-test job are explicit, labeled placeholders — they print that they're pending Production Hardening Phase 4 (Deployment Architecture & Containerization) and do nothing else. **No Docker build, no registry push, no container rollout** — per your explicit instruction not to start Docker work in this phase.

This workflow is real and would run correctly today (install → validate → generate → skip the still-unconfigured migration step → print the two placeholder messages) — it is not vaporware waiting on Phase 4, it's a working skeleton Phase 4 fills in.

### 1.3 Pipeline documented

New: `docs/runbooks/ci-cd-pipeline.md`. Covers: why CI and deploy are separate workflows, every job/step in both files and what it does, exactly what Phase 2 deliberately excludes (branch protection settings, Docker, Redis, any Phase 5+ infra, any application source change), and a copy-pasteable local-reproduction sequence for every step `ci.yml` runs — the same sequence actually used to verify these changes in this sandbox before they were committed (see §2 below).

---

## 2. Verification Performed

Since this sandbox cannot run a real GitHub Actions workflow, every step `ci.yml` now runs was reproduced locally against the same local PostgreSQL 16 instance used in Phase 1, using the exact database name, environment variables, and command sequence the workflow file specifies:

1. `prisma validate` — pass.
2. `prisma generate` — pass.
3. `prisma migrate deploy` against a fresh, empty `ordervora_ci` database (mirroring the CI service container's `POSTGRES_DB`) — applied cleanly, identical result to Phase 1's verification.
4. `migration-check`'s bash logic extracted and run standalone against three synthetic `git diff` outputs: schema changed with no migration (correctly fails, exit 1), schema changed with a migration present (correctly passes), schema untouched (correctly passes).
5. `pnpm run lint` / `pnpm run typecheck` / `pnpm run test` / `pnpm run build` — all run with the exact placeholder environment variables `ci.yml`'s `verify` job sets, confirming the workflow's env-var choices are actually sufficient for every step to succeed, not just plausible-looking.
6. Both workflow YAML files parsed successfully with a standalone YAML parser, confirming no syntax errors.
7. The throwaway `ordervora_ci` database was dropped after verification; no artifact of this local reproduction was left behind.

### Full verification suite (repo root, standard local dev database)

| Step | Result |
|------|--------|
| `prisma validate` | ✅ Pass |
| `prisma generate` | ✅ Pass |
| `pnpm -r lint` (api + web) | ✅ Pass, no warnings |
| `pnpm -r typecheck` (api + web) | ✅ Pass |
| `pnpm -r test` | ✅ **822 / 822 passing** (813 `apps/api` + 9 `apps/web`) |
| `pnpm -r build` (api `tsc`, web `next build`) | ✅ Pass, all 28 web routes compiled |

Unchanged from before this phase — expected, since Phase 2 touched no application source code.

---

## 3. Files Changed

**New:**
- `.github/workflows/deploy.yml`
- `docs/runbooks/ci-cd-pipeline.md`
- `docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_2_COMPLETION_REPORT.md` (this file)

**Modified:**
- `.github/workflows/ci.yml` — split into `migration-check` + extended `verify` jobs, as described in §1.1.

**Explicitly not touched:**
- No Dockerfile, `docker-compose.yml`, or any container tooling (Phase 4).
- No Redis client, config, or dependency (Phase 5).
- No file under `apps/api/src` or `apps/web/src` — this phase is pipeline configuration and documentation only.
- No GitHub repository settings (branch protection) were changed — this cannot be done by editing a file in this repository; documented as an outstanding manual step in `ci-cd-pipeline.md` §3.

---

## 4. Notes / What's Deliberately Deferred

- **Branch protection** requiring `ci.yml`'s checks before merge — a manual repository-settings step, documented but not performable from within this session.
- **The actual production deploy** (container build, registry push, health-check-gated rollout) — Production Hardening Phase 4 scope. `deploy.yml`'s corresponding steps are working placeholders, not implementations.
- **`PRODUCTION_DATABASE_URL` / `PRODUCTION_DATABASE_URL_CONFIGURED`** — referenced by `deploy.yml` but intentionally not created as real secrets/variables in this phase; they become real once a production database exists (Phase 1's setup guide, pointed at a real provider).

---

*Phase 2 complete. Waiting for your review before Phase 3 (Secrets Management) begins.*
