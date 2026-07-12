# Production Hardening Master Specification

**Status:** Planning document only. **No code has been written or changed as part of this document.** This is not Sprint 08 — it is the detailed implementation plan for the 12 production-readiness gaps (PR-1 through PR-12) identified in `SPRINT_07_8_PRODUCTION_AUDIT.md`, split into phases for review and separate approval.

**Ground rule:** each phase below requires its own explicit go-ahead before implementation begins, the same plan → approve → implement → verify → report cycle already used for Sprint 07.6's Critical fixes and Sprint 07.7's High fixes. Nothing in this document should be read as authorization to start writing code.

**Environment caveat:** this development environment has no reachable Postgres, Redis, or object-storage endpoint (`pg_isready` returns no response here; there is no `prisma/migrations/` directory because no migration has ever been run against a real database — see PR-1). Several phases below (1, 4, 5, 7, 10, 11 in particular) can only be *fully* verified in an environment with real infrastructure access, or against local containers (`docker-compose`) standing in for that infrastructure. Where a phase's verification requires infrastructure this sandbox cannot provide, that is called out explicitly rather than glossed over.

---

## 1. Traceability — PR-1 through PR-12

| ID | Finding (from Sprint 07.8 audit) | Addressed by |
|----|-----------------------------------|--------------|
| PR-1 | No Prisma migration ever generated/applied — no `prisma/migrations/` directory | **Phase 1** |
| PR-2 | CI never runs the test suite | **Phase 2** |
| PR-3 | No Dockerfile / hosting configuration anywhere | **Phase 4** |
| PR-4 | Every rate limiter uses an in-memory store — breaks past one instance | **Phase 5** |
| PR-5 | SMS and push notification channels are stubs | *Out of scope — see §3* |
| PR-6 | Only 1/6 payment providers, 2/5 fulfillment methods are real | *Out of scope — see §3* |
| PR-7 | Frontend test coverage ~4% | *Out of scope — see §3* |
| PR-8 | No security-headers middleware | **Phase 4** (folded into deployment hardening) |
| PR-9 | No structured logging/error-tracking/APM | **Phase 9** |
| PR-10 | No DB connection-pooling strategy for multiple instances | **Phase 1** + **Phase 11** |
| PR-11 | No caching layer for read-heavy public traffic | **Phase 5** (optional sub-item) |
| PR-12 | `LoyaltyAccount`/`GiftCard` fully dead schema | *Out of scope — see §3* |

### §3 — Explicitly out of scope for this spec

PR-5, PR-6, PR-7, and PR-12 are **feature-completeness and test-coverage gaps**, not infrastructure/deployment gaps — they don't belong in a plan about migrations, hosting, Redis, workers, storage, monitoring, backups, secrets, and scaling, which is what you asked this document to cover. They're listed here only so nothing from the Sprint 07.8 audit is silently dropped from tracking:

- **PR-5** (SMS/push stubs) and **PR-6** (payment/delivery provider stubs) are "build the real adapter" work, following the exact registry pattern already established for Stripe — this is product/integration work for a future sprint, not infrastructure hardening.
- **PR-7** (frontend test coverage) is a testing-discipline gap to close incrementally as frontend code is touched, not a phased infra rollout.
- **PR-12** (dead Loyalty/GiftCard schema) is a product decision (build the feature, or remove the dead models) with no infrastructure dependency either way.

If you'd like a companion spec for PR-5/6/7/12, say so explicitly — it would be a materially different document (feature specs, not infra phases).

---

## 2. Recommended Execution Order (not the order the topics were listed in)

The 11 phases below are numbered by **dependency order**, not by the order "Database migrations, Production PostgreSQL, CI/CD, Redis, ..." was listed in the request. Two sequencing points are important enough to flag before the phase-by-phase detail:

- **Object storage (Phase 7) must land before, or as part of, the first real production deployment cutover (Phase 4) — not after it.** Container filesystems are ephemeral: if Phase 4 ships `apps/api` in a container writing menu-import uploads and published site pages to local disk (today's behavior), every redeploy silently deletes them. This is a trap the topic list's ordering would walk into if followed literally.
- **Monitoring (Phase 9) should land before Phase 4's cutover, not after.** The first real production deploy is the single highest-risk moment in this entire plan; it should not be the one moment with no observability.

```
Phase 1  Database Migrations & Production PostgreSQL   ─┐
Phase 2  CI/CD Hardening                                 │  foundational,
Phase 3  Secrets Management                               │  parallelizable
Phase 9  Monitoring & Logging (pulled forward)            │
                                                          ─┘
Phase 4  Deployment Architecture & Containerization  ← depends on 1, 2, 3
Phase 7  Object Storage Migration                     ← must land with/before 4's cutover
Phase 5  Redis Introduction                           ← depends on 4 (new service in the topology)
Phase 6  Background Worker Hardening                  ← depends on 5 (if BullMQ) or 1 (if DB-locking)
Phase 8  Image Optimization                           ← depends on 7
Phase 10 Backups & Disaster Recovery                  ← depends on 1 and 7 (final production form)
Phase 11 Scaling Strategy & Load Validation            ← depends on everything above; capstone
```

Phases 1/2/3/9 can genuinely run in parallel (different files, no shared dependency). Everything from Phase 4 onward is sequential in practice even though some of it is technically independent, because it all converges on "what does the first real production deployment look like."

---

## Phase 1 — Database Migrations & Production PostgreSQL

**Addresses:** PR-1, PR-10 (partial)

**Objective:** Establish a real, reviewable migration history, and choose/configure a production-grade Postgres setup — the single most foundational gap, since nothing else in this plan can be honestly verified against a database that has never been migrated.

**Work items:**
1. Provision (or use a local `docker-compose` Postgres for interim development) a real, empty Postgres instance and run `prisma migrate dev --name init` against it to generate the **baseline migration** capturing the entire current schema as of this PR — every commerce, website, auth, and import model built across Sprints 01–07.7 in one reviewed initial migration.
2. Review the generated SQL by hand before treating it as the baseline — expect this to be entirely `CREATE TABLE`/`CREATE TYPE`/`CREATE INDEX` statements with no risk, since there is no existing data anywhere to migrate away from.
3. Commit `apps/api/prisma/migrations/` (including the generated `migration_lock.toml`) to the repository for the first time.
4. Replace every `prisma generate`-only deploy step with `prisma migrate deploy` (the non-interactive, production-safe command) as an explicit pre-boot step, run once per deploy, before any new instance starts serving traffic.
5. Establish an ongoing policy: every future schema change is its own migration file, reviewed like any other code change — never a hand-edited `schema.prisma` pushed with `db push` against production. This replaces, rather than merely supplements, the schema-first-no-migration workflow every prior sprint has used out of necessity (no reachable database in this environment).
6. Production Postgres specifics to decide and document: managed provider selection (RDS / Cloud SQL / Neon / Supabase — present as options, not a unilateral pick, since it's a cost/ops decision), SSL-required connections, `max_connections` sizing appropriate to the connection-pooling plan finalized in Phase 11, and whether a pooled (`DATABASE_URL`) vs. direct (`DIRECT_URL`) connection split is needed for `prisma migrate` to run correctly against a pooler.

**Affected files:**
- `apps/api/prisma/migrations/**` *(new)*
- `apps/api/prisma/schema.prisma` *(no content change — becomes the diff source for migration 1)*
- `apps/api/.env.example` *(add `DIRECT_URL`, document `DATABASE_URL` production expectations)*
- `apps/api/package.json` *(new scripts: `migrate:dev`, `migrate:deploy`)*
- `.github/workflows/ci.yml` *(add a Postgres service container + migration-deploy step — ties into Phase 2)*
- `docker-compose.yml` *(new, or extended in Phase 4 — local Postgres for development/CI parity)*

**Dependencies:** none upstream. Everything else in this plan depends on this phase.

**Risk:** **Low** for generating the baseline migration itself — there is no existing production data anywhere, so there is nothing to break. **Medium-to-High** for every *future* migration once real restaurant data exists in production — column drops/renames must follow an expand-contract pattern (add new, backfill, migrate reads, then remove old in a later deploy), never a single-step destructive change.

**Rollback:** the baseline migration is additive-only against an empty database — "rollback" is simply not applying it (staying on the current, ungoverned state). Once real migrations follow real data, rollback strategy becomes provider-dependent (point-in-time restore — see Phase 10 — rather than a Prisma "down" migration, which Prisma does not natively generate).

**Verification:**
- `prisma migrate diff` between `schema.prisma` and the committed migration history shows zero drift.
- A fresh, empty Postgres instance (local container or CI service container) successfully runs `prisma migrate deploy`, after which the app boots and a basic read/write smoke query succeeds.
- CI (Phase 2) runs this same sequence on every PR.
- All 822 existing tests continue to pass unmodified (they're fully mocked and don't touch a real database, so this is a "nothing else broke" check, not a migration-correctness check — flagged honestly rather than overclaimed).

---

## Phase 2 — CI/CD Hardening

**Addresses:** PR-2, PR-3 (pipeline half)

**Objective:** Make CI actually gate merges on the full verification suite — including tests, which it currently skips entirely — and stand up a real continuous-deployment pipeline once Phase 4 defines a deployment target.

**Work items:**
1. Add a `postgres:16` service container to `ci.yml`.
2. Add a `prisma migrate deploy` step against that service container (depends on Phase 1 existing).
3. Add `pnpm run test` (both `apps/api` and `apps/web`) as a required CI step — closing PR-2 directly.
4. Add a "migration exists" check: fail the PR if `schema.prisma` changed but no new file appears under `prisma/migrations/` in the same diff.
5. Add GitHub branch-protection requiring this CI check to pass before merge to `main` — **this is a repository-settings change, not a code change**, called out explicitly since it can't be done by editing a file in this repo.
6. Add a CD workflow (`.github/workflows/deploy.yml`), gated on Phase 4's containerization: build images, push to a registry, run `prisma migrate deploy` against production, then perform a health-check-gated rollout (readiness probe from Phase 4 must pass before traffic shifts to new instances).
7. Add a post-deploy smoke-test job hitting `/health`, the new `/ready` endpoint (Phase 4), and one or two read-only public endpoints.

**Affected files:**
- `.github/workflows/ci.yml` *(modified)*
- `.github/workflows/deploy.yml` *(new)*
- `.github/workflows/migration-check.yml` *(new, or folded into `ci.yml`)*

**Dependencies:** Phase 1 (migrations must exist to deploy them); the CD half depends on Phase 4 (needs something to deploy).

**Risk:** **Low** for the CI half — worst case is a broken pipeline blocking merges until fixed, not a production incident. **Medium** once CD auto-deploys to production — mitigated entirely by the health-check-gated rollout and trivial rollback (redeploy the previous known-good image tag).

**Rollback:** revert the workflow file change; for CD specifically, redeploy the last known-good container image tag.

**Verification:**
- A throwaway PR touching an unrelated file runs the full pipeline (lint/typecheck/test/build/migration-check) and passes.
- A deliberately broken test in a throwaway branch fails the pipeline and is blocked from merging.
- The CD workflow is dry-run against a non-production target before being wired to production.

---

## Phase 3 — Secrets Management

**Addresses:** supports M-1 (encryption key rotation, from the Sprint 07.6 remediation plan) and underpins every later phase's credential handling.

**Objective:** Move off `.env` files as the only secret-management story, and add versioned key rotation for `COMMERCE_ENCRYPTION_KEY` (the BYOP credential envelope key) and a documented rotation procedure for JWT secrets.

**Work items:**
1. Select a secrets manager appropriate to the hosting decision made in Phase 4 (options: the hosting platform's own encrypted env-var store — Fly.io secrets, Render environment groups, Railway variables — or a dedicated manager like AWS Secrets Manager if Phase 4 lands on AWS). Presented as a Phase 4-dependent decision, not prescribed here.
2. Version the encryption envelope in `lib/encryption.ts`: extend the current `${iv}:${authTag}:${ciphertext}` format to `${keyVersion}:${iv}:${authTag}:${ciphertext}`. Support decrypting under any known-active key version; encrypt only under the current version. This directly resolves M-1.
3. Add a re-encryption path (a callable service function, run manually or via a one-off script) that migrates existing ciphertext to the newest key version — needed the first time a key is ever rotated, not before.
4. Write `docs/runbooks/secret-rotation.md`: what happens when `JWT_ACCESS_SECRET` rotates (every existing session is invalidated instantly, since it's not currently versioned — this must be a planned, communicated rotation, not an emergency one, unless token versioning is added as a further follow-up), and the step-by-step for rotating `COMMERCE_ENCRYPTION_KEY` safely using the re-encryption path above.
5. Audit `ci.yml`/`deploy.yml` (Phase 2) to confirm no secret is ever printed to a log (no bare `env:` dumps, no `set -x` around a step that touches a secret).

**Affected files:**
- `apps/api/src/lib/encryption.ts` *(modified — versioned envelope)*
- `apps/api/src/lib/encryption.test.ts` *(extended — old-format and new-format decrypt, rotation path)*
- `docs/runbooks/secret-rotation.md` *(new)*
- `apps/api/.env.example` *(document key-version env var convention)*

**Dependencies:** loosely depends on Phase 4's hosting decision for *which* secrets manager, but the encryption-envelope versioning work is independent and can start immediately.

**Risk:** **Medium** — getting the envelope-versioning migration wrong could make existing encrypted BYOP payment-provider credentials unreadable, which would directly break a live restaurant's ability to process payments. This is one of the few phases in this plan where a bug is a same-day payments outage, not a slow-burn capacity issue.

**Rollback:** the versioned format is backward-compatible by design (old ciphertext with no version prefix is treated as version 0 / the original format and remains decryptable indefinitely) — there is no forced migration deadline, so rollback is simply not rotating the key yet.

**Verification:**
- Unit tests decrypt both a pre-existing (unversioned) ciphertext and a newly-created (versioned) ciphertext correctly.
- A rotation dry-run against a copy of real encrypted data (once Phase 1's production database has any) succeeds and every credential remains decryptable afterward, before any real rotation is performed.
- Grep actual CI run logs (not just workflow source) for any accidental secret exposure.

---

## Phase 4 — Deployment Architecture & Containerization

**Addresses:** PR-3, PR-8 (security headers, folded in here as part of hardening the request pipeline for real traffic)

**Objective:** Define and implement the actual path from "code in this repository" to "running in production" — today this does not exist at all.

**Work items:**
1. Multi-stage `Dockerfile` for `apps/api`: Node 22 base, `pnpm install --frozen-lockfile`, `prisma generate`, TypeScript build, slim runtime stage (no dev dependencies, no build toolchain in the final image).
2. Decide `apps/web`'s deployment target explicitly: containerize it alongside `apps/api` (Next.js standalone output mode), or deploy it to a platform-native target like Vercel while `apps/api` runs in a container elsewhere. **Present both options; do not assume one** — this has real cost and operational-complexity tradeoffs (Vercel is simpler for a Next.js app specifically; a single container host for both is simpler operationally if you don't want two different deployment systems to reason about).
3. `docker-compose.yml` at the repo root: `api` + `web` + `postgres` (Phase 1) + `redis` (Phase 5) + a local S3-compatible service like MinIO (Phase 7) — this is also the first time this project gains a way to exercise its own migrations, and its full stack, against real infrastructure locally, closing a gap that has constrained every prior sprint's testing.
4. Add `HEALTHCHECK` directives to each container image, backed by the existing `/health` (liveness) endpoint.
5. Add a new `/ready` endpoint distinct from `/health`: verifies live DB connectivity (and Redis once Phase 5 lands) before a load balancer routes traffic to a new instance — `/health` today only reports process uptime, which is not sufficient for a safe rolling deploy.
6. Add `helmet` (or equivalent) middleware to `app.ts` for baseline security headers (CSP, `X-Frame-Options`, HSTS) — closes PR-8 as part of hardening the production request pipeline rather than as an isolated change.
7. Define the zero-downtime rollout contract: `prisma migrate deploy` runs once, before any new instance starts (never per-instance); only backward-compatible (expand-then-contract) migrations are permitted in a rolling deploy; new instances must pass `/ready` before the load balancer sends them traffic; old instances drain in-flight requests before terminating.

**Affected files:**
- `apps/api/Dockerfile` *(new)*
- `apps/web/Dockerfile` *(new, if containerized — decision-dependent)*
- `docker-compose.yml` *(new)*
- `.dockerignore` *(new)*
- `apps/api/src/app.ts` *(add `/ready`, add `helmet`)*
- `apps/api/package.json` *(new dep: `helmet`)*

**Dependencies:** Phase 1 (migrate-deploy step), Phase 2 (CD pipeline to actually ship these images), Phase 3 (secrets injection into the container runtime). **Phase 7 (object storage) must land with or before this phase's production cutover** — see §2's sequencing callout.

**Risk:** **Medium** — this is the first real production deployment target, so the risk is primarily operational (misconfiguration, unexpected hosting cost, an overlooked env var) rather than a data-integrity risk, since the application's behavior doesn't change, only how it's packaged and run.

**Rollback:** redeploy the previous known-good container image tag; the `/ready`-gated rollout means a bad new version should never receive traffic in the first place.

**Verification:**
- `docker compose up` boots the full stack locally and the entire customer ordering flow and owner dashboard work end-to-end against a real (containerized) Postgres for the first time in this project's history.
- `/ready` returns `503` when the database is unreachable and `200` when healthy.
- A staged (non-production) deploy through the Phase 2 CD pipeline succeeds and passes its smoke test.
- Security headers are present on a real HTTP response (`curl -I` against a running instance).

---

## Phase 5 — Redis Introduction

**Addresses:** PR-4 (rate-limiter store), PR-11 (caching, optional sub-item)

**Objective:** Add a shared, multi-instance-safe store, primarily to fix rate limiting's in-memory-store gap, and optionally to enable a first caching layer for read-heavy public traffic.

**Work items:**
1. Add `ioredis`; add `REDIS_URL` to `.env.example`; add a `redis` service to `docker-compose.yml` (Phase 4).
2. Add `lib/redis.ts` — a single shared client, mirroring `lib/prisma.ts`'s singleton pattern already used throughout this codebase.
3. Swap every limiter in `middleware/rate-limit.ts` (`authRateLimiter`, `checkoutRateLimiter`, `customerAuthRateLimiter`, `publicCommerceRateLimiter`, `webhookRateLimiter`, `staffActionRateLimiter`) from the default in-memory store to a Redis-backed store (`rate-limit-redis` or equivalent) — an additive `store:` config change per limiter, no change to any limit's actual threshold values.
4. Decide and document explicit fail-open behavior: if Redis is unreachable, rate limiting must degrade to "not enforced" rather than blocking all traffic — a rate-limiter outage must never itself become a checkout-blocking outage.
5. *(Optional within this phase, can be deferred to a follow-up if timeline pressure requires shipping the rate-limiter fix sooner)* Add `lib/cache.ts`: a short-TTL (30–60s) cache-aside helper for the specific public, read-heavy endpoints named in PR-11 (published site pages, public menu reads), invalidated on publish/menu-update where straightforward, with the same fail-open contract as the rate limiter (Redis unavailable → serve uncached, never error).

**Affected files:**
- `apps/api/src/middleware/rate-limit.ts` *(modified)*
- `apps/api/src/lib/redis.ts` *(new)*
- `apps/api/src/lib/cache.ts` *(new, if caching included)*
- `apps/api/package.json` *(new deps)*
- `docker-compose.yml` *(add redis service)*

**Dependencies:** practically sequenced after Phase 4 (new service in the deployment topology), though not strictly required to wait.

**Risk:** **Low** for the rate-limiting migration — purely additive store swap, verifiable against the existing `rate-limit-registration.test.ts` structural-test pattern plus new behavioral tests. **Medium** if caching is included in the same phase — cache invalidation is a classic source of stale-data incidents; recommend shipping rate limiting first and caching as its own follow-up if there's any doubt about invalidation correctness for a given endpoint.

**Rollback:** revert the store config back to in-memory (functionally regresses to today's single-instance-only behavior, not a data-loss risk).

**Verification:**
- Two local instances (Docker Compose replicas) sharing one Redis enforce a combined limit correctly (not N-per-instance) under a scripted burst of requests.
- Redis unavailability (stop the container) does not crash the app or block legitimate traffic — confirms the fail-open contract.
- If caching is included: a published-site page reflects an update within the TTL window, and cache-miss/cache-hit paths both return correct content in a dedicated test.

---

## Phase 6 — Background Worker Hardening

**Addresses:** the explicitly-documented single-instance limitation of `outbox-worker.ts`/`outbox-scheduler.ts` (H-11) and `stale-offer-scheduler.ts`/`expireStaleOffers` (C-11) — carried-forward residual risk from Sprint 07.6/07.7, now made concrete as part of PR-4's broader "in-memory/single-instance" theme.

**Objective:** Make these two background jobs safe to run on more than one instance simultaneously, closing the gap both fixes' own remediation notes flagged as "the natural next step" for horizontal scaling.

**Work items:**
1. **Option A (smaller, faster to ship):** add `SELECT ... FOR UPDATE SKIP LOCKED`-based claiming to `processOutboxBatch` and `expireStaleOffers`, so concurrently-polling instances each claim a disjoint batch of rows instead of racing over the same ones. Requires only a Prisma raw-query change to each function's row-selection step — no new infrastructure dependency.
2. **Option B (larger, more capability):** migrate both jobs from bare `setInterval` polling onto a real job queue (`BullMQ` on the Phase 5 Redis), gaining built-in distributed locking, job history, retry/backoff, and dead-letter handling as a side effect — meaningfully better observability than either today's `setInterval` or Option A's raw-SQL claim, at the cost of a new dependency and slightly more moving parts.
3. **Recommendation:** ship Option A first if Phase 5 hasn't landed yet or if timeline is tight (it's a self-contained, low-risk change); treat Option B as the natural upgrade once Redis already exists from Phase 5, since the marginal cost of adopting BullMQ at that point is small and the observability gain is real.

**Affected files:**
- `apps/api/src/modules/commerce/events/outbox-worker.ts` *(modified)*
- `apps/api/src/modules/commerce/fulfillment/fulfillment.service.ts` *(`expireStaleOffers`, modified)*
- `apps/api/src/lib/job-queue.ts` *(new, only if Option B is chosen)*
- `apps/api/src/index.ts` *(wiring change if Option B is chosen)*
- Corresponding `.test.ts` files for both modified functions

**Dependencies:** Option A depends only on Phase 1 (a real database to test the locking behavior against meaningfully — though the existing mocked unit tests can verify the *query shape*, not real concurrent-claim behavior). Option B depends on Phase 5.

**Risk:** **Medium** — correctness-sensitive by nature (the whole point is fixing a concurrency bug), but meaningfully de-risked by the fact that both jobs are already designed for at-least-once, idempotent delivery (H-11's own documented tradeoff) — this phase reduces the *likelihood* of double-processing, it doesn't introduce a new failure mode where none existed, since double-processing was already a known, accepted risk pre-fix.

**Rollback:** revert to the single-instance-only `setInterval` approach; operationally, this means reverting to running exactly one instance of the worker (achievable by only running these schedulers on a designated "leader" instance until the fix is re-attempted).

**Verification:**
- A dedicated integration-style test runs two concurrent instances of the batch-processing function against one (real, containerized) database/queue, seeds N events, and confirms all N are processed with no event silently skipped and no double-count in the final tally.
- Existing unit tests (`outbox-worker.test.ts`, `fulfillment.service.test.ts`'s `expireStaleOffers` coverage) continue to pass unmodified where they test single-instance behavior.

---

## Phase 7 — Object Storage Migration

**Addresses:** supports Phase 4's container durability requirement (local disk in a container is ephemeral — see §2's sequencing callout) and is a prerequisite for a real Phase 10 backup story.

**Objective:** Move `fileStorage` (import uploads — menu PDFs/photos) and `releaseStorage` (published website pages/assets) off local disk onto durable, shared object storage.

**Work items:**
1. Implement `S3FileStorage implements FileStorage` and `S3ReleaseStorage implements ReleaseStorage` — **both interfaces already exist today specifically for this purpose** (`file-storage.ts`'s own comment: *"Swappable for S3/GCS later without changing any caller"*; `release-storage.ts`: *"same swappable-interface pattern"*). This is genuinely additive work, not a rewrite of any calling code in the imports or sites modules.
2. Add an S3-compatible client dependency (`@aws-sdk/client-s3` or similar) — deliberately provider-agnostic, since many object-storage providers (Cloudflare R2, Backblaze B2, MinIO for local dev) speak the same S3 API.
3. New env vars: `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ENDPOINT` (for non-AWS providers); credentials sourced from Phase 3's secrets manager.
4. Swap each module's exported singleton behind an env-driven factory (local disk for development, real object storage for production) — no caller-visible change either way, preserving the exact abstraction boundary already drawn.
5. A one-time migration script to copy any existing local-disk files to the new bucket — expected to be a no-op today (no production deployment has ever existed to have accumulated files), but written for reuse the next time storage providers change.
6. Decide public-asset serving strategy explicitly: direct-from-bucket via CDN (faster, offloads the API, recommended for content with no auth requirement — site assets, menu images) vs. proxied through the API (simpler auth story, slower). Recommend direct-from-CDN for this codebase's public content.

**Affected files:**
- `apps/api/src/lib/file-storage.ts` *(modified — factory + new S3 implementation)*
- `apps/api/src/lib/release-storage.ts` *(modified — factory + new S3 implementation)*
- `apps/api/src/app.ts` *(the local-disk `/assets` static route becomes conditional, or is removed once direct-from-CDN serving is live)*
- `apps/api/package.json` *(new dep)*
- `docker-compose.yml` *(add MinIO for local development)*
- `apps/api/.env.example`

**Dependencies:** Phase 3 (credentials), and must land with-or-before Phase 4's production cutover (not strictly "before" in calendar time, but the cutover must not go live without it).

**Risk:** **Medium** — arguably the riskiest phase from a customer-visible standpoint, since it touches every uploaded menu image, every imported PDF/photo, and every published website's actual served content. A bug here is directly and immediately customer-visible (broken images, a 404 on a live storefront) rather than a slow-burn capacity issue like most of the other phases.

**Rollback:** the factory pattern means reverting to the local-disk implementation is a one-line env-var change, not a code revert — provided no data has been written *only* to the new backend yet (a real cutover would need the migration script from work item 5 run in reverse, or simply keeping both backends readable during a transition window).

**Verification:**
- A full round-trip test per storage backend: save then read returns byte-for-byte identical content, for both `FileStorage` and `ReleaseStorage`.
- The entire import → review → approve flow, and the entire generate → publish → view-live-site flow, are run end-to-end against real S3-compatible storage (e.g., MinIO in a staged environment) before this is called done.
- The existing import/sites test suites pass **unmodified** — they mock the interface, not the implementation, which is exactly the point of the abstraction having been drawn correctly back in Sprints 04/06. If any existing test needs to change to accommodate this phase, that's a signal the abstraction boundary was violated somewhere and needs a second look before proceeding.

---

## Phase 8 — Image Optimization

**Addresses:** builds on Phase 7; not itself one of PR-1..PR-12, but explicitly requested in this spec's scope.

**Objective:** Add real image processing for menu-item photos and site assets, rather than storing and serving full-resolution originals everywhere.

**Work items:**
1. Add `sharp` for server-side resizing at upload/import time — menu item photos, imported menu images (from the Website/Google Maps/PDF/Image import adapters), and site brand images. Generate a small fixed set of variants (thumbnail/card/full) rather than one full-resolution file reused everywhere.
2. Present the CDN-based on-the-fly transform alternative (Cloudflare Images, or an S3+CloudFront+Lambda@Edge resizer) as a later option if Phase 11's load testing shows server-side resizing at upload time isn't sufficient — recommend starting with `sharp` at upload time since it requires no new infrastructure dependency beyond what Phase 7 already introduces.
3. Audit `apps/web`'s existing image-rendering components to confirm they're pointed at the new optimized variants once they exist, not full-resolution originals passed straight through.
4. Explicit failure contract: a resize failure must never block the underlying upload/import — fail open by falling back to the original file.

**Affected files:**
- `apps/api/src/lib/image-processing.ts` *(new)*
- `apps/api/src/modules/imports/**` adapters *(call the resizer before storage, where relevant)*
- `apps/api/src/modules/sites/asset.service.ts` *(call the resizer for uploaded site images)*
- `apps/api/package.json` *(new dep: `sharp`)*
- `apps/web` image-rendering components *(audit only — likely no change needed if already using `next/image` correctly)*

**Dependencies:** Phase 7.

**Risk:** **Low-to-Medium** — additive processing step with a defined fail-open contract; the main risk is processing latency added to the import/upload path, mitigated by keeping resize operations synchronous-but-fast (small fixed set of variants) rather than trying to generate every conceivable size on demand.

**Rollback:** disable the resize call site, fall back to storing/serving originals (functionally regresses to today's behavior, no data loss).

**Verification:**
- Unit tests for the resizer: correct output dimensions/format for known inputs.
- An uploaded menu photo round-trips through import → resize → storage → renders correctly in both the owner dashboard and the public menu page.
- A deliberately corrupted image input still completes the underlying import/upload (confirms the fail-open contract), just without a resized variant.

---

## Phase 9 — Monitoring & Logging

**Addresses:** PR-9

**Objective:** Replace ad hoc `console.error`/`console.log`/`console.debug` with structured logging, add error tracking, and add basic metrics — and land this *before* Phase 4's production cutover, since that cutover is this plan's single highest-risk moment and should not be the one with no visibility.

**Work items:**
1. Add a structured logger (`pino` — chosen for its low overhead and native JSON output) behind a small `lib/logger.ts` wrapper.
2. Migrate every existing `console.error`/`console.log`/`console.debug` call site across `apps/api/src` to the structured logger, with consistent fields (`requestId`, `restaurantId` where available, module name). This includes, notably: every `bestEffort()`-adjacent catch block (the whole point of `bestEffort()` is to swallow-and-log rather than throw — today that "log" is a bare `console.error`, which this phase upgrades without changing the swallow-and-never-throw contract), and H-10's event-bus debug-log subscriber.
3. Add request-correlation middleware: assign a request ID early in `app.ts`, propagate it via `AsyncLocalStorage` so logs from background-triggered work (e.g., a `bestEffort()` failure inside a request handler) can still be tied back to the originating request.
4. Add error tracking (Sentry or equivalent): capture unhandled exceptions, and explicitly wire every `bestEffort()`-swallowed error into it too — this directly closes the residual risk noted repeatedly since C-2/C-15/H-12 ("an in-process try/catch cannot protect against the process itself dying" — error tracking doesn't prevent that, but it does make every *other* swallowed-but-real failure actually visible in production instead of silently living only in a log file no one is watching).
5. Add basic application metrics: request latency/count by route, background-worker batch sizes/durations (Phase 6), payment-provider success/failure rates — exported via a `/metrics` endpoint (Prometheus-style) or the chosen APM vendor's SDK.
6. Extend `/health`/`/ready` (Phase 4) to report last-successful background-job-poll timestamps, so a stuck worker is externally observable, not just discoverable by reading logs after the fact.

**Affected files:**
- `apps/api/src/lib/logger.ts` *(new)*
- Every existing `console.error`/`console.log`/`console.debug` call site across `apps/api/src` *(mechanical migration, module by module)*
- `apps/api/src/app.ts` *(correlation-ID middleware, `/metrics` endpoint, extended `/health`/`/ready`)*
- `apps/api/package.json` *(new deps: `pino`, `pino-http` or equivalent, error-tracking SDK)*

**Dependencies:** none blocking — can start immediately and in parallel with Phases 1–3. Should complete before Phase 4's cutover.

**Risk:** **Low** — purely additive/observational, no business-logic behavior change, only what gets recorded about it. The only real risk is logging overhead on hot paths (checkout), mitigated by using a low-overhead async logger and sampling detailed traces rather than capturing everything in full.

**Rollback:** revert the logger wrapper to `console.*` calls (functionally regresses to today, no data loss); disable the error-tracking SDK via env var if it introduces unexpected overhead or noise.

**Verification:**
- A deliberate error in a non-production environment appears in the error-tracking dashboard with correct context (request ID, restaurant ID where applicable).
- An existing `bestEffort()` failure-path unit test (already asserting "does not throw") is extended to also assert the structured logger/error-tracker was invoked, not just that the function returned normally.
- A before/after latency comparison on one hot endpoint (checkout) confirms logging overhead is negligible.

---

## Phase 10 — Backups & Disaster Recovery

**Addresses:** supports Production PostgreSQL (Phase 1) and Object Storage (Phase 7) reaching a genuinely production-safe state.

**Objective:** Ensure the production database and object-storage bucket are backed up and **restorable** — configured backups that have never been restored are not verified backups.

**Work items:**
1. Enable automated daily Postgres backups via the managed provider chosen in Phase 1 (most offer this natively), with a retention window (7–30 days, tune based on cost/requirements).
2. Enable point-in-time recovery (PITR) if the provider supports it, so a specific bad migration or bad data change can be rolled back to an exact timestamp rather than only the last daily snapshot.
3. Enable object-storage versioning/lifecycle rules on the Phase 7 bucket, so an accidental overwrite or delete of a published site's assets is recoverable.
4. **Actually execute a restore drill**: restore the latest backup into a throwaway database, boot the app against it, confirm data integrity and correct startup. This must happen at least once before backups are considered "working," not just configured.
5. Write `docs/runbooks/disaster-recovery.md`: access list, RTO/RPO targets, step-by-step restore procedure, and how to communicate a restore-in-progress incident to affected restaurants.

**Affected files:**
- Mostly infrastructure/provider configuration, not repository code.
- `docs/runbooks/disaster-recovery.md` *(new)*
- `scripts/restore-drill.sh` *(new, optional — if the provider's restore flow is scriptable)*

**Dependencies:** Phase 1 (database) and Phase 7 (object storage), both in their final production form.

**Risk:** **Low** to configure. The risk this phase exists to close is the *absence* of a tested backup — a high-severity latent risk that should be closed before Phase 1's production database holds any real restaurant data worth losing.

**Rollback:** not applicable in the usual sense — this phase is itself the rollback mechanism for every other phase's failure modes.

**Verification:** the restore drill (work item 4) **is** the verification. Re-run it periodically (recommend quarterly) as an ongoing practice, not a one-time checkbox — a drill that was only ever run once, a year ago, provides limited confidence about today's restore procedure.

---

## Phase 11 — Scaling Strategy & Load Validation

**Addresses:** PR-10 (connection pooling, empirically tuned rather than guessed) and directly answers the Sprint 07.8 audit's Q3/Q4 with measured numbers instead of qualitative assessment.

**Objective:** Exercise everything built in Phases 1–10 under realistic multi-instance, multi-tenant load, and produce concrete capacity numbers.

**Work items:**
1. Load test (k6 or autocannon) the checkout hot path specifically — the most write-contended path in the system: coupon-redemption re-check under `Serializable` isolation, idempotency-key reservation, `OutboxEvent` writes — at simulated 10-restaurant and 100-restaurant concurrent-order volumes.
2. Confirm horizontal scale-out actually works end-to-end: 2+ API instances behind a load balancer, sharing the Phase 5 Redis and Phase 1 Postgres, with Phase 6's worker-locking active; confirm no double-processing and no rate-limit inconsistency under load.
3. Tune Postgres connection-pool sizing (`connection_limit` on `DATABASE_URL`, or a transaction-mode PgBouncer pool) based on **observed** connection counts under load, not the guesswork this plan would otherwise be operating on.
4. Identify the first real bottleneck empirically. This spec's prediction, to be confirmed or refuted by the load test rather than assumed: Postgres write contention on `Order`/`CouponRedemption`/`IdempotencyKey` under `Serializable` isolation, or the single-primary database itself, will bottleneck before the (by then stateless and horizontally-scaled) API tier does. Document whichever lever comes next once this is confirmed — a read replica for reporting/analytics queries, partitioning high-volume tables by `restaurantId` or time, or a queue in front of checkout if write contention turns out to be the actual ceiling.
5. Revisit every rate-limit threshold set in Sprint 07.6/07.7 (`checkoutRateLimiter`, `staffActionRateLimiter`, etc.) using real load-test data rather than the original estimates.

**Affected files:**
- `load-tests/**` *(new — k6/autocannon scripts, not shipped to production)*
- `docs/reports/ProductionHardening/LOAD_TEST_RESULTS.md` *(new — the results writeup)*
- Possible follow-up tuning to `middleware/rate-limit.ts` and `DATABASE_URL` connection-limit guidance, based on findings.

**Dependencies:** everything above (Phases 1–10). This is the capstone.

**Risk:** **Low** to run — load tests target a staging/throwaway environment, never production. The risk this phase exists to close is deploying to 100 restaurants having only ever validated correctness at the mocked-unit-test level, with no measured data behind the "should be fine" assessment the Sprint 07.8 audit gave for that question.

**Rollback:** not applicable — this phase produces a report and tuning recommendations, not a runtime change by itself.

**Verification:** the load-test report itself, with concrete numbers — sustained requests/sec, p50/p95/p99 checkout latency, error rate at 2x and 5x expected load, and the connection-pool exhaustion point if one is found — replacing this plan's and the Sprint 07.8 audit's qualitative capacity assessments with measured ones.

---

## Summary Table

| Phase | Topic (as requested) | Risk | Depends on |
|-------|----------------------|------|------------|
| 1 | Database migrations, Production PostgreSQL | Low → Medium/High (future migrations) | — |
| 2 | CI/CD | Low → Medium (CD to prod) | 1 |
| 3 | Secrets management | Medium | (loosely) 4 |
| 4 | Deployment architecture | Medium | 1, 2, 3 |
| 5 | Redis | Low → Medium (if caching included) | 4 |
| 6 | Background workers | Medium | 1, or 5 |
| 7 | Object storage | Medium | 3; must precede/accompany 4's cutover |
| 8 | Image optimization | Low-Medium | 7 |
| 9 | Monitoring & logging | Low | — (should precede 4's cutover) |
| 10 | Backups | Low (to configure) | 1, 7 |
| 11 | Scaling strategy | Low (to run) | 1–10 |

---

*No code has been written for any phase above. Waiting for approval — per-phase or as a whole — before any implementation begins.*
