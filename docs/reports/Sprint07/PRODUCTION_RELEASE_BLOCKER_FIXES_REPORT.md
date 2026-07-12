# Production Release Blocker Fixes — Report

Scope: fix exactly the two release-blocking findings from Production Hardening
Phase 11 load testing (`docs/reports/ProductionHardening/LOAD_TEST_RESULTS.md`,
Finding 1), add regression tests proving each is closed under real concurrency,
re-run the identical Phase 11 load-test scenarios, and run full verification.
No other application behavior was touched — no Sprint 08 work, no new
features, no unrelated refactors.

## 1. Order-number generation race

**Root cause.** `nextOrderNumber()` (`apps/api/src/modules/commerce/orders/order-number.ts`)
read `MAX(orderNumber)+1` for the restaurant, then the caller inserted the new
`Order` row in the same transaction. At Postgres's default `READ COMMITTED`
isolation (the transaction is only elevated to `Serializable` when a coupon is
present — `checkout.service.ts`), two concurrent `placeOrder` calls for the
*same restaurant* could both read the same "last" number before either
committed; one then lost to the `UNIQUE (restaurantId, orderNumber)`
constraint at insert time.

**Fix.** `nextOrderNumber()` now acquires a transaction-scoped Postgres
advisory lock keyed by a hash of the `restaurantId` before reading the max:

```ts
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${restaurantId}, 0))`;
```

The first concurrent caller for a given restaurant proceeds; every other
concurrent caller for that *same* restaurant blocks until the lock holder's
transaction commits or rolls back (`pg_advisory_xact_lock` auto-releases then
— no separate unlock call is needed or correct). Callers for *different*
restaurants hash to different lock keys and never block each other, so this
serializes only a single restaurant's own concurrent checkouts, not checkout
across the whole platform — exactly the scope of the actual race. `hashtextextended`
(64-bit) was used over `hashtext` (32-bit) to reduce cross-restaurant lock-key
collision risk.

**Why not a bigger change.** A `SEQUENCE`-based or globally-serialized
approach would also close the race but would change the per-restaurant
sequential numbering semantics or add contention across all restaurants, not
just contended ones. The advisory lock is minimal: one line, no schema
change, no behavior change for the non-contended (i.e. typical) case.

## 2. Duplicated lazy-singleton-config race

**Root cause.** `delivery-config.service.ts::getConfig()` and
`kitchen-capacity.service.ts::getCapacity()` both lazily created their
restaurant's settings row on first access via a find-then-create pattern with
no conflict handling. N concurrent first-ever requests for a brand-new
restaurant could all observe "no existing row" and all attempt `create()`
simultaneously; all but one lost to the `restaurantId` unique constraint.

**First fix attempt — found insufficient by real-concurrency testing.**
The obvious fix, `prisma.deliveryConfig.upsert()` / `prisma.kitchenCapacity.upsert()`,
was implemented first and passed every mocked unit test. A real-database
concurrency regression test (see §3) then caught it still racing — 9/20
concurrent first-ever calls failed with `P2002` in one trial. Rather than
assume this was a fluke, a standalone debug script with
`prisma.$on("query", ...)` event logging was used to capture the actual SQL
Prisma generated for `upsert()` in this Prisma 7 + `@prisma/adapter-pg`
combination:

```
BEGIN;
SELECT ... WHERE "restaurantId" = $1 ...;   -- existence check
INSERT ... RETURNING "id";                   -- conditional insert
SELECT ... WHERE "id" = $1;                  -- re-fetch
COMMIT;
```

I.e., `upsert()` here compiles to a transaction-wrapped find-then-create, **not**
a native `INSERT ... ON CONFLICT DO UPDATE` — the same two-step race, just
wrapped in `BEGIN`/`COMMIT`, which does not prevent it at `READ COMMITTED`.

**Actual fix.** Both functions now use a hand-written raw SQL statement that
Postgres itself serializes atomically at the row level:

```sql
INSERT INTO "DeliveryConfig" (...)
VALUES (...)
ON CONFLICT ("restaurantId") DO UPDATE SET "restaurantId" = EXCLUDED."restaurantId"
RETURNING *
```

`DO UPDATE SET "restaurantId" = EXCLUDED."restaurantId"` is a deliberate
no-op self-write on the conflict-target column — its only purpose is making
`RETURNING *` produce the existing row on conflict, since `DO NOTHING` returns
nothing. This was verified genuinely atomic both via the debug script (0/20
rejected across 3 trials) and via the real-database regression test (3
consecutive clean runs — see §3).

`id` (`randomUUID()`) and `updatedAt` (`now()`) are supplied explicitly in
the raw SQL because — confirmed from the migration SQL — neither column has
a Postgres-level default; Prisma's `@default(uuid())`/`@updatedAt` are
client-side only and don't apply outside the Prisma query builder.

## 3. Regression tests added

All new tests are additive; no existing test was weakened.

| File | What it proves |
|---|---|
| `apps/api/src/modules/commerce/orders/order-number.test.ts` | Unit tests (mocked `tx`): correct next-number arithmetic, lock acquired before the read, lock key varies per restaurant. |
| `apps/api/src/modules/commerce/orders/order-number.concurrency.integration.test.ts` | **Real-database** regression test: 20 concurrent same-restaurant `placeOrder`-shaped transactions all succeed, producing exactly 20 distinct, gapless order numbers, zero rejections. |
| `apps/api/src/modules/commerce/delivery-rules/delivery-config.service.test.ts`, `kitchen-capacity.service.test.ts` | Rewritten to mock `$queryRaw` instead of `upsert()`/`create()`, matching the new implementation; still assert default values and no-op-on-conflict behavior. |
| `apps/api/src/modules/commerce/delivery-rules/config-singleton.concurrency.integration.test.ts` | **Real-database** regression test: 20 concurrent first-ever `getConfig()` calls (and, separately, `getCapacity()`) for the same brand-new restaurant all succeed, with exactly one row created each, zero rejections. |

The two `*.concurrency.integration.test.ts` files are gated behind
`RUN_DB_INTEGRATION_TESTS=true` (same convention Phase 6 established) and are
**not** part of the default `pnpm test` run — they require a real local
Postgres. Each was run 3 consecutive times against a live database with zero
failures before being considered proven.

```
$ set -a && source apps/api/.env && set +a
$ RUN_DB_INTEGRATION_TESTS=true pnpm --filter api exec vitest run \
    src/modules/commerce/orders/order-number.concurrency.integration.test.ts \
    src/modules/commerce/delivery-rules/config-singleton.concurrency.integration.test.ts
# 3/3 runs: all tests passed, zero rejected promises in any trial
```

## 4. Phase 11 load tests re-run

Identical scenarios, identical scripts (`load-tests/run-load-test.sh`,
`seed-load-test-data.ts`, `checkout-load-test.mjs` — unmodified), against a
fresh throwaway Postgres database, same sandbox class of machine. The only
env vars added for this re-run were `REDIS_URL` (shared rate-limit store) and
`RATE_LIMIT_CHECKOUT_PER_MINUTE=100000` — required so the load generator's
traffic (all from one source IP) isn't throttled by the 10/min anti-abuse
default, exactly as Phase 11 itself did for its own throughput scenarios.

### Scenario 1 — 10 restaurants × 30 carts, 1 instance

| Metric | Phase 11 (before) | This re-run (after) |
|---|---|---|
| 2xx (successful checkouts) | 104 / 300 (34.7%) | **300 / 300 (100%)** |
| 5xx | 196 / 300 (65.3%) | **0** |
| Peak Postgres connections | 10 | 10 |

### Scenario 2 — 100 restaurants × 10 carts, 1 instance

| Metric | Phase 11 (before) | This re-run (after) |
|---|---|---|
| 2xx (successful checkouts) | 337 / 1000 (33.7%) | **1000 / 1000 (100%)** |
| 5xx | 663 / 1000 (66.3%) | **0** |
| Peak Postgres connections | 10 | 10 |
| Latency p50/p90/p99 | 574ms / 994ms / 1455ms | 293ms / 345ms / 593ms |

### Scenario 3 — horizontal scale-out (100 restaurants × 10 carts, 2 instances)

| Metric | Phase 11 (before) | This re-run (after) |
|---|---|---|
| 2xx | 361 / 1000 (36.1%) | **1000 / 1000 (100%)** |
| Peak Postgres connections | 20 | 20 |

Every request in every scenario is a genuine first-time checkout of a
distinct pre-seeded cart (no cart checked out twice), so every non-2xx
response in the "before" column was a real failure, and every 2xx in the
"after" column is a real, correctly-processed order. **All three scenarios
that previously reproduced the two races now complete at a clean 100%
success rate.**

**Note on the config-singleton race and this specific re-run.** `seed-load-test-data.ts`
is unchanged from Phase 11 and still pre-creates each seeded restaurant's
`DeliveryConfig`/`KitchenCapacity` rows before the load test starts (a
Phase-11 methodology choice to isolate the order-number race for clean
measurement, documented in `LOAD_TEST_RESULTS.md`'s Methodology note). That
means this re-run's 100% success rate is direct empirical proof the
**order-number race** is closed, but it does not itself exercise the
config-singleton first-access race path (since the rows already exist by the
time HTTP load starts). That race is proven closed instead by the dedicated
real-database regression test in §3
(`config-singleton.concurrency.integration.test.ts`), which is a more direct
and reliable way to reproduce a *first-ever-access* race than a load test
that would need every restaurant's very first request to land concurrently
with itself. Deviating from the original seed script to strip the
pre-warming was considered and rejected to keep this a same-for-same re-run
of Phase 11's exact scenarios, per instruction.

**Note on outbox drain timing.** `run-load-test.sh` waits up to 15s for
`OutboxEvent` rows to drain and reports how many remain unprocessed at that
point. With the race fixed, all three scenarios now produce far more
successful orders (and thus outbox events) than Phase 11's partial-success
runs did, so more events remain queued at the 15s mark than before (e.g.
Scenario 2: 1700 remaining vs. Phase 11's full drain). This is expected
given the outbox worker's fixed 5s poll interval / 50-row batch size
(`OUTBOX_POLL_INTERVAL_MS`, `BATCH_SIZE` in `outbox-scheduler.ts`/`outbox-worker.ts`)
and the now much higher event volume — it is a side effect of the fix
succeeding at higher volume than before, not a regression in outbox
processing itself (untouched by this change, and already covered by Phase 6's
own concurrency tests). Not in scope to address further here per the
explicit "only these two fixes" instruction.

## 5. Full verification suite

All run against this branch's final state, after both fixes and all new
tests:

| Check | Result |
|---|---|
| `prisma validate` | ✅ Pass |
| `prisma generate` | ✅ Pass |
| `pnpm run lint` | ✅ Pass (both apps, no warnings) |
| `pnpm run typecheck` | ✅ Pass (both apps) |
| `pnpm run test` | ✅ apps/api: 926 passed \| 5 skipped (134 files, 4 skipped); apps/web: 9 passed |
| `pnpm run build` | ✅ Pass (both apps; apps/web: 28 routes compiled) |

The 5 skipped apps/api tests are the two new `*.concurrency.integration.test.ts`
files (gated behind `RUN_DB_INTEGRATION_TESTS=true`, not run by default) plus
the pre-existing Phase 6/7 real-database integration tests using the same
convention — none are skipped due to failure.

## 6. Files changed

```
apps/api/src/modules/commerce/orders/order-number.ts                                    (fix)
apps/api/src/modules/commerce/orders/order-number.test.ts                                (new)
apps/api/src/modules/commerce/orders/order-number.concurrency.integration.test.ts        (new)
apps/api/src/modules/commerce/delivery-rules/delivery-config.service.ts                  (fix)
apps/api/src/modules/commerce/delivery-rules/delivery-config.service.test.ts             (updated)
apps/api/src/modules/commerce/delivery-rules/kitchen-capacity.service.ts                 (fix)
apps/api/src/modules/commerce/delivery-rules/kitchen-capacity.service.test.ts            (updated)
apps/api/src/modules/commerce/delivery-rules/config-singleton.concurrency.integration.test.ts (new)
docs/reports/Sprint07/PRODUCTION_RELEASE_BLOCKER_FIXES_REPORT.md                         (new, this file)
```

No Prisma schema/migration changes. No frontend changes. No changes to
`load-tests/**` (re-run as-is). No changes to any module other than the two
named in scope.

## 7. Status

Both Phase 11 release-blocking findings are fixed, covered by real-database
concurrency regression tests, and empirically confirmed closed by re-running
the exact same load-test scenarios that originally found them (100% success
in all three, up from ~34-36%). Full verification suite is green. Sprint 08
was not started; no other features were added or modified.
