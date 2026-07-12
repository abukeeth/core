# Production Hardening Phase 6 — Completion Report

**Background Worker Hardening**

Implemented per `docs/reports/Sprint07/PRODUCTION_HARDENING_MASTER_SPEC.md`, Phase 6. Closes the explicitly-documented single-instance limitation of `outbox-worker.ts`/`outbox-scheduler.ts` (Sprint 07.7 H-11) and `stale-offer-scheduler.ts`/`expireStaleOffers` (Sprint 07.6 C-11) — both fixes' own remediation notes flagged this as "the natural next step" for horizontal scaling.

## 1. Option chosen: Option A (`SELECT ... FOR UPDATE SKIP LOCKED`)

The master spec presents two options: **Option A** (row-locking claim, smaller/faster/no new infrastructure) and **Option B** (migrate both jobs onto BullMQ, now that Phase 5 has landed Redis). The spec's own recommendation is conditional — "ship Option A first if Phase 5 hasn't landed yet or if timeline is tight... treat Option B as the natural upgrade once Redis already exists." This phase ships **Option A**, deliberately, for two reasons:

1. **Lower risk, fully self-contained.** No new dependency, no new wiring in `index.ts`, no new infrastructure to reason about — just a Prisma raw-query change to each function's row-selection step, exactly as the spec's own item 1 describes it.
2. **Directly, genuinely verifiable in this environment.** Two dedicated integration tests (§4) run real concurrent instances of each function against this sandbox's actual local Postgres and prove the fix works — Option B's marginal benefit (job history, retry/backoff, dead-letter handling) would be much harder to verify meaningfully without a fully running distributed job-queue setup, which is a materially larger and less certain verification story than what Option A allows here.

Option B remains a reasonable future upgrade once there's real operational experience running Redis in production (from Phase 5) — noted as a deferred, not rejected, path.

## 2. What was done

### 2.1 `outbox-worker.ts` — claim-then-dispatch, held transaction

`processOutboxBatch()` now runs the whole claim-and-dispatch cycle inside one `prisma.$transaction`: a raw `SELECT * FROM "OutboxEvent" WHERE "processedAt" IS NULL ORDER BY "createdAt" ASC LIMIT 50 FOR UPDATE SKIP LOCKED` claims a batch, and the row lock is held for the **entire transaction**, spanning the dispatch loop — not released right after the SELECT. This matters because "claiming" and "processing" are two separate steps for this job (dispatch to the event bus, then mark `processedAt`): releasing the lock early (e.g. committing right after the SELECT) would let a second instance re-claim and double-dispatch the same row while the first instance is still processing it. Holding the transaction open across the loop is safe and cheap here specifically because `commerceEventBus.emit()` is synchronous and fire-and-forget (`event-bus.ts`) — no real I/O happens inside the held transaction.

### 2.2 `expireStaleOffers` — atomic claim-is-the-transition

A different shape, deliberately: here, "claiming" and "processing" **are** the same operation — the state transition itself (`OFFERED` → `EXPIRED`) is the substantive work, with no separate slow step in between. So this one is a single atomic statement, not a held transaction:

```sql
UPDATE "DriverAssignment" AS da
SET status = 'EXPIRED', "updatedAt" = now()
FROM "Fulfillment" AS f
WHERE da.id IN (
  SELECT id FROM "DriverAssignment"
  WHERE status = 'OFFERED' AND "offerExpiresAt" < now()
  FOR UPDATE SKIP LOCKED
)
AND f.id = da."fulfillmentId"
RETURNING da.id, da."fulfillmentId", da."driverId", f."orderId", f."restaurantId"
```

By the time this statement returns, the returned rows are already durably `EXPIRED` — a concurrent sweep's identical statement cannot re-claim them, regardless of whether the per-row event-recording loop that follows (`writeOrderEvent`/`emitOrderEvent`) succeeds for all of them. This preserves the exact same failure-isolation behavior the function already had ("one bad row does not stop the sweep from processing the rest") while fixing the concurrency gap.

### 2.3 Tests updated for the new query shape

- `outbox-worker.test.ts` — mocks now stub `prisma.$transaction`/`tx.$queryRaw`/`tx.outboxEvent.update` instead of `findMany`/`update` directly; added a test asserting the raw query actually contains `FOR UPDATE SKIP LOCKED`.
- `fulfillment.service.test.ts`'s `expireStaleOffers` block — mocks now stub `prisma.$queryRaw` returning the joined `{id, fulfillmentId, driverId, orderId, restaurantId}` shape; added the same SQL-shape assertion, plus a new test confirming the sweep continues expiring remaining rows when one row's event-recording throws.

### 2.4 Real-database concurrency integration tests (new)

Per the master spec's own Verification requirement ("A dedicated integration-style test runs two concurrent instances of the batch-processing function against one real database, seeds N events, and confirms all N are processed with no event silently skipped and no double-count"):

- `outbox-worker.concurrency.integration.test.ts` — seeds 20 `OutboxEvent` rows, fires `Promise.all([processOutboxBatch(), processOutboxBatch()])` against this sandbox's real local Postgres, and confirms: every seeded row is `processedAt`-set (nothing skipped), and — via a spy on `commerceEventBus.emit` — every seeded `orderId` was dispatched **exactly once** total across both concurrent calls combined (nothing double-dispatched).
- `expire-stale-offers.concurrency.integration.test.ts` — seeds 8 fully-relational stale `DriverAssignment` rows (real `User`/`Restaurant`/`Order`/`Fulfillment` rows, since this table has real foreign keys), fires the same two-concurrent-calls pattern, and confirms every seeded assignment is `EXPIRED` (nothing skipped) and the two calls' `expiredCount`s sum to exactly the seeded count, not more (nothing double-expired).

Both are deliberately **not** part of the default `pnpm test` run — every other test in this codebase mocks `lib/prisma` and needs no live database (the established convention since Sprint 03/04); these two genuinely need one. Gated behind `RUN_DB_INTEGRATION_TESTS=true` so `pnpm test` stays hermetic and portable by default, and both were actually run (not just written) against this sandbox's real local Postgres as part of this phase's verification (§4).

## 3. Files changed

**New:**
- `apps/api/src/modules/commerce/events/outbox-worker.concurrency.integration.test.ts`
- `apps/api/src/modules/commerce/fulfillment/expire-stale-offers.concurrency.integration.test.ts`
- `docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_6_COMPLETION_REPORT.md` (this file)

**Modified:**
- `apps/api/src/modules/commerce/events/outbox-worker.ts` — `FOR UPDATE SKIP LOCKED` claim inside a held transaction.
- `apps/api/src/modules/commerce/fulfillment/fulfillment.service.ts` — `expireStaleOffers` rewritten as an atomic claim-and-expire `UPDATE ... RETURNING`.
- `apps/api/src/modules/commerce/events/outbox-worker.test.ts` — updated mocks + new SQL-shape assertion.
- `apps/api/src/modules/commerce/fulfillment/fulfillment.service.test.ts` — updated mocks + new SQL-shape and partial-failure tests.

**Explicitly not touched:** no application business logic beyond the two functions' internal row-claiming mechanics — the state machine, notification behavior, and public function signatures are unchanged. No `job-queue.ts`/BullMQ (Option B, deferred per §1). No Docker/Redis started beyond what Phase 5 already provisioned.

## 4. Verification

| Check | Result |
|---|---|
| `prisma validate` | ✅ Pass (schema unchanged) |
| `prisma generate` | ✅ Pass |
| `pnpm run lint` (root, both apps) | ✅ Pass, no warnings |
| `pnpm run typecheck` (root, both apps) | ✅ Pass |
| `pnpm run test` (root, both apps) | ✅ **856/856 passing, 2 skipped** (846 pre-existing + new mocked tests, both new integration tests correctly skipped by default) + 9 `apps/web` |
| `pnpm run build` (root, both apps) | ✅ Pass |

**The concurrency fix itself was verified for real, not just asserted** — both integration tests (§2.4) were actually executed with `RUN_DB_INTEGRATION_TESTS=true` against this sandbox's real local Postgres:

- `outbox-worker.concurrency.integration.test.ts`: ✅ pass — 20 seeded events, two genuinely concurrent `processOutboxBatch()` calls (via Prisma's connection pool, each call gets its own Postgres session), zero skipped, zero double-dispatched.
- `expire-stale-offers.concurrency.integration.test.ts`: ✅ pass — 8 seeded stale offers with full relational setup, two concurrent `expireStaleOffers()` calls, zero skipped, `expiredCount`s summed to exactly 8 (not more), confirming `SKIP LOCKED` genuinely partitions the claim between the two concurrent callers rather than letting both process the same rows.

Both tests clean up their seeded data in `afterAll` (verified: zero leftover rows in the shared dev database after each run — an initial cleanup-ordering bug in the `expireStaleOffers` test, caused by deleting `Order` rows before the `OrderEvent`/`OutboxEvent` rows that FK-reference them, was caught and fixed during this verification, not left in the committed test).

## 5. Notes

- Both `outbox-worker.test.ts`/`fulfillment.service.test.ts`'s mocked unit tests continue to pass unmodified in spirit (same assertions on dispatch/expiry behavior, only the mock shape changed to match the new query mechanism) — per the master spec's Verification item 2.
- Option B (BullMQ) remains available as a future upgrade once there's real operational experience with Phase 5's Redis in production — not implemented here, per the risk/verifiability reasoning in §1.
- No change to either function's public signature or the state-machine/notification behavior downstream of them.

---

*Phase 6 complete. Both Phase 5 and Phase 6 are now fully verified. Proceeding to commit and push per instruction. Waiting for your review before Phase 7.*
