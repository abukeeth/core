# Render Deployment Checklist — Phase 2B

Final, execution-ready checklist for deploying `apps/api` to Render. Built from `docs/reports/RENDER_DEPLOYMENT_GUIDE.md`, `docs/reports/SUPABASE_DEPLOYMENT_CHECKLIST.md`, and a fresh re-read of `render.yaml` performed for this report. `render.yaml`, `apps/api/Dockerfile`, `apps/api/scripts/start.sh`, `apps/api/package.json`, and `pnpm-workspace.yaml` were confirmed unchanged since the original clean-import commit (`4bd0553`) via `git log` on those paths — no drift since the prior Render guide was written. No deployment was performed and no code was modified while producing this report.

---

## 1. Final `render.yaml` Verification

Re-read in full for this report. Confirmed:
- One service: `ordervora-api`, `type: web`, `runtime: docker`, `plan: free`.
- `dockerfilePath: ./apps/api/Dockerfile`, `dockerContext: .` (repo root).
- `healthCheckPath: /health`.
- No `preDeployCommand` (migrations run inside the container's own entrypoint instead — see §7).
- 20 environment variables declared, in this exact order: `NODE_ENV`, `PORT`, `DATABASE_URL`, `FRONTEND_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `COMMERCE_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS`, `OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `SITE_PLATFORM_DOMAIN`.
- No `STRIPE_*` variable anywhere in `render.yaml` or the codebase — confirmed by search (see §15).

**Verdict: `render.yaml` is unchanged, internally consistent, and matches every prior report. Safe to proceed on this configuration.**

---

## 2. Every Render Screen and Every Button to Press

### Screen 1 — Dashboard
- Press **New +** (top right).
- Press **Blueprint** in the dropdown.

### Screen 2 — Connect Repository
- Field: **GitHub repository** — select `abukeeth/core`.
- If not listed: press **Configure account** and grant Render access to the repo first, then return here.

### Screen 3 — Branch Selection
- Field: **Branch** dropdown.
- **Explicitly select `main`** — do not accept whatever the picker defaults to.

### Screen 4 — Blueprint Preview
- Render shows a preview card for the one service it will create (see §3 table below for field values).
- Press **Apply** (button label may read **Create New Resources** depending on Render's current UI version).

### Screen 5 — Environment Variable Prompts
- Render prompts, one at a time, for every variable marked `sync: false` in `render.yaml` (12 of the 20 — see §10 table). For each: type/paste the value, press **Save** or move to the next field per Render's prompt flow.
- Variables marked `generateValue: true` are **not** prompted — Render fills them automatically.
- Variables with a literal `value:` are **not** prompted — already fixed by `render.yaml`.

### Screen 6 — Service Dashboard (post-creation)
- **Events** tab — press to watch the build/deploy log stream live.
- **Logs** tab — runtime `stdout`/`stderr` once the container starts.
- **Environment** tab — press **Edit** to view/add/change variables after creation (used later to set the real `FRONTEND_URL`).
- **Settings** tab — press to view/confirm **Auto-Deploy** toggle and **Health Check Path** field.
- **Shell** tab — on-demand container shell (optional; used only for the one-time demo-order seeding step in `docs/runbooks/render-deploy.md`, not required for a working deploy).
- The service's public URL is shown at the top of this page once the first deploy succeeds.

---

## 3. Every Field Value (Blueprint Preview, Screen 4)

| Field | Value |
|---|---|
| Service name | `ordervora-api` |
| Type | Web Service |
| Environment | Docker |
| Plan | Free |
| Region | Render's default selection — choose one close to the Supabase project's region for lower DB latency; not pinned by `render.yaml` |

---

## 4. Docker Configuration

| Field | Value | Source |
|---|---|---|
| Runtime | Docker | `render.yaml: runtime: docker` |
| Dockerfile Path | `./apps/api/Dockerfile` | `render.yaml: dockerfilePath` |
| Docker Build Context | `.` (repo root) | `render.yaml: dockerContext: .` |
| Exposed Port | `4000` | `Dockerfile: EXPOSE 4000`, matches `PORT` env var |
| Container entrypoint | `./scripts/start.sh` | `Dockerfile: CMD` |
| Container user | `node` (non-root) | `Dockerfile: USER node` |
| Base image | `node:22.22.2-alpine` (pinned) | `Dockerfile: ARG NODE_VERSION` |
| Docker-level HEALTHCHECK | `GET /health`, every 30s, 5s timeout, 15s start period, 3 retries | `Dockerfile` (separate from, and in addition to, Render's platform health check in §8) |

---

## 5. Root Directory

**Value: repo root — leave the Root Directory field empty/default. Do not set it to `apps/api`.**

This is a pnpm workspace: `apps/api`'s dependencies resolve against the root `pnpm-lock.yaml` / `pnpm-workspace.yaml`, both of which must be present in the Docker build context. `render.yaml`'s `dockerContext: .` already handles this — no separate `rootDir` field is set or needed.

---

## 6. Build Command

**Not a separate Render field — this is a Docker-runtime service.** All build logic is inside `apps/api/Dockerfile`'s stages:

```
pnpm fetch
pnpm install --frozen-lockfile --filter api...
pnpm --filter api exec prisma generate
pnpm --filter api run build      # tsc compile to dist/
# then a separate --prod-only install stage for the runtime image
```

---

## 7. Start Command

**Not a separate Render field — set by the Dockerfile's `CMD`.** `apps/api/scripts/start.sh` runs, in order, on every container start (including restarts, not just first boot):

```sh
./node_modules/.bin/prisma migrate deploy
node dist/scripts/seed-if-empty.js
exec node dist/src/index.js
```

1. Applies all pending migrations (idempotent — safe on every boot).
2. Seeds the platform ADMIN account only if the database is empty.
3. `exec`s into Node directly so `SIGTERM` reaches the process for graceful shutdown.

---

## 8. Health Check Path

| Field | Value |
|---|---|
| Health Check Path | `/health` |
| Set by | `render.yaml: healthCheckPath: /health` |
| Behavior | Liveness only — `200` with `{status: "ok", uptime, timestamp, workers}`; does **not** query the database (distinct from `/ready`, which does) |

No manual entry needed — confirmed automatically from `render.yaml` in the Blueprint preview (Screen 4). Verify it under **Settings** after creation if in doubt.

---

## 9. Auto-Deploy Recommendation

**Recommendation: Enable Auto-Deploy (Render's Blueprint default).**

- Matches the intended workflow: push to `main` → automatic rebuild/redeploy.
- Safe because `prisma migrate deploy` (run on every boot via `start.sh`) is explicitly idempotent and non-interactive (`docs/runbooks/database-setup.md` §3) — unattended redeploys will not corrupt or reset data.
- Reversible later at **Settings → Build & Deploy → Auto-Deploy** if a manual-approval release process is wanted — a dashboard toggle, not a code or `render.yaml` change.

---

## 10. Every Environment Variable

| # | Key | `render.yaml` directive | Prompted during Blueprint apply? |
|---|---|---|---|
| 1 | `NODE_ENV` | `value: production` | No |
| 2 | `PORT` | `value: "4000"` | No |
| 3 | `DATABASE_URL` | `sync: false` | **Yes** |
| 4 | `FRONTEND_URL` | `sync: false` | **Yes** |
| 5 | `JWT_ACCESS_SECRET` | `generateValue: true` | No — Render generates it |
| 6 | `JWT_REFRESH_SECRET` | `generateValue: true` | No — Render generates it |
| 7 | `JWT_ACCESS_TTL` | `value: 15m` | No |
| 8 | `JWT_REFRESH_TTL` | `value: 30d` | No |
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
| 19 | `GOOGLE_MAPS_API_KEY` | `sync: false` | **Yes** (optional feature; may be left blank) |
| 20 | `SITE_PLATFORM_DOMAIN` | `sync: false` | **Yes** (only needed for custom-domain publishing) |

Not declared in `render.yaml` at all (documented gap, carried from earlier reports): `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` — only needed if OpenAI is not the chosen AI provider; add manually via the **Environment** tab post-deploy if so.

---

## 11. Which Values Come From Supabase

| Variable | Value | Reference |
|---|---|---|
| `DATABASE_URL` | The completed **Session Pooler** connection string (real password substituted in, `?sslmode=require` appended) | Copied per `docs/reports/SUPABASE_DEPLOYMENT_CHECKLIST.md` §2C/§3 — obtained from Supabase's **Connect → Session pooler** tab |

This is the **only** Render variable Supabase supplies. Read by `apps/api/prisma.config.ts` (CLI/migrations) and `apps/api/src/lib/prisma.ts` (runtime queries via `@prisma/adapter-pg`).

---

## 12. Which Values Are Generated Locally

| Variable | How | Reference |
|---|---|---|
| `COMMERCE_ENCRYPTION_KEY` | Run `openssl rand -hex 32` on your own machine, paste the output when Render prompts | Must be exactly 64 hex characters — `apps/api/src/config/env.ts`'s `HEX_32_BYTES` regex rejects anything else, including Render's own `generateValue: true` output (which is base64, not hex) |

**Not locally generated — generated by Render itself:** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (both `generateValue: true` — Render fills these automatically, no local action needed; do not override).

---

## 13. Which Values Come From OpenAI

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | API key from platform.openai.com → API keys. Selects OpenAI as the AI provider (priority order: OpenAI → Anthropic → Gemini) for menu import, brand analysis, content generation, and the Brand Consistency judge. |

---

## 14. Which Values Come From SMTP

| Variable | Value |
|---|---|
| `SMTP_HOST` | Your SMTP provider's host (e.g. Resend's SMTP relay) |
| `SMTP_PORT` | Your SMTP provider's port (commonly `587`) |
| `SMTP_USER` | SMTP auth username |
| `SMTP_PASSWORD` | SMTP auth password / API key |
| `SMTP_FROM_ADDRESS` | "From" address on transactional order emails |

---

## 15. Which Values Come From Stripe

**None.** Confirmed by searching the entire codebase (`apps/api/src`) and `render.yaml`: there is no `STRIPE_*` environment variable declared anywhere, and none is required to boot or deploy the service.

Stripe in this application is **bring-your-own-provider (BYOP)**: there is no platform-level Stripe key at all. Each restaurant enters its own Stripe credentials through the application's own dashboard UI, at runtime, after the platform is live — not through Render environment variables. Those per-restaurant credentials are stored encrypted in the database, using `COMMERCE_ENCRYPTION_KEY` (§12) as the envelope-encryption key (`apps/api/src/modules/commerce/payments/provider.service.ts` and related payment-provider modules). Cash payment works with zero Stripe setup at all.

**Action required in this phase: none.** Stripe configuration is a post-deploy, per-restaurant, in-app step — out of scope for Render environment setup entirely.

---

## 16. Final Deployment Checklist

**Before opening Render:**
- [ ] Confirm `abukeeth/core` default branch is `main`
- [ ] Have the completed Supabase Session Pooler `DATABASE_URL` ready (§11 — from `docs/reports/SUPABASE_DEPLOYMENT_CHECKLIST.md`)
- [ ] Have an OpenAI API key ready (§13)
- [ ] Have SMTP credentials ready (§14)
- [ ] Generate `COMMERCE_ENCRYPTION_KEY` locally via `openssl rand -hex 32` (§12)
- [ ] Decide `ADMIN_EMAIL` / a strong `ADMIN_PASSWORD` (not the `.env.example` placeholder) / `ADMIN_NAME`
- [ ] No Stripe action needed (§15)

**In Render:**
- [ ] Dashboard → **New +** → **Blueprint**
- [ ] Select repository `abukeeth/core`
- [ ] Explicitly confirm branch = `main`
- [ ] Review Blueprint preview: one service, `ordervora-api`, Docker, Free plan (§3)
- [ ] Press **Apply**
- [ ] Fill every `sync: false` prompt (§10) — use a temporary placeholder for `FRONTEND_URL` (real Vercel URL isn't known yet)
- [ ] Leave `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` to Render's auto-generation — do not override
- [ ] Watch the **Events** tab for build completion
- [ ] Confirm **Settings → Auto-Deploy** is enabled (§9)
- [ ] Confirm **Settings → Health Check Path** reads `/health` (§8)
- [ ] Note the assigned public service URL at the top of the service page

**After first successful deploy:**
- [ ] `GET <service-url>/health` → expect `200`, `{"status":"ok", ...}`
- [ ] `GET <service-url>/ready` → expect `200`, `{"status":"ready"}` (confirms DB connectivity — validates the Supabase Session Pooler choice end-to-end)
- [ ] Check **Logs** tab for `"Environment configuration loaded"` and `"API server listening"`, and no `uncaughtException`/startup-validation errors
- [ ] Proceed to the Vercel deployment phase, then return to Render and replace the `FRONTEND_URL` placeholder with the real Vercel URL

---

## Verdict

**Ready.** `render.yaml` re-verified with no drift since the prior guide. Every screen, field, command, and environment variable is accounted for, correctly sourced, and mapped to its origin (Render-generated, locally-generated, Supabase, OpenAI, SMTP, or "none" for Stripe). No deployment performed, no code modified.
