# Production Hardening Phase 11 — Completion Report

**Scaling Strategy & Load Validation**

Implemented per `docs/reports/Sprint07/PRODUCTION_HARDENING_MASTER_SPEC.md`, Phase 11 — the capstone, depending on everything in Phases 1–10. Objective: exercise the system built across Phases 1–10 under realistic multi-instance, multi-tenant load, and produce concrete capacity numbers rather than the qualitative assessment Sprint 07.8's audit gave for this question.

## 1. What was done

### 1.1 `load-tests/**` — real HTTP load against the compiled server, never mocks

- `seed-load-test-data.ts` — seeds N restaurants (each with always-open hours, one menu item, a pre-warmed `DeliveryConfig`/`KitchenCapacity` row) and M ready-to-checkout `ACTIVE` carts per restaurant, writing a manifest the runner consumes.
- `checkout-load-test.mjs` — drives `autocannon` at `POST /api/public/checkout/:cartId/place-order` (`CASH_ON_DELIVERY`, the branch that skips payment-provider orchestration entirely and exercises the checkout write path itself: idempotency-key reservation, the `Order`/`OrderItem`/`Fulfillment` transaction, `OutboxEvent` writes), one request per pre-seeded cart so every non-2xx is a genuine failure, not an expected repeat-submission rejection.
- `run-load-test.sh` — orchestrates the whole cycle against a **throwaway database** (same pattern as `scripts/restore-drill.sh`: create, migrate, use, drop), boots one or more compiled server instances against it, samples Postgres connection counts throughout, waits for the outbox worker to drain, verifies order counts, and tears everything down.

### 1.2 Actually executed — three scenarios, real measured numbers

- **~10-restaurant** (300 requests) and **~100-restaurant** (1000 requests) single-instance scenarios: ~60-67 req/sec aggregate throughput in both, essentially unchanged by restaurant count or request volume.
- **Horizontal scale-out** (100 restaurants, 2 instances sharing one Postgres/Redis): confirmed the Redis-backed rate limiter (Phase 5) enforces one shared threshold across both instances (not double), and the outbox worker (Phase 6) drains fully with no duplicate processing under genuine multi-process concurrency.
- Full results, methodology, and the actual measured latency percentiles: `docs/reports/ProductionHardening/LOAD_TEST_RESULTS.md`.

### 1.3 The first real bottleneck, identified empirically (work item 4) — not what the master spec predicted, and more valuable for it

The master spec's own prediction was Postgres write contention on `Order`/`CouponRedemption`/`IdempotencyKey` under `Serializable` isolation, or the primary database itself. **The load test found something different and more actionable**: every 5xx response across every scenario traced to one of two distinct find-then-create race conditions — `nextOrderNumber()`'s read-max-then-insert pattern (racing under any concurrent same-restaurant checkout, at ordinary `READ COMMITTED` isolation, since only the coupon path elevates to `Serializable`), and an identical lazy-singleton-config race duplicated across `delivery-config.service.ts` and `kitchen-capacity.service.ts` (both find-then-create a restaurant's settings row on first access, with two concurrent first-ever requests both able to observe "not found"). **Not fixed in this phase** — per explicit instruction not to modify unrelated application business logic — reported as findings for a future remediation sprint, the same discipline Sprint 07.6/07.7 already established for findings surfaced outside their own scope.

### 1.4 Connection pool sizing (work item 3) — measured, not guessed

Peak Postgres connections observed per instance: a consistent **10**, regardless of restaurant count, cart volume, or `autocannon` concurrency (tested at 20 and 50 connections) — matching Prisma's default pool-size formula (`num_cpus * 2 + 1` = 9 on this sandbox's 4 vCPUs, plus ~1 incidental). The 2-instance scenario confirmed this **doubles** with instance count (peak 20), not shared across instances — meaning connection-pool sizing and horizontal-scale-out planning are the same decision, not two independent ones. `docs/runbooks/database-setup.md`'s existing note deferring a connection-pooler decision "once real concurrency data justifies it" now has that data — see the full recommendation in `LOAD_TEST_RESULTS.md`.

### 1.5 Rate-limit thresholds — made tunable, and revisited with real data (work item 5)

Every limiter in `middleware/rate-limit.ts` now reads its threshold via `getNumberEnv("RATE_LIMIT_<NAME>_PER_MINUTE", <original default>)` — same defaults, but now adjustable without a code change/redeploy for exactly this kind of future revisit. Having measured real numbers: the existing `checkoutRateLimiter` default (10/min per IP, an anti-abuse bound on a single customer) was confirmed **not** to be the platform's real capacity ceiling — that's the connection pool (§1.4) — so no default threshold changed as a result of this phase, but the reasoning for leaving it as-is is now backed by measurement.

## 2. Files changed

**New:**
- `load-tests/seed-load-test-data.ts`
- `load-tests/checkout-load-test.mjs`
- `load-tests/run-load-test.sh`
- `docs/reports/ProductionHardening/LOAD_TEST_RESULTS.md`
- `docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_11_COMPLETION_REPORT.md` (this file)

**Modified:**
- `apps/api/src/middleware/rate-limit.ts` (+ new test `rate-limit.test.ts`) — every threshold now env-overridable, defaults unchanged.
- `apps/api/src/config/env.ts`, `apps/api/.env.example` — the nine new `RATE_LIMIT_*_PER_MINUTE` env vars documented.
- `package.json` (root) — `autocannon` devDependency.
- `.gitignore` — `load-tests/manifest.json` (generated scratch data, not committed).

## 3. Verification

| Check | Result |
|---|---|
| `prisma validate` | ✅ Pass (schema unchanged) |
| `prisma generate` | ✅ Pass |
| `pnpm run lint` (root, both apps) | ✅ Pass, no warnings |
| `pnpm run typecheck` (root, both apps) | ✅ Pass |
| `pnpm run test` (root, both apps) | ✅ **921/921 passing + 2 Phase-6 integration tests skipped by default** (up from 919 pre-Phase-11; 2 new tests in `rate-limit.test.ts`) |
| `pnpm run build` (root, both apps) | ✅ Pass |

**The load test itself is this phase's real verification** (master spec Phase 11's own framing: "the load-test report itself, with concrete numbers... replacing this plan's and the Sprint 07.8 audit's qualitative capacity assessments with measured ones"): three scenarios executed against a real throwaway database and real compiled server, full results in `LOAD_TEST_RESULTS.md`.

## 4. Known limitations

- All measurements are from this sandbox's local environment (4 vCPU/15GB, local PostgreSQL/Redis), not a real production-sized deployment or managed-provider network path — the same "cannot be exercised end-to-end in this sandbox" limitation every prior phase has carried, explicitly re-flagged here since Phase 11's whole purpose is producing numbers, and these numbers are sandbox-scoped, not production-scoped.
- The two application-level race conditions found (§1.3) meant every scenario's *correctness* ceiling was reached before its *throughput* ceiling — the real post-remediation throughput ceiling is undetermined until a future sprint fixes them and this load test is re-run.
- The 2-instance horizontal scale-out ran as two processes on one machine, not genuinely separate hosts behind a real load balancer — no real network latency between instances and a load balancer is reflected in these numbers.
- Connection-pool tuning guidance (§1.4) is a formula-based recommendation from measured per-instance behavior, not a live test of an actually-configured `connection_limit` value or a real PgBouncer deployment — that's the natural next empirical step once a production-sized database and expected instance count are both known.

---

*Phase 11 complete — this closes the Production Hardening Master Specification's full 11-phase plan (Phases 1-11). Proceeding to the final `PRODUCTION_READY_FINAL_REPORT.md` per instruction, then stopping for review.*
