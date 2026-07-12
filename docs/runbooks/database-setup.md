# Production PostgreSQL Setup

Part of Production Hardening Phase 1 (`PRODUCTION_HARDENING_MASTER_SPEC.md`). Covers provisioning a real production database and applying the migration history now committed under `apps/api/prisma/migrations/`.

## 1. Provider selection

No provider is prescribed here — this is a cost/ops decision for whoever operates the deployment. Any managed PostgreSQL 16+ provider works, since the schema uses only standard PostgreSQL types and Prisma's own migration tooling (no provider-specific extensions are required by the current schema). Reasonable options, in no particular order:

- **Neon** or **Supabase** — serverless/managed Postgres with built-in branching and point-in-time recovery; low ops overhead, a good fit if Phase 4's hosting target is also serverless-oriented.
- **AWS RDS for PostgreSQL** — the standard choice if the rest of the deployment (Phase 4) lands on AWS; more configuration knobs, more operational ownership.
- **Google Cloud SQL** — analogous to RDS, for a GCP-based deployment.
- **Railway / Render managed Postgres** — simplest to provision, a reasonable fit for an initial low-traffic production deployment.

Whichever is chosen, require:
- PostgreSQL **16** (matches the version this migration was generated and verified against — see §4).
- **SSL-required** connections (`sslmode=require` or the provider's equivalent) — never allow an unencrypted connection to a production database.
- Automated daily backups with at least a 7-day retention window as a baseline (Phase 10 covers backup verification and disaster recovery in full; this is the minimum to have in place from day one).

## 2. Connection string

`DATABASE_URL` follows the standard Prisma/PostgreSQL connection string format already used throughout this project's `.env.example`:

```
DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<database>?schema=public&sslmode=require"
```

**Never commit a real production connection string to the repository.** It is provided to the running application via the secrets-management mechanism chosen in Phase 3 (a hosting platform's encrypted env-var store, or a dedicated secrets manager) — `.env.example` documents the *shape* of the value, never a real credential.

### Connection pooling — a note for later phases

`schema.prisma`'s `datasource` block currently defines only `url`. Once a connection pooler (PgBouncer in transaction mode, or a managed pooling layer like Prisma Accelerate) is introduced — expected as part of Phase 11's scaling work, once real concurrency data justifies it — the datasource will need a second `directUrl` pointing at an unpooled connection, because `prisma migrate deploy` and `prisma migrate dev` require a direct connection and cannot run through a transaction-mode pooler. This is **not** implemented in Phase 1: at this stage there is exactly one application instance's worth of concurrency to plan for, and introducing a pooler before there's a measured need for one would be exactly the kind of premature scaling work this master spec's phase ordering is designed to avoid. Flagged here so the Phase 11 implementer isn't surprised by needing a schema change to add it.

## 3. Applying the migration history to a new production database

Once a production database exists and `DATABASE_URL` is configured in the environment:

```bash
cd apps/api
pnpm run prisma:migrate:deploy
```

This runs `prisma migrate deploy` — the non-interactive, production-safe command that applies every migration under `prisma/migrations/` in order and records them in Prisma's own `_prisma_migrations` tracking table. It does **not** prompt for confirmation, does **not** attempt to generate a new migration from schema drift, and is safe to run as an idempotent step on every deploy (a second run against an already-migrated database is a no-op — Prisma checks `_prisma_migrations` and applies only what's missing).

Run `pnpm run prisma:generate` (or let a normal `pnpm install` postinstall handle it, if wired that way) immediately after, so the generated Prisma Client matches the schema the database now has.

**Never** run `prisma db push` or `prisma migrate dev` against a production database. Both are development-workflow commands: `db push` bypasses the migration history entirely, and `migrate dev` will attempt to create a new migration interactively and can prompt to reset the database if it detects drift it doesn't know how to reconcile. `migrate deploy` is the only command intended for a production target.

## 4. What was verified in this environment

Since this sandbox has no externally reachable database, the migration was generated and verified against a real, local PostgreSQL 16 instance (the `postgresql-16` package already present in this environment) rather than a cloud-hosted one. The verification performed (see `SPRINT_08_PHASE_1_COMPLETION_REPORT.md` for the full record):

1. `prisma migrate dev --name init` generated `apps/api/prisma/migrations/20260703000542_init/migration.sql` from the complete current schema, applying it to a local database.
2. The generated SQL was inspected and confirmed to contain **only additive statements** — `CREATE TABLE` (66), `CREATE TYPE` (55), `CREATE INDEX`/`CREATE UNIQUE INDEX` (95 combined), and `ALTER TABLE` (95, exclusively for foreign-key constraints) — **zero** `DROP` statements of any kind, as expected for a first migration against an empty database.
3. A second, completely fresh, empty database (`ordervora_verify`) had `prisma migrate deploy` run against it from a clean checkout — the exact command and code path a real production deploy uses — and it applied successfully with no errors.
4. `prisma migrate diff --from-config-datasource --to-schema` between that freshly-migrated database and `schema.prisma`, run with `--exit-code`, reported **"No difference detected"** with exit code `0` — proving the migration produces a database that exactly matches the schema definition, not an approximation of it.
5. `prisma migrate status` against the original development database reported **"Database schema is up to date!"**

None of this required a cloud provider — the same `prisma migrate deploy` command will behave identically against any real PostgreSQL 16+ target once `DATABASE_URL` points at one, per §2/§3 above.

## 5. Ongoing migration policy

From this point forward:

- Every schema change gets its own migration file (`prisma migrate dev --name <description>` in development, generating a new file under `prisma/migrations/`), reviewed in its PR like any other code change.
- `schema.prisma` is never hand-edited and pushed to a shared database without a corresponding migration — that workflow (necessary pre-Phase-1, since no reachable database existed to migrate against) is retired as of this phase.
- Destructive changes (column drops, renames, type changes) follow an expand-contract pattern across at least two deploys: add the new shape, backfill/dual-write, migrate all reads to the new shape, then remove the old shape in a later migration — never a single-step destructive change once real restaurant data exists. See `migration-rollback.md` for how this interacts with rollback strategy.
