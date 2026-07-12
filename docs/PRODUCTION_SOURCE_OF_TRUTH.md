# OrderVora Production Source of Truth

**Status: template — no production deployment exists yet.**

This document previously recorded the specific GitHub/Vercel/Render
accounts, domains, and commit SHA of an earlier production deployment.
That deployment is being retired in favor of entirely new
GitHub/Render/Supabase (or equivalent) accounts, so the old values have
been removed rather than left as if they were still current — they were
tied to accounts this project no longer uses, and leaving them in place
would mislead whoever reads this file next.

**Render is the only production platform** (both `apps/api` and
`apps/web` deploy there as Docker web services — see `render.yaml` and
`docs/reports/RENDER_BLUEPRINT_FINAL.md`). Vercel was evaluated and
found unnecessary: `docs/reports/ARCHITECTURE_VERIFICATION.md` verified
no code-level dependency on Vercel exists anywhere in this codebase.

Fill in the "Canonical production architecture" and "Current verified
state" sections below the first time a real deployment exists on the
new accounts, and keep them updated after that — this file's job is to
be the one place a developer or an AI agent can check to know, with
certainty, what is actually running in production right now, rather
than guessing from memory or from whichever runbook was written most
recently.

## Canonical production architecture

_Fill in once the first deployment to the new accounts is live and
verified. Until every line below is filled in, do not treat this
section as authoritative — it isn't yet._

- Frontend service: Render `<ordervora-web service URL>`
- Public domain(s): `<domain(s)>`
- GitHub repository: `<owner>/<repo>`
- Production branch: `main`
- Current verified production frontend commit: `<commit SHA>`
- Backend API service: Render `<ordervora-api service URL>`
- Frontend production API communication: driven by the `API_URL`
  environment variable (see `apps/web/next.config.ts` and
  `apps/web/src/lib/server-api.ts`), computed automatically at Render
  build/deploy time from `API_URL_SCHEME`/`API_HOST` (`API_HOST` is
  wired via `render.yaml`'s `fromService` to `ordervora-api`'s internal
  address — no manual value needed for this direction). Confirm
  `ordervora-web`'s `FRONTEND_URL` counterpart has been pasted into
  `ordervora-api`'s environment after `ordervora-web`'s first deploy —
  see `docs/reports/RENDER_BLUEPRINT_FINAL.md`'s deployment order.
- Production database: PostgreSQL, whichever instance the Render API's
  `DATABASE_URL` actually points at — record the provider and project
  name here once chosen (Supabase, Render Postgres, Neon, etc.). Do not
  assume a provider without checking the live `DATABASE_URL` value.

## Deployment rules

1. Only commits merged into `main` are considered production releases.
2. Preview deployments from any other branch are never considered
   production.
3. A change is not released until both Render services (`ordervora-api`,
   `ordervora-web`) have deployed the matching intended commit and pass
   their health checks.
4. The production commit SHA must match the head of `main` before
   acceptance testing begins.
5. Backend changes are not complete until `ordervora-api` has deployed
   the matching intended commit and passes health checks (`GET /health`).
6. Frontend changes are not complete until `ordervora-web` has deployed
   the matching intended commit and passes its health check (`GET /`).
7. Never use a preview/manual deploy as the customer-facing production
   service — both services' "Auto-Deploy" setting should track `main`.

## Environment ownership

### Render web (`ordervora-web`)

Owns frontend-only build and runtime configuration.

The production API origin is controlled by `API_URL_SCHEME`/`API_HOST`
(build-time — `render.yaml`'s `fromService` wiring resolves `API_HOST`
to `ordervora-api`'s internal `host:port` automatically on every
deploy/sync) and, at runtime, `API_URL` (computed inside
`apps/web/Dockerfile`'s runtime stage from those same two values — not
a separate `render.yaml` entry). `NEXT_PUBLIC_SITE_URL` (also
build-time) drives `sitemap.xml`/`robots.txt`/OG tags — set it to the
real production domain, or leave it as `ordervora-web`'s own
Render-assigned URL if no custom domain exists yet. There is no
hardcoded fallback host baked into the image's actual production
values — a missing `API_HOST` falls back to `localhost:4000` (safe
default for local/dev use of the same Dockerfile, not a silent
production failure mode once `render.yaml`'s `fromService` wiring is in
place).

### Render API (`ordervora-api`)

Owns server-side secrets and backend configuration, including:

- `DATABASE_URL`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM_ADDRESS`
- AI provider keys (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`)
- `GOOGLE_MAPS_API_KEY`
- JWT/session secrets (`JWT_ACCESS_SECRET`)
- `COMMERCE_ENCRYPTION_KEY` (encrypts each restaurant's own BYOP
  Stripe/POS/delivery credentials — there is no platform-level Stripe
  key)
- `SITE_PLATFORM_DOMAIN`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`
- `FRONTEND_URL` — the one remaining manual cross-service paste (Render
  doesn't resolve a sibling service's own assigned URL as a
  `fromService` target within the same blueprint run)

See `render.yaml` and `apps/api/.env.example` for the complete list and
what each one does. Do not place backend-only secrets in `ordervora-web`
and expect `ordervora-api` to read them — the two services do not share
an environment (each has its own `envVars` block in `render.yaml`).

### Production database

The canonical production database is whichever PostgreSQL database is
referenced by the live Render API's `DATABASE_URL`. This app has no
dependency on any specific Postgres provider or SDK — `DATABASE_URL` is
the only thing that determines which database is "production."

Before changing migrations:

- confirm a recoverable backup exists;
- run `prisma migrate status`;
- never reset, drop, truncate, or reseed production data;
- verify the Business Wizard, public storefront, imports, orders, and
  KDS all read and write the same database.

## Release acceptance checklist

A release is accepted only when all are true:

- GitHub change is merged into `main`.
- `ordervora-web`'s latest Render deploy tracks `main` and is healthy
  (`GET /` succeeds).
- `ordervora-api`'s latest Render deploy tracks `main` and is healthy
  (`GET /health` succeeds).
- The deployed commit SHA on both services matches the intended `main`
  SHA.
- The frontend reaches the Render API (a real API call through the
  deployed frontend succeeds, not just `/health` in isolation).
- A real production smoke test succeeds — see
  `docs/runbooks/render-deploy.md` for the initial deployment's smoke
  test steps.

## Current verified state

_Not yet applicable — no deployment on the new accounts has happened
yet. Once one has, replace this section with the actual verified state
(GitHub default branch, both Render services' production source,
production commit for each, and any other in-flight deploys worth
noting), the same way the "Canonical production architecture" section
above should be filled in._

This document is the canonical reference for future development and
release decisions once it is filled in — an unfilled template is not a
substitute for actually verifying the live state before relying on it.
