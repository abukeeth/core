# Render Deployment Guide — `ordervora-api`

> **Superseded for the current architecture.** As of Production Phase 2C, `render.yaml` also deploys a second service, `ordervora-web` (`apps/web`), and Vercel is no longer used at all. Everything below about `ordervora-api` remains accurate and unchanged (verified — see `docs/reports/RENDER_BLUEPRINT_FINAL.md`'s own `render.yaml` re-verification), but for the complete, current, two-service picture, use `docs/reports/RENDER_BLUEPRINT_FINAL.md` instead. This document is kept for its still-accurate `ordervora-api` detail, not as the current end-to-end guide.

Deployment Phase 2 — final, screen-by-screen guide for deploying `apps/api` to Render via Blueprint (`render.yaml`). No deployment was performed and no code was modified while producing this report; it is a preparation document only.

Source files reviewed: `render.yaml`, `apps/api/Dockerfile`, `pnpm-workspace.yaml`, `package.json` (root), `apps/api/package.json`, `apps/api/scripts/start.sh`, `apps/api/.env.example`, `apps/api/src/config/env.ts`, `docs/reports/SUPABASE_SETUP_REPORT.md`, `docs/reports/DEPLOYMENT_READINESS_REPORT.md`.

---

## 1. Prerequisites (must be in hand before starting)

| Item | Source |
|---|---|
| GitHub repo `abukeeth/core`, default branch `main` | Already done (Phase prior) |
| Supabase **Session Pooler** `DATABASE_URL` (with real password + `sslmode=require`) | `docs/reports/SUPABASE_SETUP_REPORT.md` §4/§8 |
| An OpenAI API key (or Anthropic/Gemini) | OpenAI dashboard |
| SMTP credentials (host/port/user/password/from-address) | Your SMTP/email provider (e.g. Resend's SMTP relay) |
| A strong `ADMIN_PASSWORD`, plus `ADMIN_EMAIL` / `ADMIN_NAME` you choose | Chosen by you |
| `COMMERCE_ENCRYPTION_KEY` = `openssl rand -hex 32` output | Generate locally before starting |

---

## 2. Deployment Method — Confirmed

**Docker**, via Render Blueprint (`render.yaml` at repo root drives the entire service definition — no manual field-by-field service creation is needed or should be used).

Reasoning (re-verified this phase):
- `render.yaml` line 24: `runtime: docker`.
- `apps/api/Dockerfile` is a complete multi-stage production build (fetch → build → prod-deps → runtime); no native/buildpack build is defined or appropriate.
- `apps/api/src/index.ts` starts three in-process background schedulers (outbox worker, stale-offer sweep, SSL-issuance sweep) — this requires a continuously running container, not a serverless/native-build function target.

---

## 3. Every Render Screen, Field, and Value

### Screen 1 — Dashboard → New

- Click **New +** (top right) → select **Blueprint** from the dropdown.

### Screen 2 — Connect Repository

- Field: **GitHub repository** — select `abukeeth/core`. (If not listed, use "Configure account" to grant Render access to this repo first.)
- Render will detect `render.yaml` at the repo root automatically.

### Screen 3 — Blueprint Branch Selection

- Field: **Branch** — this is a dropdown that defaults to whatever GitHub reports as the default branch. **Explicitly confirm/select `main`** — do not accept a default without checking, per this project's own runbook (`docs/runbooks/render-deploy.md`) warning that an unconfirmed branch can silently deploy stale code.
- Value: `main`

### Screen 4 — Blueprint Preview

Render parses `render.yaml` and shows a preview of the one service it will create:

| Field (as shown in preview) | Value |
|---|---|
| Service name | `ordervora-api` |
| Type | Web Service |
| Environment | Docker |
| Plan | Free |
| Region | *(Render's default selection — pick one geographically close to the chosen Supabase region to minimize DB latency; not pinned in `render.yaml`)* |

Click **Apply** (or **Create New Resources**, depending on Render's current button label) to proceed.

### Screen 5 — Environment Variable Prompts

Render will prompt individually for every env var in `render.yaml` marked `sync: false` (it does not prompt for `generateValue: true` or literal `value:` entries — those are handled automatically). See §9 below for the complete list, mapped to source.

### Screen 6 — Service Dashboard (post-creation)

Once created, the service's own page has these relevant tabs:
- **Events** — build/deploy log stream. Watch this during first build.
- **Logs** — runtime `stdout`/`stderr` after the container starts.
- **Environment** — where env vars can be viewed/edited after creation (e.g. to set `FRONTEND_URL` later, per §7).
- **Settings** — where **Auto-Deploy** and **Health Check Path** are visible/editable (both are set here automatically by the Blueprint, but this is where to verify or change them manually).
- **Shell** — on-demand shell into the running container (used for the optional one-time demo-order seeding step documented in `docs/runbooks/render-deploy.md`, not required for a working deployment).

The top of the service page, once the first deploy succeeds, shows the assigned public URL (`https://ordervora-api-<hash>.onrender.com` or similar) — this is needed for the Vercel deployment step (Phase 3, out of scope here).

---

## 4. Docker Configuration

| Field | Value | Where set |
|---|---|---|
| Runtime | Docker | `render.yaml: runtime: docker` |
| Dockerfile Path | `./apps/api/Dockerfile` | `render.yaml: dockerfilePath` |
| Docker Build Context | `.` (repo root) | `render.yaml: dockerContext: .` |
| Exposed Port | `4000` | `Dockerfile: EXPOSE 4000`; must match `PORT` env var |
| Container entrypoint | `./scripts/start.sh` | `Dockerfile: CMD ["./scripts/start.sh"]` |
| Container user | `node` (non-root) | `Dockerfile: USER node` |
| Base image | `node:22.22.2-alpine` (pinned, not floating `:22-alpine`) | `Dockerfile: ARG NODE_VERSION=22.22.2` |
| Built-in HEALTHCHECK | `GET /health` every 30s, 5s timeout, 15s start period, 3 retries | `Dockerfile` — this is Docker's own container-level healthcheck, separate from (and in addition to) Render's platform-level health check in §6 |

**Root Directory field: leave blank / repo root.** This is a common point of confusion — do **not** set Render's "Root Directory" to `apps/api`. The Docker **build context** must be the repo root (`dockerContext: .`) because this is a pnpm workspace: `apps/api`'s dependencies resolve against the root `pnpm-lock.yaml` and `pnpm-workspace.yaml`, which must be present in the build context alongside `apps/api`'s own source. `render.yaml` does not set a separate `rootDir` field, so Render's default (repo root) is correct and required — the `dockerfilePath`/`dockerContext` fields alone tell Render where the Dockerfile and build context live.

### Build Command / Start Command

Both are **not applicable / not set as separate Render fields** — this is a Docker-runtime service, so Render does not show or use "Build Command" / "Start Command" text fields the way it would for a native-runtime service. All build logic lives inside the Dockerfile's stages; all start logic lives in the Dockerfile's `CMD`:

- **Build**: `pnpm fetch` (lockfile-only dependency prefetch) → `pnpm install --frozen-lockfile --filter api...` → `pnpm --filter api exec prisma generate` → `pnpm --filter api run build` (compiles `tsc`) → separate `--prod`-only install stage → slim runtime image assembly.
- **Start**: `./scripts/start.sh`, which runs, in order:
  1. `./node_modules/.bin/prisma migrate deploy` — applies all pending migrations.
  2. `node dist/scripts/seed-if-empty.js` — idempotent seed (creates the ADMIN account only if the database is empty).
  3. `exec node dist/src/index.js` — replaces the shell process so `SIGTERM` reaches Node directly for graceful shutdown.

---

## 5. Root Directory

**Value: repo root (leave the Root Directory field empty/default).**

Confirmed by `render.yaml`'s `dockerContext: .` combined with the Dockerfile's `COPY pnpm-workspace.yaml package.json tsconfig.base.json ./` and `COPY apps/api ./apps/api` steps, which require root-level workspace files to be present in the build context. Setting Root Directory to `apps/api` would break the build (missing lockfile/workspace manifest).

---

## 6. Branch

**Value: `main`.**

Set at Blueprint-connection time (Screen 3 above). After initial setup, this is also visible/editable under the service's **Settings** tab if it ever needs to change.

---

## 7. Health Check

| Field | Value | Notes |
|---|---|---|
| Health Check Path | `/health` | `render.yaml: healthCheckPath: /health` |
| Behavior | Liveness only — returns `200` with `{status: "ok", uptime, timestamp, workers}`; does **not** touch the database | `apps/api/src/app.ts` — deliberately distinct from `/ready`, which does check DB connectivity but is not used as Render's health check path |
| Effect | Render uses this to decide whether the service is up during and after deploys (gates zero-downtime deploy cutover) | Standard Render Docker web service behavior |

No action needed beyond confirming this value in the Blueprint preview (Screen 4) — it comes from `render.yaml` automatically.

---

## 8. Auto-Deploy Recommendation

**Recommendation: Enable Auto-Deploy (Render's default for Blueprint-created services).**

Rationale:
- The intended workflow going forward is: push to `main` → Render rebuilds and redeploys automatically. This matches the project's stated deployment model (`docs/runbooks/render-deploy.md` describes exactly this flow for the paired Vercel app, and nothing about `apps/api` suggests a different policy).
- Migrations are safe to run unattended on every boot: `start.sh` uses `prisma migrate deploy`, which is explicitly documented (`docs/runbooks/database-setup.md` §3) as idempotent and non-interactive — safe for automatic redeploys, unlike `migrate dev`/`db push`.
- If a stricter release process is later wanted (e.g. manual approval before production redeploys), Auto-Deploy can be turned off per-service under **Settings → Build & Deploy → Auto-Deploy** at that time — this is a reversible dashboard toggle, not a code or `render.yaml` change.

No action required to set this up initially — Blueprint services default to Auto-Deploy on; just confirm it's on under **Settings** after creation.

---

## 9. Every Environment Variable

Exactly as declared in `render.yaml`, in file order:

| # | Key | render.yaml directive | Prompted at Blueprint-apply? |
|---|---|---|---|
| 1 | `NODE_ENV` | `value: production` (literal) | No |
| 2 | `PORT` | `value: "4000"` (literal) | No |
| 3 | `DATABASE_URL` | `sync: false` | **Yes** |
| 4 | `FRONTEND_URL` | `sync: false` | **Yes** |
| 5 | `JWT_ACCESS_SECRET` | `generateValue: true` | No (Render generates it) |
| 6 | `JWT_REFRESH_SECRET` | `generateValue: true` | No (Render generates it) |
| 7 | `JWT_ACCESS_TTL` | `value: 15m` (literal) | No |
| 8 | `JWT_REFRESH_TTL` | `value: 30d` (literal) | No |
| 9 | `COMMERCE_ENCRYPTION_KEY` | `sync: false` | **Yes** |
| 10 | `ADMIN_EMAIL` | `sync: false` | **Yes** |
| 11 | `ADMIN_PASSWORD` | `sync: false` | **Yes** |
| 12 | `ADMIN_NAME` | `sync: false` | **Yes** |
| 13 | `SMTP_HOST` | `sync: false` | **Yes** |
| 14 | `SMTP_PORT` | `sync: false` | **Yes** |
| 15 | `SMTP_USER` | `sync: false` | **Yes** |
| 16 | `SMTP_PASSWORD` | `sync: false` | **Yes** |
| 17 | `SMTP_FROM_ADDRESS` | `sync: false` | **Yes** |
| 18 | `OPENAI_API_KEY` | `sync: false` | **Yes** |
| 19 | `GOOGLE_MAPS_API_KEY` | `sync: false` | **Yes** (optional feature — may be left blank if Google Places import isn't needed) |
| 20 | `SITE_PLATFORM_DOMAIN` | `sync: false` | **Yes** (only required if the custom-domain feature will be used) |

**Not in `render.yaml` at all** (documented gap, carried over from `docs/reports/DEPLOYMENT_READINESS_REPORT.md` Blocker #3): `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` — only relevant if OpenAI is not the chosen AI provider; would need to be added manually via the **Environment** tab after service creation, since Blueprint sync won't prompt for them.

### 10. Which Values Are Generated (by Render itself)

| Variable | How |
|---|---|
| `JWT_ACCESS_SECRET` | `generateValue: true` — Render generates a random value automatically, no input needed |
| `JWT_REFRESH_SECRET` | `generateValue: true` — same; note `apps/api/src/config/env.ts` documents this var as declared but not currently read by any module — kept reserved |

**Not Render-generated, must be generated manually beforehand:** `COMMERCE_ENCRYPTION_KEY`. Render's `generateValue: true` produces a base64 string; this app's startup validation (`apps/api/src/config/env.ts`, `HEX_32_BYTES` regex) requires an exact 64-character hex string, which only `openssl rand -hex 32` (run locally, pasted into the `sync: false` prompt) satisfies. This is exactly why `render.yaml` marks it `sync: false` rather than `generateValue: true`.

### 11. Which Values Come From Supabase

| Variable | Value |
|---|---|
| `DATABASE_URL` | The completed Supabase **Session Pooler** connection string (real password substituted in, `?sslmode=require` appended) — see `docs/reports/SUPABASE_SETUP_REPORT.md` §4 and §8 for exactly where to copy it from and how to complete it. This is the only variable sourced from Supabase. |

### 12. Which Values Come From OpenAI

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | API key generated in the OpenAI dashboard (platform.openai.com → API keys). Selects OpenAI as the AI provider for menu import, brand analysis, content generation, and the Brand Consistency judge (`apps/api`'s multi-provider AI abstraction tries OpenAI first, then Anthropic, then Gemini — see `apps/api/.env.example`). |

### 13. Which Values Come From SMTP

| Variable | Value |
|---|---|
| `SMTP_HOST` | Your SMTP provider's host (e.g. Resend's SMTP relay hostname) |
| `SMTP_PORT` | Your SMTP provider's port (commonly `587`) |
| `SMTP_USER` | SMTP auth username issued by the provider |
| `SMTP_PASSWORD` | SMTP auth password / API key issued by the provider |
| `SMTP_FROM_ADDRESS` | The "From" address used on transactional order emails (confirmation, ready, out-for-delivery, delivered, payment failed, refund issued, new-order staff alert) |

### Values chosen by you directly (not sourced from any external platform)

| Variable | Value |
|---|---|
| `FRONTEND_URL` | Not yet known at this step — enter a temporary placeholder now, return and set the real Vercel URL after Phase 3 (per `docs/runbooks/render-deploy.md`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Chosen by you — bootstraps the platform ADMIN account on first boot |
| `COMMERCE_ENCRYPTION_KEY` | Generated by you via `openssl rand -hex 32` (see §10) |
| `GOOGLE_MAPS_API_KEY` | Optional — from Google Cloud Console, only if Places import is wanted |
| `SITE_PLATFORM_DOMAIN` | Optional — a domain/subdomain you control, only if custom-domain publishing is wanted |

---

## 14. Final Deployment Checklist

**Before opening Render:**
- [ ] Confirm `abukeeth/core` default branch is `main`
- [ ] Have the completed Supabase Session Pooler `DATABASE_URL` ready (§11, with real password + `sslmode=require`)
- [ ] Have an OpenAI API key ready (§12)
- [ ] Have SMTP credentials ready (§13)
- [ ] Generate `COMMERCE_ENCRYPTION_KEY` via `openssl rand -hex 32`
- [ ] Decide `ADMIN_EMAIL` / `ADMIN_PASSWORD` (strong, not the `.env.example` placeholder) / `ADMIN_NAME`

**In Render:**
- [ ] Dashboard → **New** → **Blueprint**
- [ ] Select repository `abukeeth/core`
- [ ] Explicitly confirm branch = `main` in the branch dropdown
- [ ] Review Blueprint preview: one service, `ordervora-api`, Docker, Free plan
- [ ] Click **Apply**
- [ ] Fill every `sync: false` prompt (§9) — use a temporary placeholder for `FRONTEND_URL`
- [ ] Leave `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` to Render's auto-generation — do not override
- [ ] Watch the **Events** tab for build completion
- [ ] Confirm **Settings → Auto-Deploy** is enabled (§8)
- [ ] Confirm **Settings → Health Check Path** reads `/health` (§7)
- [ ] Note the assigned public service URL from the top of the service page

**After first successful deploy:**
- [ ] `GET <service-url>/health` → expect `200`, `{"status":"ok", ...}`
- [ ] `GET <service-url>/ready` → expect `200`, `{"status":"ready"}` (confirms DB connectivity — validates the Supabase Session Pooler choice end-to-end)
- [ ] Check **Logs** tab for `"Environment configuration loaded"` and `"API server listening"` entries, and absence of any `uncaughtException`/startup validation errors
- [ ] Proceed to Phase 3 (Vercel deployment), then return to Render and replace the `FRONTEND_URL` placeholder with the real Vercel URL
