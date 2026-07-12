# Deploying OrderVora — Supabase/Postgres + Render

This is a generic runbook for deploying this project to fresh accounts.
It intentionally names no specific project, account, domain, or commit —
fill those in as you go, in your own notes or in
`docs/PRODUCTION_SOURCE_OF_TRUTH.md` once the deployment is live.

**Render is the only production platform** for both `apps/api` and
`apps/web` — see `docs/reports/ARCHITECTURE_VERIFICATION.md` (verified
no code-level dependency on Vercel exists) and
`docs/reports/RENDER_BLUEPRINT_FINAL.md` (the current, authoritative
field-by-field Blueprint reference). This runbook's narrative walkthrough
below is kept in sync with that reference but is not a substitute for it.

## Why this combination

Two pieces, two platforms, each with a real free tier:

| Piece | Platform | Why |
|---|---|---|
| Postgres database | **Supabase** (or Render Postgres, Neon, etc.) | Any of these have a genuine, permanently-free hosted Postgres tier — this app has no dependency on a specific provider, just a `DATABASE_URL` connection string (see `apps/api/prisma/schema.prisma`). |
| API + Web (`apps/api`, `apps/web`) | **Render**, free plan, two Docker web services | The API needs to run continuously (in-process background workers: outbox drain, driver-offer expiry, SSL-issuance sweep — see `apps/api/src/index.ts`), so it can't be serverless. Both apps already ship a production Dockerfile; Render runs each as its own free Docker web service, communicating over Render's private network (`render.yaml`'s `fromService` wiring — see `docs/reports/RENDER_BLUEPRINT_FINAL.md`). Trade-off: the free plan spins down each service after 15 minutes idle, with a 30-60s cold start on the next request. |

Whether any given signup gets asked for a card is decided by that
platform's own account-level fraud/anti-abuse scoring — not something
any config file controls. What `render.yaml` does control: it requests
only free-tier resources (no paid database, no paid "starter" plan), so
a payment-method wall triggered by *this project's own resource
requests* cannot happen. If a fresh account still gets asked for a card,
that's the platform's account-level policy, not this project.

`apps/api/scripts/start.sh` runs migrations and the idempotent beta seed
as the container's own entrypoint (not a Render-specific
`preDeployCommand`), so the exact same Docker image also works
unmodified on Koyeb, Fly.io, or plain `docker run` — see the fallback
section below if Render doesn't work out for your account.

## Before you start

1. **Create the new GitHub repository first**, push this codebase's
   `main` branch to it, and confirm the new repo's **default branch is
   `main`**. (A platform that connects to "the repo" without an
   explicit branch override reads whatever the default branch is — if
   it's ever anything other than `main`, deployments silently target
   stale or incomplete code.)
2. **Provision a fresh PostgreSQL database** on whichever provider you
   chose (a new Supabase project, Render's own managed Postgres, etc.).
   Note its connection string — you'll paste it into Render as
   `DATABASE_URL` in Step 1 below. Use SSL (`?sslmode=require` appended
   to the connection string) for anything that isn't purely local.
3. **Generate fresh secrets** — never reuse values from any prior
   deployment:
   - `JWT_ACCESS_SECRET`: `openssl rand -hex 32`
   - `COMMERCE_ENCRYPTION_KEY`: `openssl rand -hex 32` (must be exactly
     64 hex characters — Render's `generateValue: true` produces
     base64 and will fail this app's startup validation, so this one
     must be generated manually and pasted in)
   - A strong `ADMIN_PASSWORD` for the platform admin account the seed
     script creates.

## Step 1 — Deploy both services to Render via Blueprint (~5 minutes)

1. dashboard.render.com → **New** → **Blueprint**.
2. Select your new repository, and explicitly pick the `main` branch
   from the branch dropdown (don't accept whatever the picker defaults
   to — confirm it says `main`).
3. Render reads `render.yaml` and shows **two** free web services:
   `ordervora-api` and `ordervora-web`. Tap **Apply**.
4. Render will prompt for every `sync: false` value across both
   services — for `ordervora-api`: `DATABASE_URL`, `FRONTEND_URL`
   (leave a placeholder for now, you'll fix it after both services are
   up), `COMMERCE_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `ADMIN_NAME`, `SMTP_*`, at least one AI provider key, and optionally
   `GOOGLE_MAPS_API_KEY` / `SITE_PLATFORM_DOMAIN`; for `ordervora-web`:
   `NEXT_PUBLIC_SITE_URL` (your production domain, or leave as a
   placeholder if you don't have one yet). `API_URL_SCHEME`/`API_HOST`
   on `ordervora-web` need **no input** — they're wired automatically
   via `fromService` to `ordervora-api`'s internal address. See
   `docs/reports/RENDER_BLUEPRINT_FINAL.md` for the complete
   field-by-field reference.
5. Wait for both builds to finish. Open each service's page and note
   its **exact URL** (top of the page).
6. Confirm `ordervora-api` is healthy: open `<api-url>/health` — it
   should return a JSON response, not an error.
7. Confirm `ordervora-web` is healthy: open `<web-url>/` — the app's
   homepage should load.
8. Go back to `ordervora-api`'s service → Environment → set
   `FRONTEND_URL` to `ordervora-web`'s real URL from step 5, and save
   (Render redeploys `ordervora-api` automatically). This is the one
   remaining manual cross-service value — Render doesn't resolve a
   sibling service's own assigned URL as a `fromService` target within
   the same Blueprint run, only pre-existing services' internal
   host/port.
9. Open `ordervora-web`'s URL — this is your working app.

## Fallback — deploy the API to Koyeb instead (if Render asks for a card)

Koyeb has a genuine free tier (1 service, no card required for most
signups) with one advantage over Render's: no cold start, the container
stays running. No project changes are needed — the same Dockerfile and
env vars apply. (This fallback covers `apps/api` only; `apps/web` would
need an equivalent second Koyeb service, mirroring the Render setup for
`ordervora-web` — set `API_HOST` to that Koyeb API service's own
address instead of `fromService`, since `fromService` is Render-specific.)

1. app.koyeb.com → sign up → **Create Web Service** → **GitHub** →
   select your repository.
2. Under the service's build settings, set:
   - **Work directory**: `apps/api`
   - **Dockerfile**: `Dockerfile` (relative to that work directory)
3. Set **Port** to `4000` and **Health check path** to `/health`.
4. Add the same environment variables as the Render setup above.
5. Deploy. Koyeb assigns a `*.koyeb.app` URL — use it the same way as
   Render's `ordervora-api` URL above (`API_HOST` on the web service,
   `FRONTEND_URL` back on this service).

(Koyeb has no equivalent of Render's `preDeployCommand` — not a problem
here, since migrations and the seed already run from
`apps/api/scripts/start.sh`'s own startup sequence.)

## One-time follow-up (optional, not required to have a working app)

The historical order-volume demo data (`seed:beta:orders`,
`seed:beta:delivery-order`) drives the real checkout API over HTTP, so
it needs the API already live — it can't run during Render's pre-deploy
step. From Render's **Shell** tab on `ordervora-api`:
```sh
BASE_URL=http://localhost:4000 node dist/scripts/seed-beta-orders.js
BASE_URL=http://localhost:4000 node dist/scripts/demo-place-delivery-order.js
```

## Demo accounts

Same as `docs/reports/Sprint08/BETA_DEMO_GUIDE.md` — all share the
password defined in `apps/api/prisma/demo-credentials.ts`, once the
structural seed has run automatically during the API's first deploy.

## Notes / honest trade-offs

- **Render's free plan spins down after 15 minutes of inactivity.** The
  first request after that takes 30-60 seconds while it wakes up. This
  is Render's free-tier trade-off, not a bug. Upgrading the
  `ordervora-api` service to a paid plan later is a plan change in
  Render's dashboard — no code or architecture change needed.
- **Object storage (image uploads) is not configured by default** —
  falls back to local disk, which doesn't persist across restarts on
  Render's free plan. Not required for the app to work; see
  `docs/runbooks/object-storage.md` for S3-compatible credentials if you
  need uploads to survive redeploys.
- **Stripe is bring-your-own-provider** — there is no platform-level
  Stripe key; each restaurant enters its own Stripe credentials through
  the dashboard. Cash payment works immediately with no setup.
- **TLS/SSL issuance for custom domains is a documented stub** (see
  `apps/api/src/modules/sites/domain.service.ts`) — the state machine
  around it is real, but the actual Certificate Authority call needs a
  real ACME client wired in before custom-domain HTTPS works end to end.
