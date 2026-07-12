# Environment Configuration

Part of Production Hardening Phase 3 (`PRODUCTION_HARDENING_MASTER_SPEC.md`). Covers the centralized config module (`apps/api/src/config/env.ts`), the development/staging/production separation, and how "no secret values can appear in logs" is actually enforced rather than just asserted.

## Why a centralized config module

Before Phase 3, five different files each defined their own local copy of the same "read one env var, throw if missing" helper (`lib/jwt.ts`, `lib/encryption.ts`, `customer-jwt.ts`'s `requireSecret`, `prisma/seed.ts`, `notifications/providers/email.provider.ts`), and roughly a dozen other call sites read `process.env.X` directly with their own inline default (`Number(process.env.CART_TTL_MINUTES ?? 120)` and similar, scattered across cart/fulfillment/import/site/event modules). `apps/api/src/config/env.ts` consolidates all of it into one place with one implementation per pattern.

## Two access patterns

### `getEnv()` — the core, always-required configuration

```ts
import { getEnv } from "../config/env";
const { DATABASE_URL, JWT_ACCESS_SECRET } = getEnv();
```

Validates the following as one unit, via a Zod schema, memoized after the first successful call:

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | no (defaults `"development"`) | `"development" \| "staging" \| "production" \| "test"` |
| `PORT` | no (defaults `4000`) | coerced to a number |
| `DATABASE_URL` | **yes** | |
| `FRONTEND_URL` | **yes** | CORS origin + password-reset link base |
| `JWT_ACCESS_SECRET` | **yes** | |
| `JWT_ACCESS_TTL` | **yes** | duration string, e.g. `"15m"` |
| `JWT_REFRESH_TTL` | **yes** | duration string, e.g. `"30d"` |
| `COMMERCE_ENCRYPTION_KEY` | **yes** | must be 64 hex characters (32 bytes) |
| `COMMERCE_ENCRYPTION_KEY_PREVIOUS` | no | key-rotation support — see `secret-rotation.md` |

If any required field is missing or invalid, `getEnv()` throws **one error listing every problem at once** — not "fix the first one, rerun, discover the second one." In production specifically, `JWT_ACCESS_SECRET` and `COMMERCE_ENCRYPTION_KEY` are also rejected outright if they still hold the exact placeholder string from `.env.example` (e.g. `"replace-with-a-random-256-bit-secret"`) — a real secret that was never generated is a production-readiness bug, not a valid configuration, and this fails startup rather than silently running with an example value.

`assertStartupEnv()` is the same validation, called once and only for its side effect (throwing if invalid) — this is what `src/index.ts` calls first, before creating the Express app or accepting any connection. See `ci-cd-pipeline.md` for how this interacts with the CI environment's placeholder values.

**Why `getEnv()` is lazy, not eager-at-import:** importing a module that calls `getEnv()` doesn't require every core variable to already be set — validation happens on first *call*, not on first *import*. This matters for `lib/jwt.ts` specifically: before Phase 3, its three required variables were read at module top level, which meant every test file that transitively imported it needed those variables pre-set, purely as an accident of import order. Phase 3 relaxed this deliberately (see the code comment in `lib/jwt.ts`) — it's a backward-compatible relaxation, not a behavior change for the real running app, since `index.ts` still validates everything before the server starts serving traffic either way.

**Exception: `lib/prisma.ts` deliberately does *not* use `getEnv()`.** It uses the narrow `getStringEnv("DATABASE_URL", "")` instead, because several existing test files import service modules that transitively import `lib/prisma.ts` without mocking it, and previously relied on `PrismaPg`'s tolerance of an undefined/empty connection string at construction time (it only fails on an actual query, which those tests never make). Using `getEnv()` there would throw at import time for those tests. The real enforcement for "the database connection string must actually be valid" is `assertStartupEnv()` in `index.ts` — that's the layer that's supposed to catch this, not every individual module that happens to import the Prisma client.

### `requireEnv` / `getStringEnv` / `getNumberEnv` / `getOptionalEnv` — everything else

For configuration that's only required when a specific feature is actually used (not required for the process to boot at all):

```ts
import { requireEnv, getStringEnv, getNumberEnv, getOptionalEnv } from "../config/env";

requireEnv("SMTP_HOST");                          // throws if missing — email.provider.ts
getStringEnv("IMPORT_UPLOAD_DIR", "uploads");     // default if unset — file-storage.ts
getNumberEnv("CART_TTL_MINUTES", 120);            // default if unset, throws if non-numeric
getOptionalEnv("ANTHROPIC_API_KEY");               // undefined if unset, no default
```

Every one of these reads `process.env` directly, with no schema validation and no memoization — cheap, and safe to call from anywhere without the "is the rest of the app's config also valid" concern that `getEnv()` deliberately carries. `customer-jwt.ts` is the clearest example of why this split matters: it needs `JWT_ACCESS_SECRET`/`JWT_ACCESS_TTL` specifically, and using the narrow helpers means it doesn't also implicitly require `DATABASE_URL`/`COMMERCE_ENCRYPTION_KEY`/etc. just to sign a customer token.

### `getSafeEnvSummary()` — the only thing that should ever be logged

```ts
console.log("Environment configuration loaded:", getSafeEnvSummary());
// { NODE_ENV: "set", DATABASE_URL: "set", ANTHROPIC_API_KEY: "unset", ... }
```

Returns `"set"` or `"unset"` for every known environment variable this application reads anywhere (`KNOWN_ENV_KEYS` in `config/env.ts`) — **never the underlying value**. This is what `index.ts` logs at startup. No other startup or diagnostic logging in this codebase should ever call `console.log(process.env)`, `console.log(getEnv())`, or otherwise print a config object directly — a repo-wide audit (`git grep` for `console.(log|error|warn|debug)` calls passing `process.env` or a config object literally) found none as of this phase; keep it that way.

## Development / staging / production separation

`NODE_ENV` (validated as part of the core schema above) is the single switch between the three real environments, plus vitest's own `"test"`:

- **`development`** (the default) — used for local work. `.env.example` documents placeholder values appropriate here; the production placeholder-value rejection in `getEnv()` does not apply.
- **`staging`** — intended to run with the *same* strictness as production (real, generated secrets — not `.env.example` placeholders — a real staging database, etc.), just pointed at non-production infrastructure (a separate database, separate BYOP provider sandbox credentials where applicable). Treat a staging environment's configuration as a dress rehearsal for production's, not a relaxed version of development's.
- **`production`** — `getEnv()` actively rejects `JWT_ACCESS_SECRET`/`COMMERCE_ENCRYPTION_KEY` if they still match the known `.env.example` placeholder strings (see the table above). Cookie `secure` flags (`modules/auth/cookies.ts`, `customer-cookies.ts`, `cart/guest-session.ts`) already check `NODE_ENV === "production"` directly — deliberately left as their own simple, narrow check rather than routed through the shared config module (see the note below).
- **`test`** — set automatically by Vitest; treated as a normal, valid enum value so the test suite's own `NODE_ENV` doesn't trip any validation.

**Why the three cookie files (`modules/auth/cookies.ts`, `customers/customer-cookies.ts`, `cart/guest-session.ts`) still read `process.env.NODE_ENV` directly, not through `getEnv()`:** these compute a single boolean (`secure: NODE_ENV === "production"`) at module top level. Routing this through `getEnv()` would mean importing any of these three files — which several test files do directly, without mocking, to test cookie-setting behavior in isolation — would suddenly require the *entire* core schema (database URL, JWT secrets, encryption key) to be valid just to check a cookie flag. That's a broader requirement than these files actually have, and would have broken existing test coverage for no behavioral benefit. Left untouched deliberately, not overlooked.

## The full environment variable inventory

Every variable this application reads anywhere, and where: see `KNOWN_ENV_KEYS` in `apps/api/src/config/env.ts` for the authoritative, single list (also what `getSafeEnvSummary()` reports on). `apps/api/.env.example` documents each with generation instructions where relevant (`openssl rand -hex 32` for the two 256-bit secrets and the encryption key).

## Verification

`apps/api/src/config/env.test.ts` covers: aggregated multi-error reporting, defaults, the production placeholder rejection (and its absence in development), memoization, and every helper function (`requireEnv`, `getStringEnv`, `getNumberEnv`, `getOptionalEnv`, `getSafeEnvSummary`) in isolation.
