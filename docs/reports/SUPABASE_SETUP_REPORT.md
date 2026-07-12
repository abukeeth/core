# Supabase Production Setup Report

Deployment Phase 1 — database preparation only. No code was modified, no database was deployed to, no migrations were run. This report documents inspection findings and the exact steps to perform manually in the Supabase dashboard.

---

## 1. Inspection Summary

Files inspected: `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`, `apps/api/src/lib/prisma.ts`, `apps/api/scripts/start.sh`, `apps/api/src/config/env.ts`, `apps/api/.env.example`, `render.yaml`, `docs/runbooks/database-setup.md`, `apps/api/prisma/migrations/*`.

Key facts established:

- **Single connection string.** `schema.prisma`'s `datasource db` block defines only `url` — there is **no `directUrl`**. The whole application (CLI migrations and runtime queries alike) is driven by exactly one `DATABASE_URL` value. This is confirmed explicitly in `docs/runbooks/database-setup.md` §2: *"`schema.prisma`'s `datasource` block currently defines only `url`... this is not implemented in Phase 1."*
- **`prisma.config.ts`** resolves `DATABASE_URL` via `env("DATABASE_URL")` for the Prisma CLI (used by `prisma migrate deploy`, `prisma generate`).
- **`apps/api/src/lib/prisma.ts`** builds the runtime Prisma Client using `@prisma/adapter-pg` (the `pg` driver adapter), parsing `DATABASE_URL` into discrete `pg` `PoolConfig` fields itself (host/port/user/password/database) rather than passing the raw connection string through, specifically so an explicit `ssl` override isn't silently dropped. Its own code comment states this SSL handling "matches Supabase's own guidance for its Supavisor pooler" — i.e., this file was already written anticipating a Supabase Supavisor connection.
- **`apps/api/scripts/start.sh`** runs `prisma migrate deploy` on **every container start** (not just first boot), immediately before seeding and starting the server. This is the command whose pooler-compatibility requirements drive the recommendation below.
- **Migration history**: 13 migrations under `apps/api/prisma/migrations/`, provider `postgresql` (`migration_lock.toml`). No `CREATE EXTENSION`, no `CONCURRENTLY`, no advisory-lock usage inside the SQL files themselves (Prisma's own migration-tracking locking is a separate, internal mechanism — see §3).
- **`render.yaml`** declares `DATABASE_URL` as `sync: false` — Render will prompt for it once at Blueprint-apply time; it is not a literal in the repo.

---

## 2. Which `DATABASE_URL` Must Be Used

**Use Supabase's Session Pooler connection string.**

Not Direct Connection. Not Transaction Pooler. Session Pooler is the only one of Supabase's three connection modes that satisfies every constraint this specific codebase has simultaneously.

---

## 3. Direct Connection vs. Session Pooler — and why not Transaction Pooler

Supabase exposes three distinct connection strings per project. All three were evaluated against this codebase's actual requirements:

| Mode | Port | Works for `prisma migrate deploy`? | Reachable from Render? | Verdict |
|---|---|---|---|---|
| **Direct Connection** | `5432` (`db.<ref>.supabase.co`) | Yes | **No, by default** — Supabase's direct-connection host is **IPv6-only** unless the paid "IPv4 add-on" is purchased on the project. Render's outbound networking is IPv4. Without the add-on, the connection will not establish at all. | Rejected — reachability risk, avoidable cost |
| **Transaction Pooler** (Supavisor, transaction mode) | `6543` | **No** — Prisma's migration engine uses session-level state (its own advisory-lock-based migration guard, plus prepared-statement behavior in the query engine) that a transaction-mode pooler does not preserve across statements, since it recycles the underlying Postgres connection between transactions/statements. `prisma migrate deploy` is documented by Prisma as incompatible with transaction-mode PgBouncer/Supavisor without a **separate** `directUrl` — which this schema does not have (§1). | Rejected — breaks the migration step that runs on every container start |
| **Session Pooler** (Supavisor, session mode) | `5432` (`aws-0-<region>.pooler.supabase.com`) | **Yes** — session mode holds one dedicated Postgres session per client connection for the connection's lifetime, so prepared statements, advisory locks, and multi-statement session state all behave exactly as they would on a direct connection. | **Yes** — Supavisor's pooler endpoints are IPv4-compatible by default, no add-on required. | **Selected** |

Why this matters specifically here (not a generic pooler recommendation): because `schema.prisma` has no `directUrl`, this project cannot use the normal Prisma-recommended pattern of "transaction pooler for the app + direct URL for migrations." There is exactly one `DATABASE_URL`, and `start.sh` runs `prisma migrate deploy` through it on every boot — so whatever is chosen must support migrations *and* be reachable from Render *and* be reasonable for ongoing runtime query traffic. Session Pooler is the only one of the three that clears all three bars without a code change (a `directUrl` split is explicitly out of scope for this phase per `database-setup.md` §2, and out of scope per this task's "do not modify code" instruction).

---

## 4. Exactly Where to Obtain It in Supabase

1. Log into the Supabase dashboard and open the project.
2. Click **Connect** (top of the project dashboard — a button with a plug/database icon, next to the project name).
3. In the **Connection String** panel that opens, there are three tabs: **Direct connection**, **Transaction pooler**, **Session pooler**.
4. Select the **Session pooler** tab.
5. Copy the URI shown. It has the form:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
6. Replace `[YOUR-PASSWORD]` with the database password set when the project was created (Project Settings → Database → Database Password — reset it there if it's not on hand; resetting invalidates the old password immediately).
7. Append `?sslmode=require` if it is not already present in the copied string (`database-setup.md` requires SSL on every environment; `lib/prisma.ts` also actively looks for a `sslmode` query param to decide whether to set `ssl` on the pool).

The same panel (Project Settings → Database, reached via the gear icon → Database in the left sidebar) shows identical connection strings under a "Connection pooling" section, if the **Connect** button isn't visible in a given dashboard layout version — both paths lead to the same values.

---

## 5. Prisma Compatibility — Verified

- Prisma version: `^7.8.0` (from `apps/api/package.json`), with `@prisma/adapter-pg` `^7.8.0` — both current and mutually compatible.
- `prisma.config.ts` reads `DATABASE_URL` through `env()`, no hardcoded values, no assumption about pooled vs. direct — compatible with any valid Postgres connection string, including a Supavisor session-mode URI.
- `lib/prisma.ts`'s `PrismaPg` adapter parses the URL manually specifically to preserve SSL settings — already defensive against exactly the kind of connection string Supavisor issues (its own code comment names Supavisor by name).
- **Verdict: Compatible, no code changes required.**

## 6. Migration Compatibility — Verified

- `prisma migrate deploy` (the only migration command this project runs against production — `start.sh` and `database-setup.md` both confirm `db push`/`migrate dev` are never used against production) requires a connection that preserves session state across its internal locking and statement execution. Session Pooler provides this; Transaction Pooler does not (§3).
- All 13 existing migrations under `apps/api/prisma/migrations/` are plain, standard SQL (`CREATE TABLE`/`CREATE TYPE`/`CREATE INDEX`/`ALTER TABLE` per `database-setup.md` §4's own audit of the initial migration) — no `CONCURRENTLY`, no extensions, nothing that imposes further connection-mode constraints beyond the one already identified.
- `migration_lock.toml` pins `provider = "postgresql"`, matching Supabase.
- **Verdict: Compatible, no code changes required. Migrations will apply via `prisma migrate deploy` exactly as they did in the local verification recorded in `database-setup.md` §4, once `DATABASE_URL` points at the Session Pooler connection string.**

## 7. Connection Pooling — Verified

- The application does not implement its own pooling logic beyond what `pg.Pool` (via `@prisma/adapter-pg`) does by default — it relies entirely on Supabase's Supavisor for pooling at the infrastructure level.
- Session Pooler mode is still a pooler (Supavisor manages the pool of underlying Postgres connections), it is just not the *transaction*-mode variant — so this recommendation does not mean "give up pooling," it means "use the pooler mode that preserves session semantics."
- Render's free-plan deployment here is a **single instance** (confirmed via `docs/runbooks/render-deploy.md` and `render.yaml`'s `plan: free`, one `web` service) — so there is no multi-instance connection-count pressure to plan for yet. If/when the service scales to multiple instances, Session Pooler's per-connection session model uses more of Supavisor's pool budget than Transaction mode would; that is a future scaling consideration (already flagged for "Phase 11" in `database-setup.md` §2), not a Phase 1 blocker.
- **Verdict: Adequate for current single-instance deployment. No action needed beyond selecting Session Pooler now.**

---

## 8. Step-by-Step Guide

1. In the Supabase dashboard, create the new project (region close to Render's chosen region reduces latency; note the database password chosen at creation time).
2. Once provisioning finishes, open **Connect** → **Session pooler** tab and copy the connection URI (§4 above).
3. Substitute the real database password into the copied string in place of `[YOUR-PASSWORD]`.
4. Confirm the string ends with (or add) `?sslmode=require`.
5. Store this completed string somewhere secure temporarily (password manager / secure note) — it will be pasted into Render's `DATABASE_URL` field during the Render Blueprint deploy step (Deployment Phase 2), not committed to the repository.
6. Do not run `prisma migrate deploy`, `prisma db push`, or any other command against this database yet — this phase is preparation only. Migrations will run automatically via `apps/api/scripts/start.sh` the first time the Render service boots with this `DATABASE_URL` set.
7. Verify the project's Postgres version is 16+ in Project Settings → Database → Infrastructure (matches the version the existing migration history was generated and verified against per `database-setup.md` §4).
8. Leave Point-in-Time-Recovery / backup settings at their default for a new project for now — production backup policy is a separate, later hardening concern (`database-setup.md` §1 baseline: automated daily backups, 7-day retention minimum) and out of scope for this connection-string-only phase.

---

## Verdict

**Ready.** No code changes are required. The codebase's existing single-`DATABASE_URL` design, the `@prisma/adapter-pg` runtime client, and the migration-on-boot pattern in `start.sh` are all compatible with Supabase's **Session Pooler** connection string, and incompatible with Transaction Pooler (migration locking) and Direct Connection (IPv6 reachability from Render) respectively. Obtain the Session Pooler URI from the Supabase dashboard's **Connect → Session pooler** tab, complete it with the real password and `sslmode=require`, and hold it ready for the Render deployment step.
