# Disaster Recovery

Part of Production Hardening Phase 10 (`PRODUCTION_HARDENING_MASTER_SPEC.md`). Depends on Phase 1 (production PostgreSQL) and Phase 7 (object storage) both being in their final production form. Objective, per the master spec: ensure the production database and object-storage bucket are backed up and **restorable** — "configured backups that have never been restored are not verified backups." This runbook, together with `scripts/restore-drill.sh`, is the thing that closes that gap: a drill that has actually been run, not just a policy document describing one.

## 1. What's backed up, and how

### 1.1 PostgreSQL (Phase 1)

Whichever managed provider Phase 1 lands on (`docs/runbooks/database-setup.md` §1 lists the candidates — Neon, Supabase, RDS, Cloud SQL, Railway/Render), require:

- **Automated daily backups**, retained 7–30 days (tune based on cost/compliance requirements — 14 days is a reasonable default for a platform this size at launch).
- **Point-in-time recovery (PITR)**, if the provider supports it (Neon, Supabase, and RDS all do). PITR matters specifically because the highest-likelihood real incident here isn't "the database disappeared" — it's "a bad migration or a bad data-fixing script ran against production a few minutes ago." A daily snapshot alone can only roll back to last night; PITR rolls back to the exact second before the bad statement ran.
- This is provider/infrastructure configuration, not a repository code change — there is nothing in `apps/api` to modify for it. Enabling it is an operational step to perform once a real production database exists (Phase 1's completion report already flags this as the natural point to configure it, since Phase 1 was necessarily verified against a local PostgreSQL instance in this sandbox, which has no such feature).

**On-demand backup (`scripts/backup-database.sh`).** In addition to the provider's automated snapshots, the repository ships a manual backup command that produces a single restorable artifact (`pg_dump -Fc`, compressed, `--no-owner --no-acl` for portability) and verifies the artifact is a readable archive before reporting success. Use it before a risky migration or data-fix, or to seed a staging database. It complements — does not replace — the provider's automated backups.

```bash
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public" ./scripts/backup-database.sh
# → backups/ordervora-<UTC-timestamp>.dump, then restore with:
#   pg_restore --no-owner --no-acl -d <fresh-database-url> <that-file>
```

### 1.2 Object storage (Phase 7)

Once `OBJECT_STORAGE_BUCKET` is configured against a real S3-compatible bucket (`docs/runbooks/object-storage.md`), enable:

- **Bucket versioning** — so an accidental overwrite of a published site's release assets or an uploaded image (`S3FileStorage`/`S3ReleaseStorage`, both `apps/api/src/lib/`) is recoverable by restoring the prior version, not just prevented.
- **A lifecycle rule expiring noncurrent versions** after a bounded window (30–90 days is reasonable) — versioning without a lifecycle rule means storage cost grows unbounded forever; this caps it while still giving a meaningful recovery window.
- Same as §1.1: this is a bucket-configuration step at the provider (AWS S3 console/API, Cloudflare R2, Backblaze B2, or `mc` for MinIO), not a code change. `docker-compose.yml`'s local MinIO service is for development/production-simulation, not itself something that needs a backup policy.

## 2. Access list

Who can trigger a restore, and who must be notified when one happens:

| Role | Can trigger a restore | Must be notified |
|---|---|---|
| On-call engineer | Yes | — |
| Engineering lead | Yes | Yes (immediately, any production restore) |
| Restaurant-facing support/ops | No | Yes (once a restore is confirmed necessary, before it starts, so they can prepare the affected-restaurant communication in §5) |

Exact names/contact channels are an organizational detail to fill in once there's a real team roster — this table defines the roles, not people, so it stays correct as the team changes.

## 3. RTO / RPO targets

| Metric | Target | Why |
|---|---|---|
| **RPO** (Recovery Point Objective — how much data can be lost) | ≤ 5 minutes with PITR active; ≤ 24 hours if only daily snapshots are configured | PITR should be enabled per §1.1 specifically so the real target is minutes, not a full day — a day of lost orders/payments for even one restaurant is a significant incident, not an acceptable baseline. |
| **RTO** (Recovery Time Objective — how long until the app is serving traffic again) | ≤ 1 hour for a database restore; ≤ 30 minutes for an object-storage version rollback | Based on the restore drill's own measured timing (§4) plus realistic time to detect the incident, decide to restore, and communicate — not just the mechanical restore step. |

These are initial targets for a single-region, single-primary-database deployment (this platform's actual current architecture — no read replica, no multi-region failover exist yet). Revisit once Phase 11's load testing and any future scaling work changes the architecture these targets assume.

## 4. Restore drill — executed, not just documented

**`scripts/restore-drill.sh`** is the master spec's own explicit instruction (work item 4: "this must happen at least once before backups are considered 'working,' not just configured") turned into a reusable, re-runnable script rather than a one-time manual exercise. It:

1. Writes a marker row into a dedicated table in the source database (proves the dump captures whatever's actually in the database — no dependency on any seed script).
2. `pg_dump`s the source database (plain SQL, `--no-owner --no-acl` for portability across roles/hosts).
3. Creates a throwaway database and restores the dump into it.
4. Boots the *compiled* server (`node dist/src/index.js`, the exact artifact a real deploy runs) against the throwaway database via a distinct `DATABASE_URL`, and polls `/health`/`/ready` until both succeed.
5. Confirms the marker row survived the round trip byte-for-byte.
6. Verifies **full-table integrity**: counts every public table in both the source and the restored database and requires them to be identical (a partial or selectively-failed restore — some tables empty, a failed `COPY` — shows up here even when the single marker row survived).
7. Tears everything down — the drill server, the throwaway database, the marker row, the dump file — leaving no trace, so it's safe to re-run on demand without accumulating cruft.

It exits non-zero on any step's failure (and still tears down what it safely can) — a drill that silently reports success on a partial restore would be worse than not running one.

### Actually executed in this environment

This sandbox has no externally reachable managed-Postgres provider, so the drill was run against this environment's real local PostgreSQL 16 instance — rather than a cloud snapshot. The mechanics (`pg_dump` → fresh database → restore → boot the compiled app → verify) are identical to what a real provider-hosted restore looks like; only the source of the dump differs (a live `pg_dump` here vs. a provider's managed snapshot in production).

**Re-verified 2026-07-24** against a database freshly migrated (`prisma migrate deploy`, all migrations through `20260724000000_kitchen_unaccepted_alert`) and seeded with the beta dataset (a real graph across ~20 tables — restaurants, full menus with variants/modifiers, customers, coupons, delivery config). The drill passed, now including the new full-table integrity check:

```
[restore-drill] Step 1/7: writing a marker row to the source database
[restore-drill] Step 2/7: pg_dump of the source database -> /tmp/restore_drill_1784921666.sql
[restore-drill] Step 3/7: creating throwaway database ordervora_restore_drill_1784921666 and restoring into it
[restore-drill] Step 4/7: booting the compiled server against the throwaway database
[restore-drill]   /health and /ready both succeeded against the restored database
[restore-drill] Step 5/7: confirming the marker row survived the restore byte-for-byte
[restore-drill]   Marker row round-tripped correctly: drill-20260724T193426Z
[restore-drill] Step 6/7: verifying full-table row-count integrity (source vs restored)
[restore-drill]   All 77 tables have identical row counts in source and restored database
[restore-drill] Step 7/7: tearing down (server, throwaway database, dump file, marker row)
[restore-drill] Restore drill PASSED.
```

As an additional, independent integrity check beyond the drill's row-count comparison, a standalone `pg_dump -Fc` → `pg_restore` into a fresh database was verified with order-independent **content checksums** (`md5` over per-row hashes) on the data-bearing tables — `MenuItem`, `Restaurant`, `Customer`, `Coupon`, `MenuCategory`, `Theme`, `User`, `RestaurantHours`, `Table`, `MenuItemVariant` — every one matched byte-for-byte between source and restored, and a content spot-check (menu item names + prices, restaurant names) round-tripped exactly. Teardown left no trace — no leftover throwaway database, marker table, or dump file. Total wall-clock time for the full cycle was a few seconds against this environment's dataset size; the real number against a production-sized database and a cloud provider's managed snapshot-restore will differ and should be re-measured once one exists, per §3's RTO note.

> Note on `--data-only` dump comparison: a naïve `md5` of two `pg_dump --data-only` outputs is **not** a valid equality test here — the schema has circular foreign keys (e.g. `User`↔`Restaurant`), so `pg_dump` reorders `--data-only` output and emits sequence `setval()` lines, making the raw text differ even when the data is identical. The per-table `COUNT(*)` and per-table content-hash checks above are the correct, reliable integrity signals; use those, not a whole-dump `md5`.

### Running it yourself

```bash
pnpm --filter api run build   # the drill boots the compiled server, not tsx/ts-node
DATABASE_URL="postgresql://user:pass@host:5432/dbname?schema=public" ./scripts/restore-drill.sh
```

If `DATABASE_URL` isn't already exported, the script falls back to sourcing `apps/api/.env`. Requires `pg_dump`/`psql` (standard PostgreSQL client tools) and `curl` on the machine running it — never run this against a database anyone else is actively using for real work, since step 1 writes (and later removes) a marker table in the **source** database, and the throwaway restore target is always a brand-new, disposable database name.

## 5. Communicating a restore-in-progress incident

1. **Immediately** (before the restore starts): engineering lead notified per §2; a maintenance-mode response should be considered for the affected restaurant(s)' public site/ordering flow if the restore is expected to take more than a few minutes, so customers see a clear "temporarily unavailable" message rather than confusing errors or a half-restored state.
2. **During**: one person owns status updates; a running incident log (start time, what triggered it, current step) is kept so the post-incident writeup doesn't rely on memory.
3. **To affected restaurants**: a direct message (email/SMS, whichever channel is already used for platform notices) explaining what happened in plain terms, the affected time window, and — critically — whether any orders placed in that window need manual reconciliation (a restore to a point before an order was placed means that order's data is gone from the restored database and must be manually re-entered or refunded, whichever is correct for that order's actual fulfillment state).
4. **After**: a post-incident writeup covering root cause, the actual RTO/RPO achieved versus the targets in §3, and any runbook update this incident revealed was needed — the same discipline this master spec applies to every phase's own verification.

## 6. Re-running the drill going forward

The master spec's own Verification section is explicit that this is not a one-time checkbox: **"Re-run it periodically (recommend quarterly) as an ongoing practice, not a one-time checkbox — a drill that was only ever run once, a year ago, provides limited confidence about today's restore procedure."** Recommended cadence: quarterly at minimum, and immediately after any change to the production schema's shape that could plausibly affect restore mechanics (a new extension, a partitioned table, etc.) or any change to the hosting provider/backup configuration itself.

## 7. Known limitations

- No live managed-provider snapshot restore has been exercised in this sandbox (no externally reachable provider account here) — the drill's local-Postgres run (§4) verifies the *mechanics* (dump/restore/boot/verify/teardown) exhaustively, but the provider-specific snapshot-restore UI/API flow itself should be dry-run once against a real staging project before this is considered fully verified end-to-end in production, consistent with every prior phase's "cannot be exercised end-to-end in this sandbox" limitation.
- Object-storage versioning/lifecycle rules (§1.2) are documented but not exercised here either, for the same reason (no live cloud bucket in this sandbox) — Phase 7's own completion report already flags the equivalent limitation for that phase's S3 implementation.
- RTO/RPO targets (§3) are initial estimates, not measured against a real production-scale restore. Phase 11's load testing informs capacity planning but does not itself validate restore timing at scale — that's a distinct exercise to run against a production-sized database once one exists.
