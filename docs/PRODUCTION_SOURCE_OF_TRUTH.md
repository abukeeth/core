# OrderVora Production Source of Truth

**Status: template — no production deployment exists yet.**

This document previously recorded the specific GitHub/Vercel/Render
accounts, domains, and commit SHA of an earlier production deployment.
That deployment is being retired in favor of entirely new
GitHub/Vercel/Render/Supabase (or equivalent) accounts, so the old
values have been removed rather than left as if they were still current
— they were tied to accounts this project no longer uses, and leaving
them in place would mislead whoever reads this file next.

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

- Frontend project: Vercel `<project name>`
- Public domain(s): `<domain(s)>`
- GitHub repository: `<owner>/<repo>`
- Production branch: `main`
- Current verified production frontend commit: `<commit SHA>`
- Backend API: Render `<service URL>`
- Frontend production API rewrite: driven by the `API_URL` environment
  variable (see `apps/web/next.config.ts` and
  `apps/web/src/lib/server-api.ts`) — not hardcoded in source. Confirm
  the Vercel project's `API_URL` env var is set to the real Render URL
  above; if it's unset, the app silently falls back to
  `http://localhost:4000`, which is wrong in production.
- Production database: PostgreSQL, whichever instance the Render API's
  `DATABASE_URL` actually points at — record the provider and project
  name here once chosen (Supabase, Render Postgres, Neon, etc.). Do not
  assume a provider without checking the live `DATABASE_URL` value.

## Deployment rules

1. Only commits merged into `main` are considered production releases.
2. Preview deployments from any other branch are never considered
   production.
3. A change is not released until the Vercel deployment target is
   `production` and its `githubCommitRef` is `main`.
4. The production commit SHA must match the head of `main` before
   acceptance testing begins.
5. Backend changes are not complete until the Render API has deployed
   the matching intended commit and passes health checks.
6. Never use a preview URL as the customer-facing production URL.

## Environment ownership

### Vercel frontend

Owns frontend-only build and runtime configuration.

The production API origin is controlled entirely by the `API_URL`
environment variable — set it in the Vercel project's Environment
Variables (available at build time, since `next.config.ts`'s rewrites
are resolved once when the app is built; see that file's comments).
There is no hardcoded fallback host in source, so a missing or wrong
`API_URL` fails by pointing at `localhost`, not by silently working —
verify it explicitly during first deployment.

### Render API

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

See `render.yaml` and `apps/api/.env.example` for the complete list and
what each one does. Do not place backend-only secrets in Vercel and
expect the Render API to read them — the two apps do not share an
environment.

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
- Vercel deployment target is `production`.
- Vercel deployment metadata shows `githubCommitRef=main`.
- Vercel deployment SHA equals the intended `main` SHA.
- Render API is deployed and healthy (`GET /health` succeeds).
- The frontend reaches the Render API (a real API call through the
  deployed frontend succeeds, not just `/health` in isolation).
- A real production smoke test succeeds — see
  `docs/runbooks/render-deploy.md` for the initial deployment's smoke
  test steps.

## Current verified state

_Not yet applicable — no deployment on the new accounts has happened
yet. Once one has, replace this section with the actual verified state
(GitHub default branch, Vercel production source, production frontend
commit, and any other in-flight preview deployments worth noting), the
same way the "Canonical production architecture" section above should
be filled in._

This document is the canonical reference for future development and
release decisions once it is filled in — an unfilled template is not a
substitute for actually verifying the live state before relying on it.
