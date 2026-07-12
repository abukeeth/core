# Railway Deployment (two services from one repo)

## Why "No start command detected" happened

Railway's Railpack builder was building from the **repository root**. The
root `package.json` only has `build`/`lint`/`typecheck`/`test` scripts
(each just fanning out to every workspace package via `pnpm -r`) — it has
no `start` script, because there's nothing to "start" at the repo root
itself. The two actual runnable apps, each with their own `start` script,
live in `apps/web` and `apps/api`. Railway had no way to know which one you
meant, so it found no start command at all.

## The fix: two Railway services, each with its own config file

This is a **shared pnpm workspace** (one `pnpm-lock.yaml` + one
`pnpm-workspace.yaml` at the repo root, dependencies resolved against that
single lockfile) — Railway's own monorepo guidance recommends *not* setting
a per-service Root Directory for this kind of workspace, and instead
differentiating services purely by build/start commands scoped with
`pnpm --filter <app>`, run from the repo root where the lockfile actually
lives. That's what these two files do:

- **`railway.api.json`** (repo root) — for the API service.
  ```json
  {
    "build": { "builder": "RAILPACK", "buildCommand": "pnpm --filter api prisma:generate && pnpm --filter api build" },
    "deploy": { "startCommand": "pnpm --filter api prisma:migrate:deploy && pnpm --filter api seed:if-empty && pnpm --filter api start", "healthcheckPath": "/health" }
  }
  ```
  Matches the requested build/start commands exactly, just filtered to the
  `api` workspace package instead of assuming a subdirectory Root
  Directory (which is the less reliable option for pnpm workspaces —
  several real reports of "pnpm not being used" on Railway trace back to
  exactly that setup). `seed:if-empty` is the same idempotent guard already
  used for the Render deployment — safe to run on every start, not just
  the first.
- **`railway.web.json`** (repo root) — for the web service, same idea:
  `pnpm --filter web build` / `pnpm --filter web start` (plain `next
  build` / `next start` under the hood — no Docker-specific ARGs needed
  here, since Railway makes environment variables available at build time
  automatically, unlike a raw `docker build`).

Neither file touches the other app's package.json, business logic, or the
existing Docker/Render/Vercel setup — this is an independent, additional
deployment path onto the same Supabase database, not a replacement for it.

## Steps (from Railway's dashboard, works fine from iPhone Safari)

### 1. Create the API service

1. railway.app → **New Project** → **Deploy from GitHub repo** → select
   this repository.
2. This creates one service. Open its **Settings** tab:
   - Rename it to `ordervora-api` (Settings → General → Service Name).
   - **Settings → Config-as-code → Config File Path** → enter exactly:
     `/railway.api.json`
3. **Settings → Variables** → add:
   ```
   NODE_ENV=production
   DATABASE_URL=<the same Supabase connection string you already used for the Render setup>
   FRONTEND_URL=<the web service's URL — fill in after step 2 creates it; see note below>
   JWT_ACCESS_SECRET=<same value you already generated for Render, or a fresh openssl rand -hex 32>
   JWT_REFRESH_SECRET=<same idea>
   JWT_ACCESS_TTL=15m
   JWT_REFRESH_TTL=30d
   COMMERCE_ENCRYPTION_KEY=<same 64-char-hex value you already used for Render — must stay hex, see apps/api/src/config/env.ts>
   ```
   (These are the same values already generated earlier for the Render
   deployment — reuse them so both deployments point at the same Supabase
   database consistently. None of these are stored in this repo — this
   file only ever describes *which* variables to set, never their values,
   since this is a public repository.)
4. **Settings → Networking → Generate Domain** — note the exact URL Railway
   assigns (e.g. `ordervora-api-production.up.railway.app`).
5. Deploy. Once live, confirm `https://<that-domain>/health` responds.

### 2. Create the web service

1. Back at the project → **+ New** → **GitHub Repo** → the same repository
   again (this adds a second, independent service to the same project).
2. Rename it to `ordervora-web`.
3. **Settings → Config-as-code → Config File Path** → enter exactly:
   `/railway.web.json`
4. **Settings → Variables** → add:
   ```
   NODE_ENV=production
   API_URL=https://<the API service's domain from step 1.4>
   ```
   (`API_URL` is read at build time by `next.config.ts` — Railway exposes
   variables during the build step automatically, so no extra plumbing is
   needed here, unlike the Docker-based Render setup.)
5. **Settings → Networking → Generate Domain** — note this URL too.
6. Deploy.

### 3. Close the loop

Go back to the **API service** → Variables → set `FRONTEND_URL` to the
web service's actual domain from step 2.5 (`https://...`) → save. Railway
redeploys the API service automatically on a variable change — no rebuild
needed by hand.

Open the web service's URL — that's your working deployment.

## This doesn't replace the existing Render + Vercel setup

Both paths can coexist — they're independent deployments of the same
code, and can both point at the same Supabase database (`OrderVora-SaaS`)
without conflict, since the beta seed is idempotent (`seed-if-empty.js`
only seeds once, whichever platform gets there first).
