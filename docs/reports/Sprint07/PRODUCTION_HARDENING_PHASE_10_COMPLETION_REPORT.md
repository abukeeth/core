# Production Hardening Phase 10 — Completion Report

**Backups & Disaster Recovery**

Implemented per `docs/reports/Sprint07/PRODUCTION_HARDENING_MASTER_SPEC.md`, Phase 10. Depends on Phase 1 (production PostgreSQL) and Phase 7 (object storage), both already in place. Objective: ensure the production database and object-storage bucket are backed up and **restorable** — "configured backups that have never been restored are not verified backups."

## 1. What was done

### 1.1 `scripts/restore-drill.sh` — the verification, not a stand-in for it

The master spec's work item 4 ("actually execute a restore drill... this must happen at least once before backups are considered 'working'") is implemented as a reusable, re-runnable script rather than a one-time manual exercise: writes a marker row into the source database, `pg_dump`s it, creates a throwaway database, restores the dump, boots the **compiled** server (the same artifact a real deploy runs, not `tsx`/`ts-node`) against the throwaway database, polls `/health`/`/ready` until both succeed, confirms the marker row round-tripped byte-for-byte, then tears everything down (drill server, throwaway database, marker row, dump file) — leaving no trace behind.

### 1.2 Actually executed, twice, in this environment

This sandbox has no externally reachable managed-Postgres provider, so the drill ran against this environment's real local PostgreSQL 16 instance — the same one Phase 1's migration work was verified against. Run twice back-to-back to confirm repeatability: both passed, full cycle (dump → restore → boot → verify → teardown) completed in under 15 seconds, and `\l`/`\dt` confirmed clean teardown afterward (no leftover throwaway database, no leftover marker table, no leftover `/tmp` dump file). Full captured output is in `docs/runbooks/disaster-recovery.md` §4.

### 1.3 `docs/runbooks/disaster-recovery.md`

Access list (roles who can trigger a restore / must be notified), RTO/RPO targets (≤5 min RPO with PITR active, ≤1 hour RTO for a database restore — both explained against this platform's actual current single-primary architecture, not an aspirational multi-region one), the restore-drill record (§1.2 above), a re-run cadence recommendation (quarterly, per the master spec's own explicit instruction that a drill run once "a year ago" provides limited confidence about today's procedure), and a restore-in-progress communication plan for affected restaurants (what to tell them, and specifically that an order placed inside a restored-over time window may need manual reconciliation).

### 1.4 Provider-configuration guidance (not code — documented, per the master spec's own "mostly infrastructure/provider configuration, not repository code" framing)

- **Postgres** (`database-setup.md` already lists provider candidates): automated daily backups (7–30 day retention) + PITR where the provider supports it (Neon, Supabase, and RDS all do) — PITR specifically because the realistic incident here is "a bad migration/script ran a few minutes ago," where a daily snapshot alone only rolls back to last night.
- **Object storage** (Phase 7's bucket): versioning + a lifecycle rule expiring noncurrent versions after 30–90 days, so an accidental overwrite/delete of published-site assets is recoverable without unbounded storage cost growth.

## 2. Files changed

**New:**
- `scripts/restore-drill.sh` — repo-root (not `apps/api/scripts/`, matching the master spec's own affected-files listing exactly, since this is an ops/infra script rather than application code tied to `apps/api`'s TypeScript build).
- `docs/runbooks/disaster-recovery.md`
- `docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_10_COMPLETION_REPORT.md` (this file)

**Modified:** none. This phase is deliberately code-neutral in `apps/api`/`apps/web` — the master spec's own "Affected files" list for Phase 10 says so explicitly ("Mostly infrastructure/provider configuration, not repository code"), and no application behavior needed to change to make backups restorable.

## 3. Verification

| Check | Result |
|---|---|
| `prisma validate` | ✅ Pass (schema unchanged) |
| `prisma generate` | ✅ Pass |
| `pnpm run lint` (root, both apps) | ✅ Pass, no warnings |
| `pnpm run typecheck` (root, both apps) | ✅ Pass |
| `pnpm run test` (root, both apps) | ✅ **919/919 passing + 2 Phase-6 integration tests skipped by default** (unchanged from Phase 9 — this phase added no application code, so no new unit tests were needed; the verification *is* the drill itself, per the master spec's own framing) |
| `pnpm run build` (root, both apps) | ✅ Pass |

**The restore drill itself (master spec Phase 10's stated Verification: "the restore drill... IS the verification")**: executed twice, both passed — see §1.2 and `docs/runbooks/disaster-recovery.md` §4 for full captured output.

## 4. Known limitations

- No live managed-provider snapshot restore has been exercised (no externally reachable provider account in this sandbox) — the drill's local-Postgres run verifies the *mechanics* exhaustively (dump/restore/boot/verify/teardown against the real compiled server), but the provider-specific snapshot-restore UI/API flow itself should be dry-run once against a real staging project before this is considered fully verified end-to-end in production. Consistent with every prior phase's equivalent "cannot be exercised end-to-end in this sandbox" limitation (Docker Hub blocks for Phases 4/5/7, no live cloud object storage for Phase 7, no live Sentry DSN for Phase 9).
- Object-storage versioning/lifecycle rules are documented but not exercised against a live bucket, for the same reason.
- RTO/RPO targets are initial estimates against this platform's current architecture (single primary database, no read replica), not measured against a production-scale restore — Phase 11's load testing informs capacity planning but does not itself validate restore timing at scale.

---

*Phase 10 complete. Proceeding to Phase 11 (Scaling Strategy & Load Validation) per instruction.*
