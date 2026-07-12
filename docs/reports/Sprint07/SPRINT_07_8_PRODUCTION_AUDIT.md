# Sprint 07.8 — Production Readiness Audit

**Scope:** A read-only audit of OrderVora after Sprint 07.7 (all 15 Critical and all 13 High findings from the Sprint 07.6 remediation plan closed). No code was changed, no commits were made, no files outside this report were modified. This document is analysis only, for review before any Sprint 07.8 implementation work is authorized.

**Branch audited:** `claude/sprint-07-commerce-engine` (HEAD at the time of this audit includes the Sprint 07.7 High-finding remediation commit).

**Method:** Direct inspection of the schema, source tree, CI configuration, and prior sprint reports (`SPRINT_07_FINAL_REPORT.md`, `SPRINT_07_6_FINAL_REPORT.md`, `SPRINT_07_6_REMEDIATION_PLAN.md`, `SPRINT_07_7_FINAL_REPORT.md`), plus targeted greps/reads of the areas listed below. This is not a fuzzing/pen-test exercise and not a load test — no live database, payment provider, or SMS provider is reachable from this environment, so several findings below are architectural/configuration observations rather than measured production incidents.

---

## Answers (read this first)

### 1. Is the platform production-ready?

**Not yet, as a whole.** The *commerce logic* (checkout, orders, payments orchestration, coupons, delivery routing, fulfillment, driver dispatch) is in good shape: 0 Critical and 0 High findings remain open after Sprint 07.6/07.7, and 822 tests pass. But "production-ready" also means the surrounding infrastructure, and there the platform is missing several load-bearing pieces: no database migration has ever been generated or applied to a real Postgres instance, CI never runs the test suite, there is no deployment target (no Dockerfile, no hosting config of any kind), the rate limiters use an in-memory store that silently stops working the moment there is more than one API instance, and two of the three notification channels (SMS, push) and five of the six payment providers and three of the four delivery-fulfillment methods are stubs. None of these are secret — most are already documented in-code as deliberate scope boundaries — but collectively they mean the platform is code-complete for a narrower slice of "production" (one API instance, Stripe, pickup/own-driver delivery, email-only notifications) than its BYOP/multi-provider architecture advertises.

### 2. Can the first paying restaurant safely operate on it?

**Conditionally, yes** — with a real precondition that must be done first: **generate and apply an initial Prisma migration against a real production Postgres database.** This has never happened anywhere, including in this development environment (there is no `apps/api/prisma/migrations/` directory at all — every schema change across all seven sprints was validated with `prisma validate`/`prisma generate` only, never `prisma migrate`). That is not a formality; it is the one step standing between this codebase and any real deployment.

Given that precondition is met, a first restaurant can safely operate if they accept these boundaries: Stripe as the only working payment provider, pickup and/or their own delivery staff (not Uber Direct/DoorDash Drive/a local-courier integration) as the only working fulfillment methods, email as the only notification channel that actually delivers (SMS/push are silently no-ops today), and a single API instance (see Q4).

### 3. Can 10 restaurants operate simultaneously?

**Yes, from a data-isolation standpoint.** Tenant scoping is applied consistently — every service function that reads or mutates a restaurant-owned row does so through a `findOwn*`/`getOwn*`-style helper that checks `restaurantId` ownership and returns 404 (not 403) on a mismatch, a pattern audited specifically in Sprint 07.6's C-14 and followed by every module built since. No shared mutable in-memory state mixes data across tenants. Ten restaurants sharing one API instance and one Postgres database is a capacity question, not a correctness one, and nothing found in this audit suggests 10 tenants would corrupt or leak each other's data.

### 4. What prevents scaling to 100 restaurants?

Not tenant isolation — infrastructure ceilings that only bite once you need more than one API instance or meaningfully more load:

- **Rate limiting breaks on more than one instance.** `middleware/rate-limit.ts` uses `express-rate-limit`'s default in-memory store for every limiter (auth, checkout, staff-action, webhook, customer-auth). Each instance counts independently — a second instance doesn't just double capacity, it makes every limiter's stated threshold meaningless (or, worse, uneven: which instance a request lands on determines whether it's throttled).
- **The outbox worker and stale-driver-offer sweep are explicitly single-instance-only** (documented in H-11 and C-11's own remediation notes). Running two instances would double-process `OutboxEvent` rows and double-sweep expired driver offers — not catastrophic (dispatch is at-least-once and idempotent-by-design where it matters) but wasted work and a sign nothing here has been built for horizontal scaling yet.
- **No connection-pooling story for multiple instances.** `DATABASE_URL` points straight at Postgres with no PgBouncer/connection-limit configuration documented anywhere; each instance opens its own Prisma pool. Fine at one or a few instances, a real risk once instance count grows without addressing this.
- **No caching layer** for read-heavy, public, low-cardinality data (published site pages, public menu reads) — 100 restaurants' worth of storefront traffic hits Postgres directly for every page view today.
- **SMS/push being stubs stops being a footnote and becomes a real product gap** at this scale — driver dispatch reliability (C-10/H-8) depends on a channel that doesn't deliver anything yet.

None of the above are Critical/High-severity *correctness* bugs in the C/H sense from prior sprints — they are capacity/architecture ceilings a single-instance MVP was never asked to cross yet.

### 5. Are there any remaining Critical findings?

**No.** All 15 Critical findings (C-1 through C-15) from the Sprint 07.6 remediation plan were fixed and verified in Sprint 07.6. This audit did not identify any new Critical-severity correctness or security defect in the areas reviewed.

### 6. Are there any remaining High findings?

**No.** All 13 High findings (H-2 through H-14) were fixed and verified in Sprint 07.7 (immediately prior to this audit). This audit surfaced a distinct category of **production-readiness gaps** (migrations, CI test coverage, rate-limiter storage, deployment target, notification/payment/delivery stub coverage, frontend test coverage, observability — detailed in §7 below) that are not "High findings" in the security/correctness sense the existing C/H/M/L numbering tracks, but are blocking for an actual production launch. These are listed as new, provisionally-numbered `PR-` items pending your direction on whether/how to fold them into the remediation backlog.

### 7. Is Sprint 07 ready to merge?

**The code is ready to merge; "production-ready" is a separate question the merge decision shouldn't be conflated with.** From a pure correctness standpoint: 0 Critical findings, 0 High findings, 822/822 tests passing, lint/typecheck/build all clean across both `apps/api` and `apps/web`. That's a legitimate basis to merge seven sprints of accumulated work off a long-lived feature branch into `main`. The production-readiness gaps in §7 below are not reasons to block the merge of this *code* — they're reasons not to point real payment traffic at whatever environment this gets deployed to until they're addressed. Recommend merging Sprint 07, then scoping the `PR-` items below as an explicit, separate hardening pass (Sprint 07.9 or Sprint 08) before any real restaurant's traffic touches a live deployment.

---

## Area-by-Area Findings

### Architecture

- Module layout (`routes.ts → controller.ts → service.ts`, per-module `validation.ts`/`errors.ts`) is applied consistently across all ~20 commerce modules — confirmed by direct inspection, not just prior sprint reports' claims.
- Provider-adapter pattern (payments, fulfillment, POS, notifications, import sources) is genuinely swappable: each registry (`*.registry.ts`) maps a type enum to an adapter class with an `implemented: boolean` flag, and orchestration code never references a specific provider's SDK outside its own `providers/*.ts` file. This is a real architectural strength — adding a real Uber Direct or Square adapter later is additive, not a rewrite.
- The event bus (`commerceEventBus`) is now durable (H-11's `OutboxEvent` + `outbox-worker.ts`) but still single-instance in its dispatch (see Q4). Documented in-code as such.

### Database

- **No migration history exists.** `apps/api/prisma/migrations/` does not exist. Every schema change across all seven sprints was made by editing `schema.prisma` directly and running `prisma validate`/`prisma generate` — never `prisma migrate dev`/`deploy`. This environment has no live Postgres to migrate against, but that means the schema-as-modeled has *never* been round-tripped through Postgres: no verification that every `@relation`, `@@index`, `@unique`, and enum actually creates cleanly, that cascade/restrict behavior is what's assumed, or that a migration path even exists from an empty database to the current schema.
- Idempotency keys (`IdempotencyKey` table, `lib/idempotency.ts`) are correctly DB-backed via a unique-constraint race rather than an in-memory check-then-write — this is horizontally-safe by design, a genuine strength.
- `CustomerRefreshToken`, `CustomerPasswordResetToken`, `OutboxEvent` (all added in Sprint 07.7) and the full Sprint 07 commerce schema are additive and backward-compatible on paper — again, unverified against a real database.
- `LoyaltyAccount`/`LoyaltyTransaction`/`GiftCard`/`GiftCardTransaction` models exist in the schema with **zero application code referencing them anywhere** (confirmed via repo-wide grep) — fully dead schema, previously noted informationally (L-7) and reconfirmed here.

### API

- Consistent tenant-scoping pattern (`findOwn*`/`getOwn*`) across every module; cross-tenant access uniformly returns 404, not 403, per the codebase's established convention.
- Rate limiting exists on every mutating/public endpoint that matters (auth, checkout, staff actions, webhooks, customer auth) as of Sprint 07.7's H-13/H-14 — but see the in-memory-store gap in Q4.
- Webhook handling is solid: signature verification via each provider's own adapter, an idempotent `WebhookEvent` row unique-keyed to prevent double-processing, and a rate limiter in front of it.
- **No security-headers middleware** (no `helmet`, no CSP/`X-Frame-Options`/HSTS configuration found anywhere in `app.ts`). Not currently tracked as an M/L finding.
- **No CSRF token mechanism** — already tracked as M-17, unchanged.

### Frontend

- 53 `.tsx` files under `apps/web/src`, only 2 test files (both from Sprint 07.6's C-1 payment-tokenization work: `card-payment-form.test.tsx`, `checkout/page.test.tsx`). The entire owner dashboard (orders, payments, delivery, kitchen, POS, tables, coupons, website builder), the customer account/tracking flow, and the staff kitchen/driver views have **zero frontend test coverage**.
- No dashboard-level auth guard/redirect-on-401 pattern audited as consistently present — already tracked as L-9, unchanged.
- Several mutation handlers fail silently with no user-facing error feedback — already tracked as L-8, unchanged.

### Payments / BYOP

- Stripe adapter is real and load-bearing (tokenization, 3DS/SCA via `requiresAction`, capture, void, refund with over-limit guard as of H-4). This is the only real provider among six registered (`Clover`, `Square`, `Authorize.Net`, `Adyen`, `Fiserv` are all `implemented: false`).
- Envelope encryption (`AES-256-GCM`, `lib/encryption.ts`) protects stored BYOP credentials with a key distinct from the JWT secret — sound design. No key rotation/versioning exists yet (M-1, unchanged) and encrypted ciphertext is still exposed in API responses (M-2, unchanged).
- Multi-provider failover logic exists in the orchestrator, but with only one real provider it has never been exercised against a second live provider — the failover *path* is correct by inspection and unit test, but its real-world value is unproven until a second provider is real.

### Checkout

- `placeOrder`'s transactional core (Order/OrderItem/Fulfillment creation, coupon redemption re-check under Serializable isolation, cart-conversion guard, idempotent retry via the reserve/complete/fail pattern) reflects the accumulated C-2/C-5/C-8/C-15/H-4/H-5 fixes and is, by inspection, the most heavily-hardened path in the codebase.
- Guest checkout now correctly reuses one `GuestCustomer` row per email (H-5), closing the per-guest coupon-limit gap.

### Orders

- State machine (`order-state-machine.ts`) gates every transition; `markPaidCash`/`refundOrder` are now idempotent (H-2/H-4); notification failures on every lifecycle action are guarded by the shared `bestEffort()` helper (H-12).
- M-3 (cumulative partial refunds never flip `Order.status` to `REFUNDED`) and M-4 (refunding a cash order produces a raw 500) remain open, unchanged by this sprint.

### Fulfillment / Drivers

- Pickup and restaurant-own-driver are real; Uber Direct, DoorDash Drive, and a generic local-courier integration are all `implemented: false` stubs.
- Driver reassignment now notifies the previous driver (H-8), busy-driver checks prevent double-booking (C-9), stale offers expire and are swept (C-11) — but **the SMS channel every one of these notifications depends on is itself a stub** (`sms.provider.ts`, `implemented: false`). Every driver-facing notification this sprint and last sprint built is currently recorded as `SKIPPED_CHANNEL_DISABLED` in a real deployment. This was flagged as "residual risk" in C-10/H-8's own writeups; worth restating plainly here since it affects the Drivers area's actual production readiness, not just a caveat.
- Delivery-rule fallback chains now correctly re-check busy state at every hop and reject self-referencing/cyclic configurations (H-9).

### QR Ordering

- Table binding is token-based only since C-13 (no client-suppliable `tableId` anywhere in cart-creation input) — solid, no new gaps found.

### POS

- All five registered POS providers (Square, Clover, Toast, Lightspeed, a generic adapter) are `implemented: false` stubs. This module is a registry and a contract, not a working integration with any real point-of-sale system yet — unchanged from its Sprint 07 scope.

### Notifications

- Email is real (SMTP via `nodemailer`); SMS and push are both stubs. See Fulfillment/Drivers above for the concrete consequence.
- Notification failures are consistently best-effort (never block the operation that triggered them) as of H-12 — a real strength.

### Loyalty

- `LoyaltyAccount`/`LoyaltyTransaction` exist only as unused schema — no service, no controller, no route references them anywhere. If loyalty is part of the product pitch to restaurants, it does not exist yet functionally.

### Security

- Tenant isolation, webhook signature verification, envelope-encrypted BYOP credentials, hashed (not plaintext) refresh tokens and password-reset tokens (H-6/H-7), httpOnly/secure/sameSite cookies — the security fundamentals that were explicitly audited (C-series, H-series) are in good shape.
- Gaps not previously tracked: no security-headers middleware (no `helmet`); no structured logging or error-tracking/APM integration (every error path uses ad hoc `console.error`/`console.log`, making real-incident diagnosis in production materially harder than it needs to be).
- Already-tracked, still-open gaps: no CSRF mechanism (M-17), IP-only rate limiting with no per-account lockout (L-6), no encryption-key rotation (M-1).

### Performance

- No obvious N+1 patterns found in the hot checkout/order paths beyond `backfillOrderItemNames`'s per-item loop, which is deliberately kept outside the placement transaction and bounded by a single order's item count (not a scaling concern at realistic cart sizes).
- No caching layer anywhere for read-heavy public traffic (public menu reads, published site pages) — a real gap once traffic grows, not yet exercised at any scale in this environment.

### Scalability

- See Q4 in full — in-memory rate limiting, single-instance outbox/stale-offer workers, and no documented connection-pooling strategy are the three concrete architectural ceilings found. None of these are bugs; they are things nobody has been asked to build yet because there has only ever been one instance.

### Multi-tenancy

- Consistently enforced via the `findOwn*` ownership-check pattern across every module touched in this and prior sprints; no cross-tenant data leak identified in this audit's review.

### Event Bus

- Now durable via the Sprint 07.7 outbox pattern (H-11), with an explicit in-code warning (H-10) that it still has no real subscriber beyond a debug-log listener, and is still single-instance in its dispatch. Correctly scoped and documented as infrastructure-not-yet-used, not a hidden defect.

### Production Deployment

- **No Dockerfile, docker-compose file, or any hosting-platform configuration (Vercel/Fly/Render/Kubernetes manifest/etc.) exists anywhere in the repository.** There is currently no defined path from "code in this repo" to "running in production" at all.
- **CI (`ci.yml`) validates the Prisma schema, generates the client, lints, typechecks, and builds — but never runs the test suite.** All 822 passing tests exist and pass locally/in this environment, but nothing enforces that they continue passing on every push/PR; a regression could merge to `main` undetected by CI today.
- `.env.example` is thorough and well-commented for every module built so far, a genuine strength for onboarding a real deployment once one is defined.

---

## New Production-Readiness Findings (not previously numbered)

These are distinct from the existing Critical/High/Medium/Low findings tracked in `SPRINT_07_6_REMEDIATION_PLAN.md` — provisionally labeled `PR-` (Production Readiness) here for reference. **No fixes have been implemented for any of these; they are listed for your review and prioritization only.**

| ID | Finding | Area |
|----|---------|------|
| **PR-1** | No Prisma migration has ever been generated or applied to a real database — no `prisma/migrations/` directory exists | Database |
| **PR-2** | CI never runs the test suite (`ci.yml` stops at build; no `pnpm run test` step, no Postgres service container) | Production Deployment |
| **PR-3** | No Dockerfile, docker-compose, or hosting-platform configuration exists anywhere in the repo | Production Deployment |
| **PR-4** | Every rate limiter uses `express-rate-limit`'s default in-memory store — meaningless once more than one API instance is running | Scalability / Security |
| **PR-5** | SMS and push notification channels are both stubs — every driver-dispatch SMS (C-10, H-8) and any push notification is silently a no-op today | Notifications / Drivers |
| **PR-6** | Only 1 of 6 registered payment providers, and only 2 of 5 fulfillment methods (pickup, own-driver), are real implementations | Payments / Fulfillment |
| **PR-7** | Frontend test coverage is 2 files covering 53 `.tsx` files (~4%) — only the Sprint 07.6 payment-tokenization feature has any coverage | Frontend |
| **PR-8** | No security-headers middleware (no `helmet`/CSP/HSTS/`X-Frame-Options`) | Security |
| **PR-9** | No structured logging, error-tracking, or APM integration — every error path is ad hoc `console.error`/`console.log` | Security / Production Deployment |
| **PR-10** | No documented database connection-pooling strategy for multiple API instances (no PgBouncer, no `connection_limit` guidance) | Scalability |
| **PR-11** | No caching layer for read-heavy public traffic (public menu reads, published storefront pages) | Performance |
| **PR-12** | `LoyaltyAccount`/`GiftCard` models exist in schema with zero application code anywhere — confirmed fully dead (restates L-7 with fresh verification) | Loyalty |

None of these are being implemented as part of this audit, per your instruction. They're offered as a starting punch list if you'd like a Sprint 07.9/08 scoped specifically to production-readiness hardening, separate from the feature/correctness work Sprints 07–07.7 covered.

---

## Verification Basis

This audit did not re-run the full verification suite (not requested; no code changed). The last full verification pass, from Sprint 07.7's completion immediately prior to this audit, was:

| Step | Result |
|------|--------|
| `prisma validate` | ✅ Pass |
| `prisma generate` | ✅ Pass |
| `pnpm -r lint` (api + web) | ✅ Pass |
| `pnpm -r typecheck` (api + web) | ✅ Pass |
| `pnpm -r test` | ✅ 822 / 822 passing (813 `apps/api` + 9 `apps/web`) |
| `pnpm -r build` | ✅ Pass |

---

*No fixes have been implemented. Waiting for approval before any Sprint 07.8+ implementation work begins.*
