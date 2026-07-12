# Redis

Part of Production Hardening Phase 5 (`PRODUCTION_HARDENING_MASTER_SPEC.md`). Covers what Redis is used for today, the fail-open contract, and what's deliberately deferred.

## What Redis is for today

One thing only: a shared, multi-instance-safe store for rate limiting (`middleware/rate-limit.ts`). Before this phase, every limiter used `express-rate-limit`'s default in-memory `Map` — correct for a single process, silently wrong the moment more than one instance runs behind a load balancer, since each instance enforced its own independent count instead of one shared limit (PR-4).

`lib/redis.ts` is the single shared client (mirrors `lib/prisma.ts`'s singleton pattern). `lib/redis-rate-limit-store.ts` is a hand-written `express-rate-limit` `Store` implementation backed by it — hand-written rather than the third-party `rate-limit-redis` package specifically so the fail-open contract below is explicit and directly unit-tested, not an incidental side effect of a library's own error-propagation behavior.

## Configuration

`REDIS_URL` (`.env.example`) is optional, not part of the core startup-validated schema (`config/env.ts`). Leave it unset to run every limiter in-process only — identical to this codebase's behavior before this phase, fine for local development and a genuinely single-instance deployment.

## The fail-open contract

**A Redis outage must never become a checkout-blocking outage.** Every method on `RedisRateLimitStore` (`increment`, `decrement`, `resetKey`) catches its own errors internally and degrades:

- `redis` is `null` (REDIS_URL unset) → every method is effectively a no-op; `increment()` always returns a fresh single hit (`{ totalHits: 1, resetTime: undefined }`), which is never close to any configured limit.
- `redis` is configured but a command throws/rejects (connection dropped, timeout, etc.) → same fail-open response, logged via `console.error`, never thrown up through `express-rate-limit` to the caller.

This is the opposite of the naive approach (reach for `rate-limit-redis` directly): that package's default `sendCommand` lets a Redis error propagate, and `express-rate-limit` turns a thrown/rejected `Store` method into a `500` — meaning a Redis blip would 500 every rate-limited route, including checkout, exactly the outage this phase exists to prevent.

Verified directly in `lib/redis-rate-limit-store.test.ts`: fail-open with `REDIS_URL` unset, fail-open with every Redis command mocked to throw, and (against this environment's real local Redis) correct fixed-window counting, `resetKey`/`decrement` behavior, and no cross-limiter key collisions.

## Scope: rate limiting only, not caching (yet)

The master spec's Phase 5 section also lists an optional cache-aside layer for read-heavy public endpoints (published site pages, public menu reads — PR-11) as an explicit, deferrable sub-item: *"can be deferred to a follow-up if timeline pressure requires shipping the rate-limiter fix sooner"*, and separately flags it **Medium** risk versus the rate-limiter migration's **Low** risk, specifically because cache invalidation is a classic source of stale-data incidents. This phase ships the rate-limiter fix only, per that explicit recommendation — `lib/cache.ts` is a reasonable, self-contained follow-up whenever it's prioritized, not something this phase needed to rush alongside a lower-risk, more urgent fix.

## Local usage

`docker-compose.yml`'s `redis` service runs `redis:7.4-alpine` with persistence disabled (`--save "" --appendonly no`) — rate-limit counters are disposable; losing them on a restart just resets everyone's window, which is harmless and not worth provisioning a volume for. `api`'s `REDIS_URL` points at it (`redis://redis:6379`); `api` won't start until `redis`'s own healthcheck (`redis-cli ping`) passes.

## Graceful shutdown

`src/index.ts`'s `SIGTERM`/`SIGINT` handler calls `redis?.quit()` alongside `prisma.$disconnect()` — best-effort, like everything else in that handler: a failure to cleanly quit Redis never blocks or fails the rest of shutdown.
