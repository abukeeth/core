# Migration Rollback Notes

Part of Production Hardening Phase 1. Prisma Migrate does not generate "down" migrations automatically — this document defines the rollback strategy for this project's migration history, since "just run the down migration" is not a command that exists here.

## The baseline migration (`20260703000542_init`)

This first migration is additive-only against an empty database (see `database-setup.md` §4 for the verification detail: 66 `CREATE TABLE`, 55 `CREATE TYPE`, indexes, and FK-only `ALTER TABLE` statements — zero `DROP`s). Rolling it "back" before it's ever been applied to a database holding real data means one of:

- **Before any application data exists:** drop the database and recreate it, or simply don't run `migrate deploy` yet. There is nothing to lose.
- **After the baseline is applied but before real traffic:** `prisma migrate reset` (development/staging only — this command drops and recreates the entire database, then reapplies every migration from scratch) is safe and appropriate.
- **After real restaurant data exists:** the baseline migration itself is never rolled back — at that point, rollback means restoring from a backup (Phase 10) to a point in time before whatever change is being undone, not reverse-applying a `CREATE TABLE`. Dropping tables that already hold live order/payment data to "roll back" would be actively destructive; restore-from-backup is the only sound rollback path once real data exists.

## Rollback strategy for every future migration

Prisma Migrate is a forward-only tool by design: there is no `prisma migrate down`. This project's rollback strategy is therefore two-layered, matching the two ways a migration can go wrong:

### 1. A migration fails to apply during deploy

If `prisma migrate deploy` fails partway through applying a migration (e.g., a constraint violation on existing data), Prisma marks that migration as failed in `_prisma_migrations` and refuses to proceed. Recovery:

1. Diagnose and fix the underlying issue (the failing statement, or the data that violates it).
2. Either fix-forward with a new migration that corrects the problem, or, if the failure happened before any statement in the migration committed (Postgres DDL is transactional per-migration-file in Prisma's default mode), mark the migration as rolled back via `prisma migrate resolve --rolled-back <migration-name>` and reapply a corrected version.
3. **Never** hand-edit a migration file that has already been applied to any shared environment (staging or production) — once applied, a migration file is immutable history; fix problems with a new migration, the same discipline already established for application code in this repository (never rewrite already-pushed git history; the same principle applies to already-applied migrations).

### 2. A migration applies successfully but the resulting behavior is wrong

This is the common case in practice (the SQL ran fine; the *application* behavior it enables is the problem — e.g., a new column with the wrong default, or an index that doesn't actually help the query it was meant for). Rollback here means:

1. **If the migration was purely additive** (new nullable column, new table, new index) and no code has started depending on it yet: write a follow-up migration that removes the addition. Low risk, no data-loss concern, since nothing depended on it.
2. **If the migration was additive and code already depends on it**: do not drop it. Fix forward with another migration, or revert the dependent application code first (via a normal code rollback/redeploy of the previous image, per the deployment architecture Phase 4 defines), *then* consider whether the schema change itself should be removed in a subsequent migration once nothing references it.
3. **If the migration was destructive** (a dropped column, a changed type) and something is now wrong: this is the scenario the expand-contract policy in `database-setup.md` §5 exists specifically to prevent from being routine. If it happens anyway, the only real rollback is a point-in-time restore (Phase 10) to before the destructive migration ran, followed by re-deriving whatever legitimate changes happened after that point some other way. This is precisely why destructive changes are required to go through the expand-contract pattern (add → backfill → migrate reads → remove, across separate deploys) rather than a single step — it converts a "restore from backup" rollback into a "just don't ship the next migration yet" rollback.

## General principles

- **Every migration should be reviewed as if it might need to be the last one shipped** — if it can't be safely left half-rolled-out (i.e., old code still running against the new schema, during a rolling deploy), it isn't ready.
- **Rollback of the application code and rollback of the database schema are independent operations** with different mechanisms (redeploy previous image vs. Phase 10's point-in-time restore) — a migration should be written so that the previous version of the application code still works correctly against the new schema, for exactly as long as a rolling deploy takes to complete. This is the same zero-downtime rollout contract defined in the master spec's Phase 4.
- **This document will grow** as real migrations are written after the baseline — treat each non-trivial future migration's PR description as the place to note anything rollback-relevant specific to that change, with a link back here for the general policy.
