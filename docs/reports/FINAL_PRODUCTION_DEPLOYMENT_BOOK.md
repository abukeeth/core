# OrderVora — Final Production Deployment Book

**This is the single source of truth for deploying and operating OrderVora in production.** It consolidates every audit performed across this engagement into one master document. No deployment has been performed while producing this document. No real secret values appear anywhere below — placeholders only.

Repository: `abukeeth/core`, branch `main`. Detailed supporting reports (referenced throughout, not duplicated in full): `docs/reports/DEPLOYMENT_BLOCKERS.md`, `docs/reports/SEED_SYSTEM_BLOCKER_ANALYSIS.md`, `docs/reports/SEED_SYSTEM_FIX_REPORT.md`, `docs/reports/SUPABASE_SETUP_REPORT.md`, `docs/reports/SUPABASE_DEPLOYMENT_CHECKLIST.md`, `docs/reports/RENDER_DEPLOYMENT_GUIDE.md`, `docs/reports/RENDER_DEPLOYMENT_CHECKLIST.md`, `docs/reports/PRODUCTION_ENVIRONMENT_VALUES.md`, `docs/reports/FINAL_DEPLOYMENT_READINESS_REPORT.md`, plus the codebase's own `docs/runbooks/*.md`.

---

## 1. Production Readiness Summary

| Area | Status | Evidence |
|---|---|---|
| Codebase imported cleanly, single `main` branch, correct remote | ✅ Done | Clean import, 736 files, commit `4bd0553` |
| Backend deployment method determined (Docker via Render Blueprint) | ✅ Confirmed | `render.yaml`, `apps/api/Dockerfile` |
| `render.yaml` validity | ✅ Verified, unchanged since import | `docs/reports/RENDER_DEPLOYMENT_CHECKLIST.md` §1 |
| Prisma/migration compatibility | ✅ Verified — 13/13 migrations apply cleanly on a real database | `docs/reports/DEPLOYMENT_BLOCKERS.md` |
| Supabase connection mode determined | ✅ Session Pooler (not Direct, not Transaction Pooler) | `docs/reports/SUPABASE_SETUP_REPORT.md` |
| Full local dry run (build, migrate, boot, health checks, web↔API) | ✅ All passed | `docs/reports/DEPLOYMENT_BLOCKERS.md` |
| **Critical seed-system blocker** (production boot seeded a public-password demo admin instead of the real `ADMIN_EMAIL` account) | ✅ **Found and fixed** | `docs/reports/SEED_SYSTEM_BLOCKER_ANALYSIS.md`, `docs/reports/SEED_SYSTEM_FIX_REPORT.md` |
| Fix verified (typecheck, full test suite, production build, live re-run) | ✅ Pass — 1113 passed / 0 failed / 5 skipped / 1118 total | `docs/reports/SEED_SYSTEM_FIX_REPORT.md` |
| `COMMERCE_ENCRYPTION_KEY` generated | ✅ Done — delivered privately, never committed | `docs/reports/PRODUCTION_ENVIRONMENT_VALUES.md` |
| Live Supabase project created | ❌ **Not yet done** | No evidence of an existing project in this repo |
| Live Render service created | ❌ **Not yet done** | No deployment has been performed |
| Live Vercel project created | ❌ **Not yet done** | No deployment has been performed |
| Resend/SMTP account | ❌ **Unconfirmed** | You must confirm you have one |
| OpenAI account/key | ❌ **Unconfirmed** | You must confirm you have one |

**Overall verdict: code and configuration are production-ready. Nothing left to fix in the repository.** The only remaining work is external account provisioning and the deploy sequence itself (§11).

---

## 2. Every Required Account

| # | Account | Purpose | Status |
|---|---|---|---|
| 1 | **GitHub** | Hosts `abukeeth/core`, source of truth for both deploy targets | ✅ Ready — repo exists, `main` is current |
| 2 | **Render** | Hosts `apps/api` (Docker web service) | New account, confirmed empty — no service created yet |
| 3 | **Supabase** | Hosts the production PostgreSQL database | New account — **no project confirmed to exist yet**; must be created before Render deploy |
| 4 | **Resend** (or any SMTP provider) | Sends transactional order emails (confirmation, ready, out-for-delivery, delivered, payment failed, refund issued, staff alerts) | Not confirmed — needed before Render deploy, or leave `SMTP_*` unset temporarily (email sending will fail until set) |
| 5 | **OpenAI** | Powers menu import, brand analysis, content generation, Brand Consistency judge | Not confirmed — needed before Render deploy, or leave `OPENAI_API_KEY` unset temporarily (AI features unavailable until set) |
| 6 | **Google Cloud** (Places API) | Optional — Google Maps-based restaurant import | Optional; only needed if that feature is wanted at launch |
| 7 | **Domain** | Optional — custom domain for the public site and/or `SITE_PLATFORM_DOMAIN` (per-restaurant custom-domain publishing) | Optional; the app works on Render's/Vercel's assigned subdomains without one |
| 8 | **Vercel** *(not in your list, but structurally required)* | Hosts `apps/web` (Next.js) | New account, confirmed empty — no project created yet. Flagged here because this document must be a complete source of truth: `apps/api` alone is not a working product without the web frontend. |

---

## 3. Every Required Environment Variable

### `apps/api` (Render) — 20 variables, declared in `render.yaml`

`NODE_ENV`, `PORT`, `DATABASE_URL`, `FRONTEND_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `COMMERCE_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS`, `OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `SITE_PLATFORM_DOMAIN`.

### `apps/web` (Vercel) — 2 variables

`API_URL` (required — server-side rewrite target, no hardcoded fallback in production), `NEXT_PUBLIC_SITE_URL` (required for correct `sitemap.xml`/`robots.txt`/OG tags — falls back to `localhost` if unset, which is wrong in production).

Full per-variable detail (source, format, action) for the 20 API variables already exists in `docs/reports/PRODUCTION_ENVIRONMENT_VALUES.md` — not repeated in full here to keep this book from drifting out of sync with that more detailed document. This book gives the summary view (§4–§10); that report gives the exhaustive one.

---

## 4. Values That Already Exist

| Variable | Value status |
|---|---|
| `NODE_ENV` | Literal in `render.yaml` — `production` |
| `PORT` | Literal in `render.yaml` — `4000` |
| `JWT_ACCESS_TTL` | Literal in `render.yaml` — `15m` |
| `JWT_REFRESH_TTL` | Literal in `render.yaml` — `30d` |
| `COMMERCE_ENCRYPTION_KEY` | **Generated** (`openssl rand -hex 32`, 64 hex chars, validated against `apps/api/src/config/env.ts`'s `HEX_32_BYTES` regex) — delivered to you privately in a prior step, **not** in any committed file |

Everything else is either automatic (§6), or depends on an account/choice not yet made (§5).

---

## 5. Values That Must Still Be Created

| Variable(s) | What's needed |
|---|---|
| `DATABASE_URL` | Create the Supabase project; copy its **Session Pooler** connection string (§7) |
| `FRONTEND_URL` | Doesn't exist until the Vercel deploy happens; use a placeholder first, fix it after (§11) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Your own choice — decide a real email you control and a strong password (not the `.env.example` placeholder text, which is rejected at startup) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM_ADDRESS` | Create/confirm your Resend (or other SMTP provider) account (§8) |
| `OPENAI_API_KEY` | Create/confirm your OpenAI account and generate a key (§9) |
| `GOOGLE_MAPS_API_KEY` | Optional — only if Google Places import is wanted (§10) |
| `SITE_PLATFORM_DOMAIN` | Optional — only if per-restaurant custom-domain publishing is wanted; requires a domain you control |
| `API_URL` (Vercel) | The Render service's URL, known only after the Render deploy completes |
| `NEXT_PUBLIC_SITE_URL` (Vercel) | Your production domain, or the Vercel-assigned URL if none yet |

---

## 6. Values Auto-Generated by Render

| Variable | Mechanism |
|---|---|
| `JWT_ACCESS_SECRET` | `generateValue: true` in `render.yaml` — Render generates a random value at Blueprint-apply time; never shown to you, never prompted for |
| `JWT_REFRESH_SECRET` | Same mechanism. (Declared but not currently read by any module — `apps/api/src/config/env.ts` line 194 — kept reserved for future use.) |

No action needed for either — do not attempt to set these manually.

---

## 7. Values That Come From Supabase

| Variable | Detail |
|---|---|
| `DATABASE_URL` | The completed **Session Pooler** connection string. **Not** Direct Connection (IPv6-only by default — unreachable from Render without a paid add-on). **Not** Transaction Pooler (breaks `prisma migrate deploy`'s session-level locking, which runs on every container boot via `apps/api/scripts/start.sh`). Full reasoning: `docs/reports/SUPABASE_SETUP_REPORT.md` §3. Obtain from Supabase dashboard → **Connect → Session pooler** tab. Format: `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require` |

This is the **only** variable Supabase supplies.

---

## 8. Values That Come From Resend (or your chosen SMTP provider)

| Variable | Detail |
|---|---|
| `SMTP_HOST` | Provider's SMTP relay host, e.g. `smtp.resend.com` |
| `SMTP_PORT` | Provider's SMTP port, commonly `587` |
| `SMTP_USER` | Provider-issued auth username (Resend typically uses the literal string `resend` or an API-key-style value — confirm in your Resend dashboard) |
| `SMTP_PASSWORD` | Provider-issued API key / SMTP password |
| `SMTP_FROM_ADDRESS` | A sender address your provider allows (must pass Resend's domain-verification setup for production sending) |

Required for transactional order emails to send at all. The app boots fine without these set, but every email-sending code path will fail silently into logged errors until they're configured.

---

## 9. Values That Come From OpenAI

| Variable | Detail |
|---|---|
| `OPENAI_API_KEY` | From platform.openai.com → API keys. Selects OpenAI as the AI provider (priority order: OpenAI → Anthropic → Gemini — `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` work as alternatives but aren't declared in `render.yaml`; add manually via Render's Environment tab if preferred) |

Powers: menu import (PDF/image extraction), brand analysis, content generation, and the Brand Consistency judge. The app boots fine without it; these specific features are unavailable until set.

---

## 10. Values That Come From Google Cloud

| Variable | Detail |
|---|---|
| `GOOGLE_MAPS_API_KEY` | From Google Cloud Console, with the Places API enabled. Used server-side only, for Places Details + Photo Media lookups during Google Maps-based restaurant import |

**Fully optional.** Leave unset if this import method isn't needed at launch — nothing else depends on it.

---

## 11. Exact Deployment Order

### Phase A — Supabase (do this first)

1. Create the Supabase project (`docs/reports/SUPABASE_DEPLOYMENT_CHECKLIST.md` §2A). Capture the database password immediately.
2. Confirm Postgres version ≥ 16 (§2B of the same checklist).
3. Copy the **Session Pooler** connection string, substitute the real password, confirm `?sslmode=require` is present (§2C).
4. Do **not** run any migration yet — the first Render boot does this automatically.

### Phase B — Render (Blueprint deploy)

5. render.com → **New +** → **Blueprint** → select `abukeeth/core` → explicitly confirm branch = `main`.
6. Review the Blueprint preview (one service, `ordervora-api`, Docker, Free plan) → **Apply**.
7. Fill every prompted `sync: false` variable, **in this exact order** (matches `render.yaml`'s declaration order, which is the order Render prompts):

   | Order | Variable |
   |---|---|
   | 1 | `DATABASE_URL` — the Phase A value |
   | 2 | `FRONTEND_URL` — temporary placeholder for now |
   | 3 | `COMMERCE_ENCRYPTION_KEY` — the value already generated and delivered to you privately |
   | 4 | `ADMIN_EMAIL` |
   | 5 | `ADMIN_PASSWORD` |
   | 6 | `ADMIN_NAME` |
   | 7 | `SMTP_HOST` |
   | 8 | `SMTP_PORT` |
   | 9 | `SMTP_USER` |
   | 10 | `SMTP_PASSWORD` |
   | 11 | `SMTP_FROM_ADDRESS` |
   | 12 | `OPENAI_API_KEY` |
   | 13 | `GOOGLE_MAPS_API_KEY` (optional — may be left blank) |
   | 14 | `SITE_PLATFORM_DOMAIN` (optional — may be left blank) |

   (`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are not prompted — Render generates them automatically.)
8. Watch the **Events** tab until the build completes.
9. Confirm **Settings → Auto-Deploy** is enabled and **Settings → Health Check Path** reads `/health`.
10. Note the assigned public Render URL.
11. Verify: `GET <render-url>/health` → `200`; `GET <render-url>/ready` → `200` (confirms real DB connectivity).
12. Check the **Logs** tab for `"Seeded ADMIN user: <your ADMIN_EMAIL>"` — **not** `admin@demo.ordervora.example`. This confirms the seed-system fix (§1) is in effect.

### Phase C — Vercel

13. vercel.com → **Add New** → **Project** → import `abukeeth/core`.
14. Set **Root Directory** to `apps/web`.
15. Set environment variables (must be available at **build time**, not just runtime):
    - `API_URL` = the Render URL from step 10
    - `NEXT_PUBLIC_SITE_URL` = your real production domain, or leave as the Vercel-assigned URL for now
16. Deploy.
17. Open the deployed Vercel URL — confirm the app loads.

### Phase D — Close the loop

18. Back in Render: **Environment** tab → set `FRONTEND_URL` to the real Vercel URL from step 16/17 → save (Render redeploys automatically).
19. Re-verify `<render-url>/health` and `<render-url>/ready` after the redeploy.
20. Perform first production login (§13) and post-deployment verification (§14).

---

## 12. Final Security Checklist

- [ ] `COMMERCE_ENCRYPTION_KEY` pasted into Render exactly as generated — never committed to any file in this repository, ever (confirmed: `abukeeth/core` is public)
- [ ] `ADMIN_PASSWORD` is strong and unique — not the `.env.example` placeholder text (startup validation rejects that specific string in production)
- [ ] `DATABASE_URL` uses the **Session Pooler**, includes `sslmode=require`
- [ ] No `.env` file with real values has been committed anywhere in this repo (only `.env.example`, which contains placeholder text only)
- [ ] `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` left to Render's auto-generation — not manually set to a guessable value
- [ ] `SMTP_PASSWORD`/`OPENAI_API_KEY`/`GOOGLE_MAPS_API_KEY` set only in Render's environment store, never pasted into a commit, PR description, or chat log that gets published
- [ ] Confirmed the seed-system fix is live (§11 step 12) — a demo admin with a public, documented password (`OrdervoraDemo!23`) must **not** exist in the production database
- [ ] `docs/reports/PRODUCTION_ENVIRONMENT_VALUES.md` and this book contain **zero** real secret values — spot-check before every future edit to either file
- [ ] A secrets-rotation owner/process is agreed before launch (§17)

---

## 13. First Production Login Checklist

- [ ] Confirm `Logs` shows `"Seeded ADMIN user: <your ADMIN_EMAIL>"` on the very first deploy (§11 step 12) — if it instead shows anything about a "beta seed" or `admin@demo.ordervora.example`, **stop** — the fix did not take effect; do not proceed with real data until this is corrected
- [ ] Log in at the deployed web app's `/login` using your `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- [ ] Confirm the admin dashboard loads and shows **zero** restaurants (a clean database — not the 3 demo restaurants the pre-fix seed used to create)
- [ ] Immediately store `ADMIN_PASSWORD` in a password manager if not already there
- [ ] Create the platform's first real restaurant owner account through the normal onboarding flow — confirm it appears correctly in the admin restaurant list
- [ ] If the Sprint 08 demo/beta experience is wanted for internal review purposes, run it manually and separately: `pnpm --filter api run seed:beta` (+ `seed:beta:orders`, `seed:beta:delivery-order`) against a **non-production** database, never against the live one

---

## 14. Post-Deployment Verification Checklist

- [ ] `GET <render-url>/health` → `200`, `{"status":"ok", ...}`
- [ ] `GET <render-url>/ready` → `200`, `{"status":"ready"}` (live DB connectivity through the Session Pooler)
- [ ] `GET <render-url>/metrics` → Prometheus-format output, no errors
- [ ] Web app loads at the Vercel URL, no console errors referencing `localhost:4000`
- [ ] A real API call through the deployed frontend succeeds (not just `/health` in isolation) — per `docs/PRODUCTION_SOURCE_OF_TRUTH.md`'s release acceptance checklist
- [ ] `sitemap.xml` and `robots.txt` reflect the real production domain, not `localhost` (confirms `NEXT_PUBLIC_SITE_URL` was set at Vercel build time)
- [ ] Full golden-path smoke test: customer places a pickup order (cash) → kitchen advances it → order completes — mirrors the Sprint 08 verified walkthrough (`docs/reports/Sprint08/SPRINT_08_BETA_EXPERIENCE_REPORT.md`), now against real (not demo) data
- [ ] Confirm `docs/PRODUCTION_SOURCE_OF_TRUTH.md`'s "Canonical production architecture" and "Current verified state" sections are filled in with the real Vercel project, Render service URL, and commit SHA — this document is explicitly a template until that happens

---

## 15. Rollback Plan

Two independent mechanisms — application code and database schema — per `docs/runbooks/migration-rollback.md`:

**Application code rollback:**
- Render: redeploy the previous known-good commit/image via the dashboard (Render keeps prior deploys). No database action implied.
- Vercel: use "Promote to Production" on a prior deployment, or redeploy a previous commit.

**Database schema rollback:**
- Prisma Migrate is forward-only — there is no `prisma migrate down`.
- **Before real restaurant data exists:** dropping/recreating the database, or `prisma migrate reset` (non-production only), is safe.
- **After real data exists:** never reverse a migration by dropping tables. A destructive schema change is rolled back only via a point-in-time restore (§16) to before it ran, per `docs/runbooks/migration-rollback.md` §"General principles." This is exactly why this codebase's own policy requires destructive changes to go through an expand-contract pattern across multiple deploys (`docs/runbooks/database-setup.md` §5) — it converts "restore from backup" into "just don't ship the next step yet."
- A migration that fails mid-apply: diagnose, then either fix-forward with a new migration, or `prisma migrate resolve --rolled-back <name>` if nothing committed yet. Never hand-edit an already-applied migration file.

**This specific engagement's seed-system fix** (`apps/api/scripts/seed-if-empty.ts`) is trivially reversible on its own: single file, ~10 lines, no schema component — `git revert` the commit and redeploy. Full instructions already in `docs/reports/SEED_SYSTEM_FIX_REPORT.md` §Rollback.

---

## 16. Backup Plan

Per `docs/runbooks/disaster-recovery.md`:

- **Enable on the live Supabase project:** automated daily backups (retain 14+ days as a reasonable default) and **Point-in-Time Recovery (PITR)** if on a Supabase plan that supports it — PITR is what makes "restore to 5 minutes before a bad migration/script ran" possible, versus only "restore to last night."
- **RPO/RTO targets:** ≤5 minutes data loss with PITR active (≤24h on daily-snapshot-only); ≤1 hour to restore the database, ≤30 minutes for an object-storage version rollback, once one is configured.
- **The restore mechanics are already verified, not just documented:** `scripts/restore-drill.sh` — dump → restore into a throwaway database → boot the real compiled server against it → verify `/health`/`/ready` → confirm a marker row round-tripped → tear down. Already run twice successfully against a local Postgres instance in this engagement (`docs/runbooks/disaster-recovery.md` §4). **Action still needed:** run it once against the real Supabase project after it exists, to validate the provider-specific snapshot/restore flow end-to-end, not just the local mechanics.
- **Recommended cadence:** re-run the restore drill quarterly, and immediately after any production schema change with structural risk (new extension, partitioned table, etc.).
- **Object storage** (if `OBJECT_STORAGE_BUCKET` is ever configured — currently unset, uploads fall back to local disk which does not persist on Render's free plan): enable bucket versioning + a lifecycle rule expiring noncurrent versions after 30-90 days.
- **Incident communication procedure** (who's notified, in what order, what affected restaurants are told) is fully defined in `docs/runbooks/disaster-recovery.md` §5 — not duplicated here to avoid drift between two copies of the same procedure.

---

## 17. Secrets Management Policy

1. **No real secret value is ever committed to `abukeeth/core`.** This repository is public. Every `sync: false` variable in `render.yaml`, every value in this book, and every value in `docs/reports/PRODUCTION_ENVIRONMENT_VALUES.md` is a placeholder or format example only — enforced as a standing rule for every future edit to any file in `docs/`, not just the ones written during this engagement.
2. **Secrets that must be generated locally (e.g. `COMMERCE_ENCRYPTION_KEY`) are delivered to the account owner through a private, non-repository channel** — a direct file transfer or equivalent, never a commit, PR description, or issue comment.
3. **Rotation procedures are documented per-secret in `docs/runbooks/secret-rotation.md`** — summary:
   - `COMMERCE_ENCRYPTION_KEY`: safe, non-disruptive rotation (versioned envelope encryption — old ciphertext stays readable via `COMMERCE_ENCRYPTION_KEY_PREVIOUS` during a gradual re-encryption pass).
   - `JWT_ACCESS_SECRET`: disruptive — invalidates every active session immediately. Must be a planned, communicated rotation, not silent.
   - `DATABASE_URL`, `SMTP_*`, `OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`: standard provider-side credential rotation (create new credential → update env var → deploy → revoke old credential).
   - `ADMIN_PASSWORD`: only affects the very first bootstrap; changing an existing admin's password afterward goes through the app's own account-management flow, not this env var.
4. **Any suspected leak is treated as an incident, not routine hygiene** — check the credential's own provider-side audit log where available, and rotate as one part of a broader incident response (`docs/runbooks/secret-rotation.md`, "General principle").
5. **This book and `docs/reports/PRODUCTION_ENVIRONMENT_VALUES.md` must be kept free of real values indefinitely** — if a future edit is ever tempted to paste a real value in "just to have it written down somewhere," the correct place is a password manager or the hosting platform's own encrypted env-var store, never this repository.

---

## Document Status

This book reflects the repository as of commit `36564be` (post seed-system fix, post environment-values workbook) plus this document's own addition. No deployment has occurred yet. Once Phases A–D in §11 are actually executed, update `docs/PRODUCTION_SOURCE_OF_TRUTH.md`'s "Current verified state" section with the real, live details — that document, not this one, is where the *current live state* is tracked going forward. This book is the **procedure**; `PRODUCTION_SOURCE_OF_TRUTH.md` is the **current status**. Keep both in sync after every future deployment.
