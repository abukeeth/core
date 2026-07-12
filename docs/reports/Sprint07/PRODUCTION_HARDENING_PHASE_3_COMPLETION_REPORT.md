# Production Hardening — Phase 3 Completion Report

**Phase:** 3 of 11 — Secrets Management (`PRODUCTION_HARDENING_MASTER_SPEC.md`)
**Scope discipline:** no Docker, no Redis, no application business logic (checkout/orders/payments domain rules) touched. Every change is config-loading plumbing or documentation.

This phase's requested scope was broader than the master spec's original Phase 3 section (which focused specifically on `COMMERCE_ENCRYPTION_KEY` rotation) — this report covers the fuller set actually requested: removing hard-coded secrets, centralizing configuration loading, strict startup validation, dev/staging/production separation, secret rotation documentation, no-secrets-in-logs, and test coverage for all of it.

---

## 1. What was done

### 1.1 Centralized configuration module — `apps/api/src/config/env.ts` (new)

Before this phase, **five different files** each defined their own local copy of the same "read one env var, throw if missing" helper: `lib/jwt.ts`, `lib/encryption.ts`, `customer-jwt.ts`'s `requireSecret`, `prisma/seed.ts`, and `notifications/providers/email.provider.ts`. Roughly a dozen other call sites read `process.env.X ?? default` directly and inline, scattered across the cart/fulfillment/import/site/event modules. All of it now goes through one module, two access patterns:

- **`getEnv()`** — the app's core, always-required configuration (`NODE_ENV`, `PORT`, `DATABASE_URL`, `FRONTEND_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `COMMERCE_ENCRYPTION_KEY`, `COMMERCE_ENCRYPTION_KEY_PREVIOUS`), validated together via a Zod schema, memoized after first call, lazy (validates on first call, not at import time — see §1.2).
- **`requireEnv` / `getStringEnv` / `getNumberEnv` / `getOptionalEnv`** — for everything else: feature-specific keys (SMTP, Anthropic, Google Maps) and non-secret config-with-a-default (cart TTL, driver-offer timeouts, upload directories, etc.), each read independently with no schema-validation side effect on unrelated modules.
- **`getSafeEnvSummary()`** — reports `"set"`/`"unset"` per known variable, never a value. This is the only thing safe to log at startup, and is what `index.ts` now actually logs.
- **`assertStartupEnv()`** — the eager, aggregated check called once from `index.ts`, before the Express app is created.

Full design rationale, the complete variable inventory, and the dev/staging/production split are documented in **`docs/runbooks/environment-configuration.md`** (new).

### 1.2 Strict startup validation

`src/index.ts` now calls `assertStartupEnv()` as the first thing it does, logging `getSafeEnvSummary()` immediately after. A single missing or invalid required variable now produces **one aggregated error listing every problem at once** — verified live in this sandbox: booting the compiled server with `COMMERCE_ENCRYPTION_KEY` unset failed immediately with a clear `Invalid environment configuration: - COMMERCE_ENCRYPTION_KEY: ...` error before touching the database or opening a port; adding the key and rebooting produced a clean `Environment configuration loaded: { NODE_ENV: 'set', ... }` summary with no secret values printed, followed by the normal `API server listening on port 4000 (environment: development)` message.

### 1.3 Removed hard-coded/duplicated secret-handling code

- Consolidated the five duplicated local `requireEnv` implementations into the one in `config/env.ts`; all five call sites now import it instead.
- Migrated every other ad hoc `process.env.X` read (in `app.ts`, `lib/prisma.ts`, `lib/file-storage.ts`, `lib/release-storage.ts`, `cart.service.ts`, `fulfillment.service.ts`, `stale-offer-scheduler.ts`, `outbox-scheduler.ts`, `import.routes.ts`, `website.adapter.ts`, `site.routes.ts`, `domain.service.ts`, `public-render.routes.ts`, `site.service.ts`, `vision-extractor.ts`, `brand-analysis.ts`, `content-generator.ts`, `brand-consistency-score.ts`, `places-client.ts`, `customers.service.ts`) onto the shared helpers.
- Audited the repo for any place a secret value (as opposed to its *presence*) might reach a log line — found none, and `getSafeEnvSummary()` now provides the one sanctioned way to log configuration state at all.

**Deliberately left unchanged** (with the reasoning recorded in code comments and in `environment-configuration.md`):
- `modules/auth/cookies.ts`, `customers/customer-cookies.ts`, `cart/guest-session.ts` — all three read `process.env.NODE_ENV === "production"` directly for a single cookie-security-flag boolean. Routing this through `getEnv()`'s full core schema would have broken `guest-session.test.ts` (which imports the real module without mocking it or setting up the rest of the core config) for no behavioral benefit — this is a deliberate, narrow exclusion, not an oversight.
- `lib/prisma.ts` uses the narrow `getStringEnv("DATABASE_URL", "")`, not `getEnv()` — several existing test files transitively import it (via service modules) without mocking it, relying on `PrismaPg`'s tolerance of an empty connection string at construction time. The real enforcement for "the database URL must actually be valid" is `assertStartupEnv()` in `index.ts`, not every individual importer of the Prisma client.
- `JWT_REFRESH_SECRET` remains documented in `.env.example` but unused by any module (confirmed via a repo-wide search) — left in place rather than removed, with the fact now stated explicitly in both `.env.example` and `environment-configuration.md`, since removing an unused-but-harmless declared variable was judged out of scope for a secrets-management phase.

### 1.4 `COMMERCE_ENCRYPTION_KEY` rotation support (master spec's original Phase 3 scope)

`lib/encryption.ts`'s envelope format is now versioned: `encryptSecret()` writes `${keyVersion}:${iv}:${authTag}:${ciphertext}` (key version `"1"` = `COMMERCE_ENCRYPTION_KEY`), and `decryptSecret()` accepts that format, key version `"2"` (`COMMERCE_ENCRYPTION_KEY_PREVIOUS`), **and** the original pre-Phase-3 3-part format with no version prefix at all — so nothing already encrypted anywhere ever becomes unreadable. A new `reencryptSecret()` provides the opt-in migration path (decrypt under whichever key/format applies, re-encrypt under the current key) for actually retiring an old key after rotation. Full rotation procedure, for every secret in the system (not just this one), is in **`docs/runbooks/secret-rotation.md`** (new).

### 1.5 Development / staging / production separation

`NODE_ENV` is validated as part of the core schema (`"development" | "staging" | "production" | "test"`, defaulting to `"development"`). In production specifically, `getEnv()` rejects `JWT_ACCESS_SECRET`/`COMMERCE_ENCRYPTION_KEY` outright if they still hold the exact placeholder strings from `.env.example` — a real secret that was never generated is a startup failure in production, not a silently-accepted configuration. Verified this both as a unit test and by direct inspection of the rejection logic. Staging is documented as expected to run with the *same* strictness as production (real secrets, just pointed at non-production infrastructure), not a relaxed environment.

---

## 2. Files Changed

**New:**
- `apps/api/src/config/env.ts`
- `apps/api/src/config/env.test.ts`
- `docs/runbooks/environment-configuration.md`
- `docs/runbooks/secret-rotation.md`
- `docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_3_COMPLETION_REPORT.md` (this file)

**Modified:**
- `apps/api/src/index.ts` — `assertStartupEnv()` + safe summary logging, `PORT`/`NODE_ENV` via `getEnv()`
- `apps/api/src/app.ts` — `FRONTEND_URL`/`IMPORT_UPLOAD_DIR` via the shared helpers
- `apps/api/src/lib/{jwt,encryption,prisma,file-storage,release-storage}.ts`
- `apps/api/src/modules/commerce/customers/{customer-jwt,customers.service}.ts`
- `apps/api/src/modules/commerce/cart/cart.service.ts`
- `apps/api/src/modules/commerce/fulfillment/{fulfillment.service,stale-offer-scheduler}.ts`
- `apps/api/src/modules/commerce/events/outbox-scheduler.ts`
- `apps/api/src/modules/commerce/notifications/providers/email.provider.ts`
- `apps/api/src/modules/imports/{vision-extractor,import.routes}.ts`, `adapters/website.adapter.ts`, `adapters/google-maps/places-client.ts`
- `apps/api/src/modules/sites/{brand-analysis,content-generator,domain.service,public-render.routes,site.service,site.routes}.ts`, `scoring/brand-consistency-score.ts`
- `apps/api/prisma/seed.ts`
- `apps/api/src/lib/encryption.test.ts` — extended for versioned envelope + rotation + legacy-format backward compatibility
- `apps/api/.env.example` — documents `NODE_ENV`, `COMMERCE_ENCRYPTION_KEY_PREVIOUS`, and `JWT_REFRESH_SECRET`'s actual (unused) status

**Explicitly not touched:** any Dockerfile/`docker-compose.yml` (Phase 4), any Redis client/config (Phase 5), and every file listed in §1.3's "deliberately left unchanged."

---

## 3. Tests Added / Extended

- **`config/env.test.ts`** (new, 26 tests): aggregated multi-error reporting; defaults for `NODE_ENV`/`PORT`; memoization; the production-only placeholder rejection (and its absence in development); acceptance of `staging`/`test` as valid environments; `COMMERCE_ENCRYPTION_KEY` hex-format validation; `COMMERCE_ENCRYPTION_KEY_PREVIOUS` acceptance; and every helper function (`requireEnv`, `getStringEnv`, `getNumberEnv`, `getOptionalEnv`, `getSafeEnvSummary`) exercised in isolation, including `getSafeEnvSummary()`'s output verified to never contain an actual secret value via a direct string-search assertion.
- **`lib/encryption.test.ts`** (extended): the new 4-part versioned format; rejection of an unrecognized key version; backward-compatible decryption of a hand-constructed legacy 3-part ciphertext; a full key-rotation round trip (encrypt under an old key, rotate it to `COMMERCE_ENCRYPTION_KEY_PREVIOUS`, decrypt successfully under the new configuration); a clear error when a previous-key envelope is presented but `COMMERCE_ENCRYPTION_KEY_PREVIOUS` isn't set; `reencryptSecret()` migrating both a previous-key envelope and a legacy envelope onto the current key.

---

## 4. Verification Results

| Step | Result |
|------|--------|
| `prisma validate` | ✅ Pass |
| `prisma generate` | ✅ Pass |
| `pnpm -r lint` (api + web) | ✅ Pass, no warnings |
| `pnpm -r typecheck` (api + web) | ✅ Pass |
| `pnpm -r test` | ✅ **855 / 855 passing** (846 `apps/api` + 9 `apps/web`, up from 813/9 before this phase — net new: `config/env.test.ts`'s 26 tests plus `encryption.test.ts`'s expanded coverage) |
| `pnpm -r build` (api `tsc`, web `next build`) | ✅ Pass, all 28 web routes compiled |
| **Live boot check** (this sandbox's local Postgres, compiled `dist/`) | ✅ Failed clearly and immediately with `COMMERCE_ENCRYPTION_KEY` unset; booted cleanly and logged a redacted config summary once set |

Two real regressions were caught and fixed during this phase's own verification, before being called "done":
1. `lib/prisma.ts`'s initial eager `getEnv()` call broke two existing test files (`hours.service.test.ts`, `tables.controller.test.ts`) that transitively import it without mocking — fixed by switching that one file to the non-throwing `getStringEnv("DATABASE_URL", "")`, since the real validation point is `index.ts`'s `assertStartupEnv()`, not every Prisma-client importer.
2. An encryption test's expected error message (`"unknown key version"`) didn't match the initial implementation's generic `"Malformed encrypted secret"` — fixed by making `decryptSecret()` distinguish "wrong number of parts" from "right shape, unrecognized version number" with a more specific error.

No test was skipped, weakened, or deleted to make the suite pass.

---

## 5. Notes / What's Deliberately Deferred

- **`JWT_ACCESS_SECRET` rotation is not versioned** (unlike the encryption key) — rotating it invalidates every active session immediately. This is documented explicitly in `secret-rotation.md` as a known, current limitation with a suggested future enhancement (token-versioning), not silently glossed over.
- **Actual secrets-manager selection** (AWS Secrets Manager vs. a hosting platform's native encrypted env-var store) is a Phase 4-dependent decision, not made here — `environment-configuration.md`/`secret-rotation.md` describe the *procedures*, independent of which storage backend eventually holds the values.
- **No cloud secrets infrastructure was provisioned** — this phase's verification used only local environment variables and this sandbox's local PostgreSQL instance, consistent with every prior phase's environment constraints.

---

*Phase 3 complete. Waiting for your review before Phase 4 (Deployment Architecture & Containerization) begins.*
