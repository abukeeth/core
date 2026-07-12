# Production Hardening — Phase 1 Completion Report

**Phase:** 1 of 11 — Database Migrations & Production PostgreSQL (`PRODUCTION_HARDENING_MASTER_SPEC.md`)
**Addresses:** PR-1 (no Prisma migration history existed) and lays groundwork for PR-10 (connection pooling, deferred to Phase 11 per the master spec).
**Scope discipline:** exactly Phase 1's work items. Phase 2 (CI/CD) was **not** started — no `.github/workflows/` file was touched, even though the master spec lists CI wiring as touching both phases. That wiring is deferred to Phase 2 per your explicit instruction.

---

## 1. What was done

### 1.1 Real PostgreSQL used for verification

This sandbox has no externally reachable database (confirmed: `pg_isready` against the configured `DATABASE_URL` host previously returned no response, and no `docker` daemon is running here). Rather than generating the baseline migration blind and only trusting `prisma validate`, a real, local PostgreSQL 16 instance already present in this environment (`postgresql-16`/`postgresql-client-16` packages) was started and used for the entire verification below — this is a genuine database round-trip, not a schema-only check.

### 1.2 Baseline migration generated

```
apps/api/prisma/migrations/
├── 20260703000542_init/
│   └── migration.sql   (1734 lines)
└── migration_lock.toml
```

Generated via `prisma migrate dev --name init` against the local Postgres instance, capturing the entire schema built across Sprints 01 through 07.7 in one reviewed initial migration — every auth, restaurant/menu, import-engine, website-builder, and commerce-engine model.

### 1.3 Migration content reviewed — confirmed additive-only

| Statement type | Count |
|---|---|
| `CREATE TABLE` | 66 |
| `CREATE TYPE` (enums) | 55 |
| `CREATE INDEX` | 61 |
| `CREATE UNIQUE INDEX` | 34 |
| `ALTER TABLE` (foreign-key constraints only) | 95 |
| `DROP *` (any kind) | **0** |

Exactly what's expected for a first migration against an empty database — no risk of data loss, since there is no data to lose.

### 1.4 Migration verified to apply cleanly — three independent checks

1. **`prisma migrate deploy` against a completely fresh, empty database** (`ordervora_verify`, created and dropped solely for this verification) — the exact command and code path a real production deploy uses (not `migrate dev`, which is a development-only command). Applied successfully with no errors; resulting database contains 67 tables (66 models + Prisma's own `_prisma_migrations` tracking table).
2. **`prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code`** between that freshly-migrated database and the schema file reported **"No difference detected"** with exit code `0` — proof the migration produces a database that exactly matches the schema definition, not merely "some SQL that ran without erroring."
3. **`prisma migrate status`** against the original development database reported **"Database schema is up to date!"**

The throwaway verification database was dropped after these checks; the persistent local development database (`ordervora`, matching the existing `apps/api/.env` `DATABASE_URL`) retains the applied migration for continued local development.

### 1.5 Production database setup documentation

New: `docs/runbooks/database-setup.md`. Covers:
- Provider selection (presented as options — Neon/Supabase, RDS, Cloud SQL, Railway/Render — not prescribed, since it's a cost/ops decision outside this phase's scope).
- Connection-string format and the requirement to never commit a real credential (routed through Phase 3's secrets management once that phase lands).
- An explicit note that connection pooling (`directUrl` split) is deliberately **not** implemented in this phase — flagged for Phase 11, once real concurrency data justifies it, rather than guessed at now.
- Step-by-step `prisma migrate deploy` usage for applying the migration history to a new production database, and an explicit warning against ever running `db push` or `migrate dev` against production.
- A record of exactly what was verified in this sandboxed environment (§1.4 above, restated for the document's own audience) and why the same command will behave identically against any real PostgreSQL 16+ target.
- The ongoing migration policy going forward (every schema change gets its own reviewed migration; no more hand-edited `schema.prisma` pushed without one).

### 1.6 Rollback notes

New: `docs/runbooks/migration-rollback.md`. Since Prisma Migrate has no `migrate down` command, this document defines the project's actual rollback strategy:
- Rollback posture for the baseline migration specifically (drop-and-recreate before any data exists; `migrate reset` in dev/staging; restore-from-backup once real data exists — never a destructive rollback against live data).
- The two-layered strategy for future migrations: (a) a migration that **fails mid-deploy** — diagnose, fix-forward or `migrate resolve --rolled-back`, never hand-edit an already-applied migration file; (b) a migration that **applies successfully but the resulting behavior is wrong** — different handling depending on whether the change was purely additive (safe to remove in a follow-up migration) versus destructive (requires a point-in-time restore, Phase 10).
- Reiterates the expand-contract discipline from the setup doc, framed specifically as *why* it exists: it converts a "restore from backup" rollback into a "just don't ship the next migration yet" rollback.

### 1.7 `prisma validate` / `prisma generate`

Both run clean (see §2 below) — `prisma validate` was already passing before this phase (the schema itself was never in question); `prisma generate` regenerates the client against the same schema the new migration was diffed from, with the same result as always.

### 1.8 `package.json` script added

```diff
     "prisma:migrate": "prisma migrate dev",
+    "prisma:migrate:deploy": "prisma migrate deploy",
     "prisma:seed": "prisma db seed",
```

### 1.9 `.env.example` updated

`DATABASE_URL`'s entry gained a short comment pointing at `docs/runbooks/database-setup.md` and noting the production `sslmode=require` expectation — no value changed, documentation only.

---

## 2. Files Changed

**New:**
- `apps/api/prisma/migrations/20260703000542_init/migration.sql`
- `apps/api/prisma/migrations/migration_lock.toml`
- `docs/runbooks/database-setup.md`
- `docs/runbooks/migration-rollback.md`
- `docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_1_COMPLETION_REPORT.md` (this file)

**Modified:**
- `apps/api/package.json` — one new script (`prisma:migrate:deploy`)
- `apps/api/.env.example` — comment only, no value change

**Explicitly not touched (Phase 2+ scope):**
- `.github/workflows/ci.yml` — the master spec lists a Postgres-service-container + migrate-deploy CI step under both Phase 1 and Phase 2; per your instruction to stop after Phase 1, this was left alone.
- Any Dockerfile, `docker-compose.yml`, hosting configuration (Phase 4).
- Any application source code under `apps/api/src` or `apps/web/src` — this phase is schema/tooling/documentation only, as scoped.

---

## 3. Verification Results

| Step | Result |
|------|--------|
| `prisma validate` | ✅ Pass |
| `prisma generate` | ✅ Pass |
| Migration generated from current schema against a real Postgres 16 instance | ✅ Pass — `20260703000542_init` |
| Migration content reviewed — additive-only (0 `DROP` statements) | ✅ Confirmed |
| `prisma migrate deploy` against a fresh, empty database | ✅ Pass |
| `prisma migrate diff` (migrated DB vs. schema, `--exit-code`) | ✅ "No difference detected", exit code 0 |
| `prisma migrate status` | ✅ "Database schema is up to date!" |
| `pnpm -r lint` (api + web) | ✅ Pass, no warnings |
| `pnpm -r typecheck` (api + web) | ✅ Pass |
| `pnpm -r test` | ✅ **822 / 822 passing** (813 `apps/api` + 9 `apps/web`) — unchanged from before this phase, confirming the migration files introduced no regression |
| `pnpm -r build` (api `tsc`, web `next build`) | ✅ Pass, all 28 web routes compiled |

No test was skipped, weakened, or deleted. No application code changed, so the identical 822/822 test count versus the pre-Phase-1 baseline is the expected, correct result — this phase's surface area is schema tooling and documentation, not runtime behavior.

---

## 4. Notes / What's Deliberately Deferred

- **Connection pooling / `directUrl` split** — explicitly not implemented; documented as a Phase 11 decision once real concurrency data exists to size it against, per `database-setup.md` §2.
- **CI Postgres-service-container + automated `migrate deploy` step** — Phase 2 scope, not started.
- **Actual cloud provider selection/provisioning** — a cost/ops decision presented as options in `database-setup.md`, not made unilaterally; no cloud resources were created as part of this phase, and none will be without your explicit direction (this phase's verification used only a local PostgreSQL instance already present in the sandbox).
- **Point-in-time restore / backup automation** — Phase 10 scope; `migration-rollback.md` references it but does not implement it.

---

*Phase 1 complete. Waiting for your review before Phase 2 (CI/CD Hardening) begins.*
