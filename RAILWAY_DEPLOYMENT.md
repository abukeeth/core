# Railway Deployment — API service only (`apps/api`)

This repository is prepared to deploy **only the API service** (`apps/api`)
on Railway. The Next.js frontend (`apps/web`) is **not** deployed here — it
stays on Vercel (or your chosen frontend host). Railway hosts the backend
API alone.

The whole configuration lives in a single file at the repo root:
[`railway.json`](./railway.json). Because it is named `railway.json`,
Railway auto-detects it — no "Config File Path" needs to be set in the
dashboard.

## Why one root config, filtered to `api`

This is a **shared pnpm workspace**: one `pnpm-lock.yaml` + one
`pnpm-workspace.yaml` at the repo root, with every app's dependencies
resolved against that single lockfile. Railway's own monorepo guidance
recommends *not* setting a per-service Root Directory for this kind of
workspace, and instead differentiating a service purely by build/start
commands scoped with `pnpm --filter <app>`, run from the repo root where
the lockfile actually lives.

Setting a subdirectory Root Directory (`apps/api`) is the less reliable
option for pnpm workspaces — several real reports of "pnpm not being used"
or a missing lockfile on Railway trace back to exactly that setup. So
`railway.json` keeps the build context at the repo root and filters every
command to the `api` workspace package. This is what makes Railway
"correctly detect the monorepo structure": it builds from the root, uses
the root lockfile, and only ever touches `apps/api`.

## `railway.json` (repo root)

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "RAILPACK",
    "buildCommand": "pnpm --filter api prisma:generate && pnpm --filter api build"
  },
  "deploy": {
    "preDeployCommand": "pnpm --filter api prisma:migrate:deploy && pnpm --filter api seed:if-empty",
    "startCommand": "pnpm --filter api start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### Build command

```
pnpm --filter api prisma:generate && pnpm --filter api build
```

- `prisma:generate` runs `prisma generate` so the Prisma Client is present
  for the TypeScript compile. (`build` itself also runs `prisma generate`
  before `tsc`; keeping it explicit here makes generation a guaranteed,
  self-documenting build step even if the package script changes — a second
  generate is idempotent and cheap.)
- `build` = `prisma generate && tsc -p tsconfig.json`, compiling
  `src`, `prisma`, and `scripts` to `apps/api/dist/` (the compiled
  `dist/scripts/seed-if-empty.js` used below comes from this step).

### Start command

```
pnpm --filter api start
```

- `start` = `node dist/src/index.js` — **just the server, no migrations**.
  Migrations are deliberately *not* part of start (see the migration
  strategy below), so a container restart or an added replica never
  re-runs them.

### Migration strategy (safe, once per deploy — not on every boot)

```
preDeployCommand: pnpm --filter api prisma:migrate:deploy && pnpm --filter api seed:if-empty
```

Railway's **pre-deploy command** runs after the build but *before* the new
version starts serving, and it runs **once per deployment** — not on every
container restart, replica scale-up, or crash-recovery boot. If it fails,
the deployment is aborted and the previous healthy version keeps serving
traffic. This is exactly the safe place for schema changes.

- `prisma:migrate:deploy` = `prisma migrate deploy`, which only applies
  already-committed migration files in `apps/api/prisma/migrations/` (never
  `db push`, never generates new migrations). It is safe to run repeatedly
  and is a no-op when the database is already up to date.
- `seed:if-empty` = `node dist/scripts/seed-if-empty.js`, an idempotent
  bootstrap that creates the single platform `ADMIN` account only when none
  exists yet, and is a no-op on every deploy after the first.

This is the key difference from the container's own `apps/api/scripts/start.sh`
(used by the Docker/Render path), which runs `prisma migrate deploy` on
**every** container start. On Railway we move that off the hot boot path
into the pre-deploy phase so migrations run once per release, not on every
boot — satisfying "do not run unnecessary migrations on every boot" while
still guaranteeing the schema is current before the new version accepts
traffic.

> Note: the pre-deploy command needs `DATABASE_URL` reachable in a way that
> supports DDL. If you use a connection pooler (e.g. Supabase Supavisor,
> PgBouncer) in *transaction* mode, point `DATABASE_URL` at the **direct**
> or **session-pooler** connection for migrations to apply reliably.

### Health check

`healthcheckPath: /health` is the liveness-only route in `apps/api/src/app.ts`
(no DB dependency — distinct from `/ready`, which does check the database).
`healthcheckTimeout: 300` gives the first boot room before Railway marks it
unhealthy.

## Railway settings required (dashboard)

1. railway.app → **New Project** → **Deploy from GitHub repo** → select
   this repository. This creates **one** service — the API. Do **not** add a
   second service; only the API is deployed from this repo.
2. **Settings → General** → rename the service to `ordervora-api` (optional).
3. **Settings → Config-as-code** → leave the Config File Path empty/default;
   Railway auto-detects the root `railway.json`.
4. **Root Directory** → leave at the repo root (`/`). Do **not** set it to
   `apps/api` — see the pnpm-workspace note above.
5. **Settings → Networking → Generate Domain** → note the assigned URL
   (e.g. `ordervora-api-production.up.railway.app`).
6. **Settings → Variables** → add the variables below.

### Environment variables

Railway exposes service variables to the **build**, **pre-deploy**, and
**runtime** phases, so a single set of variables covers all three. None of
these are stored in this repo — this file only documents *which* variables
to set, never their values (this is a public repository).

**Core — required for the process to boot** (validated by
`apps/api/src/config/env.ts`; missing/invalid any of these crashes startup):

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Injected by Railway automatically; the app reads `process.env.PORT`. Only set it manually if you want to pin one. |
| `DATABASE_URL` | PostgreSQL connection string. **Must be set before the first build** — `prisma generate` loads `prisma.config.ts`, which resolves `DATABASE_URL`. Use a direct/session connection (not a transaction pooler) so pre-deploy migrations apply. Append `sslmode=require` in production. |
| `FRONTEND_URL` | The frontend origin allowed to make credentialed requests (your Vercel/web URL). |
| `JWT_ACCESS_SECRET` | Random 256-bit secret, e.g. `openssl rand -hex 32`. |
| `JWT_ACCESS_TTL` | e.g. `15m`. |
| `JWT_REFRESH_TTL` | e.g. `30d`. |
| `COMMERCE_ENCRYPTION_KEY` | **Must be 64-char hex** — generate with `openssl rand -hex 32`. Envelope-encryption key for stored provider credentials. |

**Required for the seed step** (`seed:if-empty` bootstraps the ADMIN account
on first deploy):

| Variable | Notes |
|---|---|
| `ADMIN_EMAIL` | Platform admin login. |
| `ADMIN_PASSWORD` | Must **not** be the `.env.example` placeholder — rejected in production. |
| `ADMIN_NAME` | Display name. |

**SMTP — transactional order emails** (nodemailer; works with any SMTP
provider, e.g. Resend's SMTP relay):

| Variable | Notes |
|---|---|
| `SMTP_HOST` | |
| `SMTP_PORT` | e.g. `587`. |
| `SMTP_USER` | |
| `SMTP_PASSWORD` | |
| `SMTP_FROM_ADDRESS` | e.g. `orders@yourdomain.com`. |

**Feature-specific secrets** (app boots without them; the specific feature
fails until set):

| Variable | Feature |
|---|---|
| `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`) | AI features (menu import, brand analysis, content generation, Brand Consistency judge). Priority: OpenAI → Anthropic → Gemini; set at least one. |
| `GOOGLE_MAPS_API_KEY` | Google Places import (optional). |
| `SITE_PLATFORM_DOMAIN` | Custom-domain CNAME verification for published sites. |
| `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY` | Durable S3-compatible storage for uploads/published assets. Without it, files fall back to **ephemeral local disk** (lost on every redeploy/restart). Strongly recommended before real usage. |

**Optional, safe to omit** (documented defaults / fail-open behavior):
`REDIS_URL` (rate limiting falls back to in-process), `LOG_LEVEL`,
`SENTRY_DSN`, `RATE_LIMIT_*` overrides, `JWT_REFRESH_SECRET` (documented but
not read by any module today), `COMMERCE_ENCRYPTION_KEY_PREVIOUS` (only
during key rotation). See `apps/api/.env.example` for the full inventory.

## Risks / considerations

1. **`DATABASE_URL` must be set before the first build.** `prisma generate`
   loads `prisma.config.ts`, which resolves `DATABASE_URL` even though
   generation does not connect to the DB. Railway makes service variables
   available at build time, so setting it before the first deploy is enough
   — but if it is missing, the build fails.
2. **Pooler mode for migrations.** `prisma migrate deploy` (in the
   pre-deploy phase) needs DDL/multi-statement support. A *transaction*-mode
   pooler (e.g. Supabase Supavisor on port `6543`, PgBouncer transaction
   mode) does not reliably support this — use the **direct** connection or a
   **session-mode** pooler for `DATABASE_URL`.
3. **Ephemeral local storage without object storage.** If the
   `OBJECT_STORAGE_*` variables are unset, uploaded menu photos / import
   files / published-site assets are written to local disk, which does not
   persist across Railway redeploys/restarts. Configure S3-compatible
   storage before real usage.
4. **`FRONTEND_URL` bootstrapping order.** If the frontend is deployed
   separately and points at this API, set `FRONTEND_URL` to a placeholder
   first, deploy the frontend, then update `FRONTEND_URL` to its real domain
   (Railway redeploys automatically on a variable change).
5. **First-deploy admin bootstrap.** The very first deploy seeds the ADMIN
   account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`. Ensure
   those are set (and not placeholders) before the first deploy, or the
   pre-deploy seed step fails.

## Relationship to the existing Render/Docker path

This Railway configuration does **not** replace the existing Render + Docker
setup (`render.yaml`, `apps/api/Dockerfile`, `apps/api/scripts/start.sh`).
Those are unchanged and remain a valid, independent deployment path for the
same code. Railway is an additional, API-only target that can point at the
same database.
