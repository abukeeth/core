# Supabase Deployment Checklist — Phase 2 (Supabase Only)

Scope: Supabase project setup and value collection only. Nothing in this phase touches Render or Vercel directly — it produces the one value (`DATABASE_URL`) that the Render deployment guide (`docs/reports/RENDER_DEPLOYMENT_GUIDE.md`) requires as input. No deployment was performed and no code was modified while producing this report.

Built from: `docs/reports/SUPABASE_SETUP_REPORT.md` (Phase 1 findings), `docs/reports/RENDER_DEPLOYMENT_GUIDE.md` (§9/§11, where `DATABASE_URL` is consumed), `render.yaml`, `apps/api/src/lib/prisma.ts`, `apps/api/prisma.config.ts`, `docs/runbooks/database-setup.md`.

---

## 1. Recap: What Was Already Decided (Phase 1)

- This codebase uses a **single** `DATABASE_URL` — there is no `directUrl` split in `schema.prisma`.
- `apps/api/scripts/start.sh` runs `prisma migrate deploy` on every container boot, which requires session-level Postgres state.
- Of Supabase's three connection modes, only the **Session Pooler** satisfies all constraints at once: it supports `prisma migrate deploy` (unlike Transaction Pooler) and it's reachable from Render over IPv4 without a paid add-on (unlike Direct Connection, which is IPv6-only by default).
- Full reasoning: `docs/reports/SUPABASE_SETUP_REPORT.md` §3.

This phase turns that decision into an executable, step-by-step checklist plus a precise inventory of what to copy and carry forward to Render.

---

## 2. Step-by-Step Setup Checklist

### A. Create the project

- [ ] Log into the Supabase dashboard.
- [ ] Click **New Project**.
- [ ] Choose the organization (or create one if this is a first-time account).
- [ ] **Name** the project (any name — not read by application code; purely a Supabase-dashboard label).
- [ ] Set the **Database Password** — click "Generate a password" or set one manually. **Copy this password immediately and store it somewhere secure (password manager).** It is shown in full only once at creation time; if lost, it must be reset later (Project Settings → Database → Reset Database Password), which invalidates the old one.
- [ ] Choose a **Region** — pick one geographically close to where the Render service will run, to minimize database round-trip latency (Render's own region choice happens later, in Phase 3; try to align them).
- [ ] Leave the **Pricing Plan** at the default Free tier (sufficient for this deployment — no paid resource is required by anything in this codebase).
- [ ] Click **Create new project** and wait for provisioning to finish (typically 1-2 minutes).

### B. Verify the database version

- [ ] Go to **Project Settings** (gear icon, bottom of left sidebar) → **Database** → **Infrastructure**.
- [ ] Confirm the Postgres version is **16 or higher**. This matches the version the existing migration history (`apps/api/prisma/migrations/`) was generated and verified against (`docs/runbooks/database-setup.md` §4). Supabase's current default for new projects satisfies this; this step is a confirmation, not an action.

### C. Obtain the connection string

- [ ] From the project dashboard, click **Connect** (top of the page, near the project name) — or navigate to **Project Settings → Database** if that button isn't visible in your dashboard layout.
- [ ] In the **Connection String** panel, select the **Session pooler** tab (not "Direct connection", not "Transaction pooler" — see §1 above for why).
- [ ] Copy the full URI shown. It will look like:
  ```
  postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
  ```
- [ ] Replace `[YOUR-PASSWORD]` in the copied string with the real database password from step A.
- [ ] Confirm the string includes `?sslmode=require` at the end. If it's missing, append it manually — the application requires SSL and `apps/api/src/lib/prisma.ts` actively checks for this query parameter to decide whether to enable `ssl` on the connection pool.
- [ ] Store this **completed** connection string (password substituted, `sslmode=require` present) somewhere secure temporarily — a password manager or secure note. **Do not commit it to the repository or paste it into any file in this codebase.**

### D. Do not run migrations yet

- [ ] Do **not** run `prisma migrate deploy`, `prisma db push`, or connect to this database with any tool yet. This phase is preparation only. Migrations will run automatically, for the first time, when the Render service boots with this `DATABASE_URL` set (Phase 3).

### E. Leave backup/PITR settings at default

- [ ] No action needed on **Database → Backups** for this phase — production backup policy (`docs/runbooks/database-setup.md` §1 baseline: daily backups, 7-day minimum retention) is a separate hardening step, out of scope for connection-string setup.

---

## 3. Every Value to Copy From Supabase

| # | Value | Where to find it in Supabase | Format/example |
|---|---|---|---|
| 1 | **Database Password** | Shown once at project creation (step A); resettable later at **Project Settings → Database → Database Password** | A plain string, e.g. `Xy7!kPq...` |
| 2 | **Session Pooler connection string** (the completed `DATABASE_URL`) | **Connect → Session pooler** tab, or **Project Settings → Database → Connection pooling** | `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require` |

Everything else about the connection (project reference, pooler host, port `5432`) is already embedded inside the one connection string above — there is nothing else to separately extract. This project's single-`DATABASE_URL` design (§1) means Supabase contributes exactly **one** value to the eventual Render configuration, not several discrete fields.

---

## 4. Exactly Where Each Value Is Used Later in Render

| Value | Used in Render as | Render location | Why |
|---|---|---|---|
| **Database Password** | Embedded inside the `DATABASE_URL` string (item 2 below) — not entered anywhere in Render on its own | N/A (component only) | The app never reads a bare password — only the full connection string, parsed by `apps/api/src/lib/prisma.ts` |
| **Session Pooler connection string** | `DATABASE_URL` environment variable | Render Blueprint deploy → environment variable prompt for `DATABASE_URL` (declared `sync: false` in `render.yaml`) — see `docs/reports/RENDER_DEPLOYMENT_GUIDE.md` §9, row 3, and §11 | This is the **only** variable Supabase supplies. It is read by: (1) `apps/api/prisma.config.ts` for the Prisma CLI, which runs `prisma migrate deploy` on every container boot via `apps/api/scripts/start.sh`; and (2) `apps/api/src/lib/prisma.ts` for the application's runtime Prisma Client (`@prisma/adapter-pg`), used for every database query the API makes. |

No other Render field or environment variable is sourced from Supabase. All 19 other environment variables in `render.yaml` come from Render itself (auto-generated), literal defaults, or other providers (OpenAI, SMTP) and values you choose directly — see `docs/reports/RENDER_DEPLOYMENT_GUIDE.md` §10–§13 for those.

---

## 5. Verification Before Moving to Render

- [ ] The completed connection string starts with `postgresql://postgres.` (not `postgresql://postgres:` — the dot after `postgres` before the project ref is specific to the pooler format, distinct from the direct-connection format).
- [ ] The host in the string ends in `.pooler.supabase.com`, **not** `.supabase.co` (the latter is the direct-connection host — using it here would silently reintroduce the IPv6-reachability problem from `docs/reports/SUPABASE_SETUP_REPORT.md` §3).
- [ ] The port in the string is `5432` (Session Pooler), not `6543` (Transaction Pooler).
- [ ] `?sslmode=require` is present.
- [ ] The password in the string is the real one, not the literal placeholder text `[YOUR-PASSWORD]`.

Once every box above is checked, this value is ready to be pasted into Render's `DATABASE_URL` prompt during the Blueprint deploy step described in `docs/reports/RENDER_DEPLOYMENT_GUIDE.md`.

---

## Verdict

**Supabase-side preparation is fully specified and ready to execute.** One project to create, one password to capture, one connection string to copy and complete — feeding exactly one Render environment variable (`DATABASE_URL`). No code changes required, no deployment performed as part of this checklist.
