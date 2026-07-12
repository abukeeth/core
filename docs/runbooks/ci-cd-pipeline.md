# CI/CD Pipeline

Part of Production Hardening Phase 2 (`PRODUCTION_HARDENING_MASTER_SPEC.md`). Describes the two GitHub Actions workflows in `.github/workflows/` and what each does and does not do yet.

## Two separate workflows, on purpose

- **`ci.yml`** — runs on every push to `main` and every pull request targeting `main`. Its only job is to answer "is this change correct" — it never deploys anything, and it never touches a production system.
- **`deploy.yml`** — runs only after `ci.yml` has completed on `main`, and only proceeds if CI's conclusion was `success`. Its job is "ship this change" — today that's a documented placeholder (see §3), because the deployment target itself (Production Hardening Phase 4) doesn't exist yet.

Keeping these as two workflow files, rather than one file with a deploy job tacked onto the end, means a CI failure can never accidentally trigger a partial deploy, and the two concerns can evolve independently (e.g. re-running a flaky CI job doesn't require re-triggering a deploy that already happened, and vice versa).

## 1. `ci.yml`

### Trigger and concurrency

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

A new push to the same branch/PR cancels the previous, still-running CI run for that ref — avoids burning runner time on a commit that's already been superseded. This was already in place before Phase 2; unchanged here.

### Job 1 — `migration-check`

Fast (no dependency install), fails a pull request immediately if `apps/api/prisma/schema.prisma` changed without a corresponding new `.../migrations/.../migration.sql` file in the same diff. This is the CI-enforced half of the migration policy `docs/runbooks/database-setup.md` §5 documents — the check exists so "every schema change gets its own migration" isn't just a policy someone has to remember, it's something the pipeline actually rejects otherwise.

Skips (rather than failing) when there's no resolvable base commit to diff against — the first push of a brand-new branch, for instance — since there's nothing meaningful to compare in that case.

### Job 2 — `verify`

Everything that was in the original single CI job, plus what Phase 2 added:

| Step | Status |
|---|---|
| Checkout, pnpm/Node setup with dependency caching | unchanged |
| Install dependencies | unchanged |
| `prisma validate` | unchanged |
| `prisma generate` | unchanged |
| **`prisma migrate deploy`** | **new** — applies the Phase 1 migration history to a real Postgres service container (below), verifying it in CI on every run rather than only having been verified once, by hand, when it was written |
| Lint | unchanged |
| Typecheck | unchanged |
| **`pnpm run test`** | **new** — the test suite was never run in CI before Phase 2; this is PR-2's core fix |
| Build | unchanged |
| **Artifact upload on test/build failure** | **new** — see §1.3 |

#### 1.1 Postgres service container

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ordervora_ci
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

A throwaway Postgres 16 instance, matching the version the Phase 1 migration was generated and verified against, that exists only for the lifetime of this CI run. `DATABASE_URL` in the job's `env:` block points at it. This gives `prisma migrate deploy` something real to apply against on every single CI run — the same command, run the same way, that a real production deploy uses (see `docs/runbooks/database-setup.md` §3) — rather than only ever having been verified once, locally, when the migration was written.

The existing test suite itself is fully mocked (no test file makes a real database call), so this Postgres service exists specifically to verify the migration applies cleanly, not to back the test run.

#### 1.2 Non-secret placeholder environment variables

```yaml
env:
  DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ordervora_ci?schema=public
  JWT_ACCESS_SECRET: ci-placeholder-not-a-real-secret
  JWT_REFRESH_SECRET: ci-placeholder-not-a-real-secret-either
  JWT_ACCESS_TTL: 15m
  JWT_REFRESH_TTL: 30d
  FRONTEND_URL: http://localhost:3000
```

`lib/jwt.ts` reads `JWT_ACCESS_SECRET`/`JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` at module-load time and throws if any is unset — several test files already set their own throwaway values for exactly this reason (e.g. `rate-limit-registration.test.ts`). These job-level values mean the constraint is satisfied everywhere in the job, not file-by-file, and it's obvious at a glance that none of these are real secrets (they're deliberately named to be self-documenting: `ci-placeholder-not-a-real-secret`).

#### 1.3 Artifact uploads on failure

```yaml
- name: Test
  run: pnpm run test 2>&1 | tee test-output.log

- name: Upload test output (on failure)
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: test-output
    path: test-output.log
    retention-days: 14
```

(and identically for the build step). GitHub Actions' default bash shell runs with `pipefail`, so `tee`ing the command's output to a log file doesn't swallow its exit code — the step still fails correctly if the underlying command fails, and the full output is captured either way. `if: failure()` means the artifact only gets uploaded when something actually went wrong, keeping the common case (everything passes) free of unnecessary uploads. `retention-days: 14` keeps these from accumulating indefinitely.

## 2. `deploy.yml`

```yaml
on:
  workflow_run:
    workflows: ["CI"]
    branches: [main]
    types: [completed]

concurrency:
  group: deploy-production
  cancel-in-progress: false
```

Fires when the `CI` workflow completes on `main` — the `deploy` job then checks `github.event.workflow_run.conclusion == 'success'` and does nothing at all if CI failed. This is deliberately how "only deploy after CI passes" is enforced here: GitHub branch-protection rules (requiring a status check before merge) are a repository-settings change this workflow file cannot make on its own — flagged explicitly rather than silently assumed done. `workflow_run` gating is the code-side equivalent, and it's sufficient on its own even without the settings change, since `deploy.yml` literally cannot proceed unless the referenced CI run succeeded.

`cancel-in-progress: false` on the deploy concurrency group is intentional and different from CI's: a deploy that's already underway should finish, not be cancelled mid-flight by a second push — the next push's deploy simply waits its turn.

### 2.1 What this workflow actually does today

Three real steps run every time it fires: checkout the exact commit CI validated, install dependencies, `prisma validate` + `prisma generate` as a final sanity check. Then:

- **A conditional migration step**, guarded by `vars.PRODUCTION_DATABASE_URL_CONFIGURED == 'true'` — today this repository variable doesn't exist, so the step is skipped every time, safely. Once a real production database exists (Production Hardening Phase 1's setup guide, pointed at a real provider instead of this sandbox's local Postgres) and `PRODUCTION_DATABASE_URL` is added as a repository secret with that variable set to `true`, this step becomes the actual `prisma migrate deploy` against production.
- **A deploy placeholder step and a smoke-test placeholder job** — both explicitly print that they're pending Production Hardening Phase 4 (Deployment Architecture & Containerization) and do nothing else. No Docker build, no registry push, no container rollout — per this phase's explicit scope boundary, that work belongs to Phase 4, not Phase 2.

### 2.2 Why this shape, not "wait to write deploy.yml until Phase 4"

Writing the workflow's shape now — trigger, gating, concurrency, the migration step wired but inert — means Phase 4 only has to fill in the actual container build/push/rollout steps, not design the surrounding pipeline from scratch. It also means this workflow is real and testable today (it will actually run, and correctly do nothing destructive) rather than being vaporware until Phase 4 lands.

## 3. What Phase 2 deliberately does not include

- **Branch protection requiring the CI check to pass before merge** — a GitHub repository-settings change, not something achievable by editing a workflow file. Needs to be configured separately (Settings → Branches → protect `main` → require the `verify` and `migration-check` status checks).
- **Docker builds, image registry pushes, or any containerized deployment** — Production Hardening Phase 4 scope, explicitly excluded from this phase per instruction.
- **Redis, caching, or any other Phase 5+ infrastructure** — untouched.
- **Any change to application source code** (`apps/api/src`, `apps/web/src`) — this phase is pipeline configuration and documentation only.

## 4. Local reproduction

Every step `ci.yml` runs can be reproduced locally with a real Postgres instance:

```bash
# Start a local Postgres 16 (adjust to however Postgres is available locally —
# a system service, or `docker run postgres:16` once Phase 4/local tooling exists)
createdb ordervora_ci

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ordervora_ci?schema=public"
export JWT_ACCESS_SECRET="local-placeholder"
export JWT_REFRESH_SECRET="local-placeholder-2"
export JWT_ACCESS_TTL="15m"
export JWT_REFRESH_TTL="30d"

pnpm install --frozen-lockfile
pnpm --filter api exec prisma validate
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

This exact sequence (env vars, database name, and all) was used to verify Phase 2's `ci.yml` changes in the sandbox that authored this document, before they were ever pushed to a real GitHub Actions runner.
