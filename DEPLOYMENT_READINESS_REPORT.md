# Backend Deployment Plan — Render (`apps/api`)

## Recommended Deployment Method: **Docker**

The repo already standardizes on this — `render.yaml` specifies `runtime: docker`, and `apps/api/Dockerfile` is a production-hardened multi-stage build. Docker is the only viable option here because:
- The service runs **in-process background workers** (outbox drain, stale-offer sweep, SSL-issuance sweep — started in `src/index.ts`) that require a long-running, continuously-alive process — incompatible with a serverless/native-build model.
- Migrations + an idempotent seed (`apps/api/scripts/start.sh`) run as the container's own entrypoint, not a platform-specific hook, so the image behaves identically anywhere.
- A native (buildpack) build would need to reimplement the same multi-stage dependency/prod-deps split by hand for no benefit.

No changes needed to reach this conclusion — it's already the codebase's own documented decision (see comments at the top of `render.yaml` and `docs/runbooks/render-deploy.md`).

---

## Render Deployment Configuration

| Setting | Value | Source |
|---|---|---|
| Service type | Web Service | `render.yaml` |
| Runtime | Docker | `render.yaml: runtime: docker` |
| Root Directory | repo root (`.`) — **not** `apps/api` | `dockerContext: .` (pnpm workspace build needs root `pnpm-lock.yaml`/`pnpm-workspace.yaml` in context) |
| Dockerfile Path | `./apps/api/Dockerfile` | `render.yaml` |
| Build Command | *(none — Docker build handles it)* | multi-stage `Dockerfile`: `pnpm fetch` → `pnpm install --filter api...` → `prisma generate` → `tsc build` → separate `--prod` install stage |
| Start Command | *(none — Dockerfile `CMD`)* | `./scripts/start.sh` → `prisma migrate deploy` → `seed-if-empty.js` → `exec node dist/src/index.js` |
| Port | `4000` | `EXPOSE 4000`, `PORT` env var |
| Health Check Path | `/health` | `render.yaml`, confirmed liveness-only route in `app.ts` (no DB dependency — distinct from `/ready`, which does check DB) |
| Plan | Free (upgradeable later) | `render.yaml: plan: free` |

**Note:** Free-plan spin-down after 15 min idle (30–60s cold start on wake) is a known, documented trade-off — not a defect.

---

## Required Environment Variables

**Core / required for the process to boot** (validated by `src/config/env.ts`'s `assertStartupEnv()` — missing/invalid any of these crashes startup):

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` (literal in `render.yaml`) |
| `PORT` | `4000` (literal in `render.yaml`) |
| `DATABASE_URL` | Supabase Postgres connection string — see **Blocker #1** below on pooler mode |
| `FRONTEND_URL` | Vercel web app URL — not known until Step 2 (web deploy) is done |
| `JWT_ACCESS_SECRET` | Render `generateValue: true` — fine, arbitrary random string is acceptable |
| `JWT_ACCESS_TTL` | `15m` (literal) |
| `JWT_REFRESH_TTL` | `30d` (literal) |
| `COMMERCE_ENCRYPTION_KEY` | **Must be manually generated** — `openssl rand -hex 32`. Render's `generateValue: true` produces base64, which fails the app's 64-char-hex regex validation at startup. `render.yaml` correctly marks this `sync: false`, not `generateValue: true`. |

**Required for the seed step to succeed** (`start.sh` runs `seed-if-empty.js`, which bootstraps the ADMIN account):

| Variable | Notes |
|---|---|
| `ADMIN_EMAIL` | |
| `ADMIN_PASSWORD` | Must not be left as the `.env.example` placeholder — `requireEnv()` rejects known placeholder strings in production |
| `ADMIN_NAME` | |

**Required for specific features to function** (app boots without them, but the feature silently/explicitly fails):

| Variable | Feature |
|---|---|
| `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`) | AI features: menu import, brand analysis, content generation, Brand Consistency judge. Priority order OpenAI → Anthropic → Gemini; set at least one. |
| `GOOGLE_MAPS_API_KEY` | Google Places import (optional feature) |
| `SITE_PLATFORM_DOMAIN` | Custom-domain CNAME verification for published sites |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS` | Transactional order emails |

**Optional, safe to omit** (documented defaults/fail-open behavior): `REDIS_URL` (rate limiting falls back to in-process), `OBJECT_STORAGE_*` (falls back to local disk — **not persistent on Render's free plan**), `LOG_LEVEL`, `SENTRY_DSN`, `RATE_LIMIT_*` overrides, `JWT_REFRESH_SECRET` (declared but unused by any module), `COMMERCE_ENCRYPTION_KEY_PREVIOUS` (rotation only).

---

## Verification Results

- **`render.yaml`**: Valid, matches the Dockerfile, declares every env var the app's core schema requires, correctly distinguishes `sync: false` (secrets/unknowns) from `generateValue: true` (safe to auto-generate) from literals. One gap noted below (Blocker #3).
- **Prisma configuration**: `prisma.config.ts` resolves `DATABASE_URL` via `env()`; `schema.prisma`'s datasource has no hardcoded provider URL. `lib/prisma.ts` uses `@prisma/adapter-pg` with a hand-built `pg` `PoolConfig` (not a raw `connectionString`) specifically so SSL settings survive — already written with Supabase's Supavisor pooler in mind (`ssl: { rejectUnauthorized: false }` when `sslmode` is present). No `directUrl` is configured/needed for the driver-adapter path used here.
- **`DATABASE_URL` usage**: Single source of truth, read in exactly two places (`prisma.config.ts` for the CLI, `lib/prisma.ts` for the app) — no drift risk.
- **Production readiness**: Startup fails fast and loud on missing/placeholder secrets (`assertStartupEnv()`), graceful SIGTERM shutdown, non-root container user, read-only-friendly image, structured logging with no secret leakage (`getSafeEnvSummary()`), `/health` vs `/ready` correctly separated (liveness vs DB-dependent readiness), Prometheus `/metrics` exposed. This is materially more production-hardened than a typical MVP.

---

## Blockers / Considerations

1. **Supabase pooler mode for `DATABASE_URL` (real risk, not yet resolved by config alone).** `start.sh` runs `prisma migrate deploy` on **every container start**, including restarts. Supabase's Supavisor pooler in *transaction* mode (port `6543`) does not reliably support the DDL/multi-statement behavior `prisma migrate deploy` needs. **Action before deploy:** use Supabase's **direct connection** string or the **Session pooler** (port `5432`), not the Transaction pooler, for `DATABASE_URL`. This must be decided when provisioning the Supabase project, before pasting the value into Render.
2. **`FRONTEND_URL` has a bootstrapping order dependency.** It can't be set to its real value until the Vercel app is deployed (which itself needs the Render API's URL for `API_URL`). Not a blocker to *creating* the Render service, but confirm the two-step sequence (Render first with a placeholder → Vercel → back to Render to set the real value) is followed, per `docs/runbooks/render-deploy.md`.
3. **`render.yaml` only wires `OPENAI_API_KEY`**, not `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`, even though the app supports all three as alternatives. Not a functional blocker (OpenAI works out of the box if that key is set), but if the intent is to use Anthropic or Gemini instead, that var must be added manually in Render's dashboard since Blueprint sync won't prompt for it.
4. **Object storage is not configured by default** — uploaded files (menu import assets, published-site assets) fall back to local disk, which does **not persist** across Render restarts/deploys on the free plan. Not a boot blocker, but a real data-loss trap if left unaddressed before real usage — see `docs/runbooks/object-storage.md` if persistence is needed pre-launch.
5. **Stale non-Render deployment artifacts present in the repo**: `railway.api.json`, `railway.web.json`, `RAILWAY_DEPLOYMENT.md`. These reference the Railway platform (not the old GitHub repo — no rule violation), and Render ignores them entirely, so they are not a functional blocker. Flagging only because "old infrastructure abandoned" — recommend removing or clearly marking them stale in a later cleanup pass, not part of this deployment.
6. **No blocker found** in build reproducibility, Node version pinning, health check wiring, or secret-placeholder rejection — all already handled correctly in the existing code.

---

## Deployment Checklist (for execution, not run yet)

- [ ] Confirm `abukeeth/core`'s default branch is `main` on GitHub (platform Blueprint import reads the default unless explicitly overridden)
- [ ] Provision Supabase Postgres project; copy the **direct or Session-pooler** connection string (not Transaction pooler) with `sslmode=require`
- [ ] Generate `COMMERCE_ENCRYPTION_KEY` via `openssl rand -hex 32` (cannot use Render's auto-generate)
- [ ] Choose and obtain one AI provider key (OpenAI recommended, matches `render.yaml`)
- [ ] Obtain SMTP credentials for transactional email
- [ ] Choose a strong `ADMIN_PASSWORD` (not the `.env.example` placeholder)
- [ ] Render → New → Blueprint → select `abukeeth/core` → explicitly select `main` branch → Apply
- [ ] Fill every `sync: false` prompt (`DATABASE_URL`, `COMMERCE_ENCRYPTION_KEY`, `ADMIN_*`, `SMTP_*`, `OPENAI_API_KEY`; `FRONTEND_URL` as temporary placeholder)
- [ ] Wait for build, note the assigned Render URL
- [ ] Confirm `<url>/health` returns `200` with `status: "ok"`
- [ ] Confirm `<url>/ready` returns `200` (validates DB connectivity/pooler choice from item 2)
- [ ] (Later, after Vercel deploy) return to Render and set real `FRONTEND_URL`

No services were created or deployed — this is a plan only, per instructions.
