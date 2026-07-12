# Load Test Results

Production Hardening Phase 11 (`PRODUCTION_HARDENING_MASTER_SPEC.md`). All runs executed in this sandbox against a real, throwaway local PostgreSQL 16 database (created and dropped per run, `load-tests/run-load-test.sh` — same pattern as `scripts/restore-drill.sh`) and real local Redis, driving genuine HTTP load at the compiled server (`node dist/src/index.js`) via `autocannon`, never mocks. Sandbox: 4 vCPU, 15 GB RAM.

## What was tested

`POST /api/public/checkout/:cartId/place-order` with `methodType: CASH_ON_DELIVERY` — the checkout write path the master spec calls out specifically (idempotency-key reservation, the `Order`/`OrderItem`/`Fulfillment` transaction, `OutboxEvent` writes), reached without needing a mocked or real payment provider (cash orders skip `authorizeOrderPayment` entirely — `checkout.service.ts`'s `CASH_METHOD_TYPES` branch). Each request is a genuine first-time checkout of a distinct pre-seeded cart (`load-tests/seed-load-test-data.ts`) — no cart is ever checked out twice in a run, so every non-2xx response is a real failure, not an expected repeat-submission rejection.

## Scenario 1 — ~10 restaurants (10 restaurants × 30 carts, single instance)

| Metric | Value |
|---|---|
| Total requests | 300 |
| Duration | 5.03s |
| Aggregate throughput | ~60 req/sec |
| Latency p50 / p90 / p99 | 276ms / 463ms / 583ms |
| 2xx (successful checkouts) | 104 (34.7%) |
| 5xx | 196 (65.3%) — see Finding 1 below |
| Peak Postgres connections | 10 |

## Scenario 2 — ~100 restaurants (100 restaurants × 10 carts, single instance)

| Metric | Value |
|---|---|
| Total requests | 1000 |
| Duration | 15.04s |
| Aggregate throughput | ~67 req/sec |
| Latency p50 / p90 / p99 | 574ms / 994ms / 1455ms |
| 2xx (successful checkouts) | 337 (33.7%) |
| 5xx | 663 (66.3%) — see Finding 1 below |
| Peak Postgres connections | 10 |

**Aggregate throughput is essentially identical between the two scenarios (~60 vs ~67 req/sec) despite more than 3x the request volume and more than 10x the restaurant count in Scenario 2** — this is the master spec's own predicted shape ("the first real bottleneck... Postgres... will bottleneck before the API tier does"), just not for the reason predicted (see Finding 2). Restaurant *count* isn't the ceiling; a fixed Postgres connection pool size is.

## Scenario 3 — horizontal scale-out (100 restaurants × 10 carts, 2 instances sharing one Postgres/Redis)

| Metric | Value |
|---|---|
| Total requests | 1000 (500 per instance, disjoint restaurant sets) |
| Peak Postgres connections | **20** (double Scenario 2's 10) |
| 2xx | 361 (36.1%) |

**Confirms Finding 3 below**: each instance maintains its own independent connection pool — 2 instances holding roughly 10 connections each, not 2 instances sharing one 10-connection pool. Horizontal scale-out multiplies total database connection consumption by instance count.

### Cross-instance rate-limit enforcement (Phase 5 verification under real multi-instance load)

A focused follow-up run — 2 instances, `RATE_LIMIT_CHECKOUT_PER_MINUTE=15`, `REDIS_URL` set (shared Redis-backed store, Phase 5) — sent 50 requests split across both instances (25 each, same source IP). Result: **35 requests received `429`, and only 15 total requests got past the limiter across both instances combined** (not 15 *per instance*, which would have let 30 through). This directly confirms the master spec's work item 2 requirement: the Redis-backed `RedisRateLimitStore` (Phase 5) enforces one shared threshold across every instance, not an independent one per instance — the exact property that makes horizontal scaling safe from a rate-limiting-consistency standpoint.

### Outbox worker under multi-instance load (Phase 6 verification)

Across every scenario, `OutboxEvent` rows were fully drained to `0` unprocessed (polled for up to 15s after the HTTP load finished) in every single-instance run, and no double-dispatch was observed in the 2-instance run either — consistent with Phase 6's `SELECT ... FOR UPDATE SKIP LOCKED` claiming working correctly under genuine concurrent multi-process access, not just the mocked/integration-test coverage from that phase's own verification.

## Finding 1 (the empirically-identified bottleneck — correctness, not throughput)

**Every 5xx response across every scenario was one of two distinct find-then-create race conditions**, confirmed from the compiled server's own structured logs (Phase 9), **not** connection-pool exhaustion, timeouts, or the Serializable-isolation coupon-redemption path the master spec's own prediction named as the likely first bottleneck:

1. **`nextOrderNumber()` (`apps/api/src/modules/commerce/orders/order-number.ts`)** — reads `MAX(orderNumber)+1` for the restaurant, then inserts. Two concurrent `placeOrder` transactions for the *same restaurant* both read the same "last" number under Postgres's default `READ COMMITTED` isolation (the transaction is only elevated to `Serializable` when a coupon is present — `checkout.service.ts`), and one loses to a `UNIQUE (restaurantId, orderNumber)` constraint at insert time. This function's own code comment already flagged the theoretical risk ("must run inside the same transaction... to avoid a race between reading the max and inserting") — this load test empirically confirms the mitigation described isn't sufficient at `READ COMMITTED`. This was the dominant failure across every scenario (100% of 5xx responses once Finding 1b below was isolated out — see Methodology note).
2. **Two identical lazy-singleton-config races**, both fixed find-then-create with no conflict handling: `delivery-config.service.ts::getConfig()` and `kitchen-capacity.service.ts::getCapacity()`. Both create their restaurant's settings row lazily on first access; N concurrent first-ever requests for a brand-new restaurant can all observe "no existing row" and all attempt `create()` simultaneously. Confirmed via the exact same `P2002` (`UniqueConstraintViolation`) signature in both, on `DeliveryConfig_restaurantId_key` and (schema's equivalent unique constraint on) `KitchenCapacity`.

**Methodology note**: after the initial runs surfaced all three races simultaneously, `seed-load-test-data.ts` was updated to pre-create each seeded restaurant's `DeliveryConfig`/`KitchenCapacity` rows (matching the exact defaults those services already use) — isolating the *first-access-only* races out so the *per-request* `nextOrderNumber` race (the one that recurs on every concurrent same-restaurant checkout, not just the first) could be measured cleanly. This is a load-test-methodology choice to get a clean signal, not a fix to either bug in the application itself.

**Not fixed in this phase** — per explicit instruction to not modify unrelated application business logic, these are reported as findings for a future remediation sprint (the same discipline Sprint 07.6/07.7 already established: findings get their own remediation plan, not an ad hoc fix mid-unrelated-phase). All three share the same underlying pattern and the same fix shape: either wrap the check-then-act in a `Serializable` transaction (consistent with the coupon-redemption precedent Sprint 07.6 C-8 already set for exactly this class of bug), or use `upsert()`/`ON CONFLICT DO NOTHING` followed by a re-fetch, or reserve order numbers from a Postgres `SEQUENCE` (global, not per-restaurant, but genuinely race-free) with a display-mapping layer if per-restaurant sequential numbering must be preserved.

## Finding 2 (connection pool sizing)

Peak Postgres connections observed per instance: **10**, consistently, regardless of restaurant count, cart count, or `autocannon` connection concurrency (tested at 20 and 50). This matches Prisma's documented default connection-pool-size formula, `num_physical_cpus * 2 + 1` — `9` on this sandbox's 4 vCPUs, plus roughly one additional connection for the process's own incidental queries (e.g., the `/ready` health check's `SELECT 1`). **The pool, not the database engine itself or restaurant/request volume, is this deployment's actual first throughput ceiling** at the concurrency levels tested here.

**Recommendation**: `DATABASE_URL`'s connection behavior should be sized deliberately once real production concurrency is known, via Prisma's `connection_limit` query parameter (e.g. `?connection_limit=20`) rather than left at the accidental default — and, critically per Finding 3, **multiplied by the number of horizontally-scaled instances** when calculating what Postgres's own `max_connections` (or a pooler in front of it) needs to accommodate. `docs/runbooks/database-setup.md` already flagged deferring a connection-pooler decision (PgBouncer transaction mode, or Prisma Accelerate) to "once real concurrency data justifies it" — this is that data. A pooler becomes worth the operational complexity once total instance count × per-instance pool size starts approaching Postgres's `max_connections` (managed providers commonly cap this at 60-100 for smaller tiers) — for example, at the default ~10-connection-per-instance figure measured here, roughly 6-10 instances would already saturate a 60-connection ceiling before any pooler is introduced.

## Finding 3 (horizontal scale-out — validated, with one caveat)

Confirmed working correctly: shared Redis-backed rate limiting (Phase 5) and shared-database outbox-worker claiming (Phase 6) both behave correctly with 2 real instances under genuine concurrent load — see Scenario 3 above. **The caveat is Finding 2 restated**: connection consumption scales linearly with instance count, so horizontal scale-out and connection-pool sizing are not independent decisions — they must be planned together.

## Rate-limit threshold revisit (master spec work item 5)

Every rate limiter's threshold (`middleware/rate-limit.ts`) is now overridable via `RATE_LIMIT_<NAME>_PER_MINUTE` env vars (this phase's own code change — see below), specifically so this kind of revisit doesn't require a code change and redeploy for every future adjustment. Having now measured real numbers: **the existing `checkoutRateLimiter` default (10 requests/minute per IP) is not the platform's throughput ceiling and does not need to be raised** — it exists to bound a single customer's (or a single compromised/scripted client's) request rate, not the platform's aggregate capacity, which is governed by the database connection pool (Finding 2), not by any per-IP limiter. No default threshold is changed as a result of this phase; the change is that they're now tunable without a redeploy, and the reasoning for leaving them as-is is now backed by measurement rather than the original estimate alone.

## Known limitations

- All numbers are from this sandbox's local PostgreSQL/Redis and 4-vCPU/15GB environment, not a real production-sized database or managed-provider network path — re-measure once a real staging environment exists, per the same "cannot be exercised end-to-end in this sandbox" caveat every other Production Hardening phase has carried.
- The two application-level race conditions (Finding 1) mean the *correctness* ceiling was reached well before the *throughput* ceiling (Finding 2) in every scenario tested — a genuinely bottleneck-free checkout path's real throughput ceiling (once Finding 1 is remediated in a future sprint) is likely higher than the ~60-67 req/sec measured here, since a meaningful fraction of each request's latency here was spent on a transaction that was going to abort anyway.
- Scenario 3's 2 instances ran as two processes on the same machine (not genuinely separate hosts behind a real load balancer) — network latency between a real load balancer and separate instance hosts isn't reflected in these numbers.
