# Production Hardening Phase 5 — Completion Report

**Redis Introduction**

Implemented per `docs/reports/Sprint07/PRODUCTION_HARDENING_MASTER_SPEC.md`, Phase 5. Addresses PR-4 (rate limiter's in-memory, single-instance-only store).

## 1. What was done

### 1.1 Shared Redis client

`apps/api/src/lib/redis.ts` — a single shared client mirroring `lib/prisma.ts`'s existing singleton pattern. `REDIS_URL` is optional (added to `config/env.ts`'s `KNOWN_ENV_KEYS` and `.env.example`, deliberately outside the core startup-validated schema): unset means `redis` is `null` and the app runs exactly as it did before this phase, with zero Redis dependency. `lazyConnect: true` avoids opening a connection at import time; a bounded `retryStrategy` (capped at 2s) means a command against an unreachable Redis fails fast rather than hanging.

### 1.2 Fail-open rate-limit store

`apps/api/src/lib/redis-rate-limit-store.ts` — a hand-written `express-rate-limit` `Store` implementation, deliberately not the third-party `rate-limit-redis` package. That package's default error-propagation would let a Redis failure surface as a `500` through `express-rate-limit` (it treats a thrown/rejected `Store` method as a hard error) — turning a Redis blip into an outage for every rate-limited route, including checkout. `RedisRateLimitStore` catches every one of its own errors (missing client, connection failure, command timeout) and degrades to "allow, don't enforce" instead: `increment()` returns a fresh single hit that's never close to any real limit, `decrement()`/`resetKey()` become no-ops. This is spec item 4's fail-open requirement made explicit and directly unit-tested, not an incidental side effect of a library's internals.

Implements a standard fixed-window counter (`INCR` + `PEXPIRE` on first hit), keyed per-limiter (`ratelimit:<prefix>:<key>`) so two different limiters sharing the same underlying key (e.g. both IP-keyed) never collide.

### 1.3 Every limiter swapped to the Redis-backed store

All nine limiters in `apps/api/src/middleware/rate-limit.ts` now pass `store: new RedisRateLimitStore("<name>")` — purely additive, no limit's threshold changed. The master spec's Phase 5 section names six by example (`authRateLimiter`, `checkoutRateLimiter`, `customerAuthRateLimiter`, `publicCommerceRateLimiter`, `webhookRateLimiter`, `staffActionRateLimiter`) under the general instruction "swap every limiter in middleware/rate-limit.ts" — this implementation applied the swap to all nine limiters in that file (also `importRateLimiter`, `siteGenerationRateLimiter`, `contactFormRateLimiter`) for consistency, so no limiter is left with the single-instance gap this phase exists to close.

### 1.4 `docker-compose.yml`: `redis` service

`redis:7.4-alpine`, persistence disabled (`--save "" --appendonly no` — rate-limit counters are disposable; losing them on a restart just resets everyone's window, not worth a volume for), `read_only: true` + a `/data` tmpfs, healthcheck via `redis-cli ping`. `api`'s `depends_on` now also gates on `redis: condition: service_healthy`, and its environment sets `REDIS_URL: redis://redis:6379`.

### 1.5 Graceful shutdown extended

`apps/api/src/index.ts`'s `SIGTERM`/`SIGINT` handler now also calls `redis?.quit()` alongside `prisma.$disconnect()`, in parallel via `Promise.allSettled` — best-effort, consistent with the rest of that handler: a failure to cleanly quit Redis never blocks or fails the rest of shutdown.

### 1.6 Caching (spec item 5) — deliberately deferred

The master spec's optional cache-aside sub-item (published site pages, public menu reads — PR-11) is explicitly deferrable in its own text ("can be deferred to a follow-up if timeline pressure requires shipping the rate-limiter fix sooner") and flagged **Medium** risk (cache invalidation correctness) versus the rate-limiter migration's **Low** risk. This phase ships the rate-limiter fix only, per that explicit recommendation — documented as a real, reasonable follow-up in `docs/runbooks/redis.md`, not silently dropped.

### 1.7 Documentation

`docs/runbooks/redis.md` (new) — what Redis is for today, the fail-open contract and why it's hand-written rather than via `rate-limit-redis`, the caching deferral rationale, local `docker-compose` usage, and graceful shutdown.

## 2. Files changed

**New:**
- `apps/api/src/lib/redis.ts`
- `apps/api/src/lib/redis-rate-limit-store.ts`
- `apps/api/src/lib/redis-rate-limit-store.test.ts`
- `docs/runbooks/redis.md`
- `docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_5_COMPLETION_REPORT.md` (this file)

**Modified:**
- `apps/api/src/middleware/rate-limit.ts` — every limiter gets a `RedisRateLimitStore`.
- `apps/api/src/index.ts` — graceful shutdown also quits the Redis client.
- `apps/api/src/config/env.ts` — `REDIS_URL` added to `KNOWN_ENV_KEYS`.
- `apps/api/.env.example` — `REDIS_URL` documented (optional, commented out).
- `apps/api/package.json` — `ioredis` added as a dependency.
- `pnpm-lock.yaml`
- `docker-compose.yml` — `redis` service; `api`'s `depends_on`/environment updated.

**Explicitly not touched:** no caching layer (§1.6), no application business logic.

## 3. Verification

| Check | Result |
|---|---|
| `prisma validate` | ✅ Pass (schema unchanged) |
| `prisma generate` | ✅ Pass |
| `pnpm run lint` (root, both apps) | ✅ Pass, no warnings |
| `pnpm run typecheck` (root, both apps) | ✅ Pass |
| `pnpm run test` (root, both apps) | ✅ **855/855 passing** (846 `apps/api` + 9 `apps/web`) — includes 9 new `redis-rate-limit-store.test.ts` tests |
| `pnpm run build` (root, both apps) | ✅ Pass |

**Real behavioral verification, not just mocks:** this sandbox has a real local Redis available (`redis-server`, started for this phase's testing). `redis-rate-limit-store.test.ts`'s "real Redis" test group runs actual `INCR`/`PEXPIRE`/`DECR`/`DEL` commands against it, confirming: first hit returns `totalHits: 1` with a real `resetTime`, repeated hits accumulate correctly, `resetKey` genuinely resets the count, `decrement` genuinely reduces it, and two limiters with different prefixes never share a counter for the same raw key.

**Additionally, the compiled server was booted end-to-end** with `REDIS_URL` pointing at that real local Redis: `GET /health` returned `200`, and a scripted burst of 12 requests against `/api/auth/login` (limit 10/min) returned `400` (bad credentials) for the first 10 and `429` (rate limited) for the 11th and 12th — confirming the limiter is genuinely enforced through Redis, not silently falling back to in-memory. `redis-cli keys "ratelimit:*"` confirmed the real key (`ratelimit:auth:127.0.0.1`) was written.

**Fail-open, also verified directly (not just asserted):** `redis-rate-limit-store.test.ts` covers both failure modes explicitly — `REDIS_URL` unset (`redis` is `null`) and every Redis command mocked to throw — confirming `increment()` returns the fail-open response and `decrement()`/`resetKey()` resolve without throwing in both cases.

**Docker Hub limitation carried forward from Phase 4**: `docker compose config` (static validation, no image pull needed) confirms the `redis` service and `api`'s updated `depends_on`/environment are syntactically correct and resolve as intended; an actual `docker compose up` pulling `redis:7.4-alpine` could not be run here for the same reason documented in Phase 4's report (this sandbox's proxy policy blocks Docker Hub image-layer downloads outright).

## 4. Notes

- Nine limiters swapped rather than the spec's illustrative six (§1.3) — a deliberate, low-risk broadening (same additive `store:` pattern, no threshold changes) so no limiter in this file keeps the single-instance gap.
- The hand-written `RedisRateLimitStore` (rather than `rate-limit-redis`) was a deliberate choice specifically to make the fail-open contract explicit and unit-testable, per the design rationale in `docs/runbooks/redis.md`.
- Caching (spec item 5) deferred per the spec's own explicit recommendation — see §1.6.

---

*Phase 5 complete. Continuing immediately to Phase 6 (Background Worker Hardening) per instruction.*
