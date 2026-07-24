#!/bin/sh
# OrderVora — on-demand PostgreSQL backup.
#
# Produces a single restorable artifact from the database DATABASE_URL points
# at, using pg_dump's custom format (-Fc): compressed, and restorable with
# pg_restore onto a fresh instance of any recent PostgreSQL. This is the manual
# counterpart to a managed provider's automated daily snapshots
# (docs/runbooks/disaster-recovery.md §1.1) — use it before a risky migration
# or data fix, or to seed a staging environment. It does NOT replace automated
# provider backups; it complements them.
#
# --no-owner --no-acl make the dump portable across roles/hosts (the same
# property a restore onto a fresh managed instance needs). The dump is verified
# to be a readable archive (pg_restore -l) before this script reports success —
# a backup file that was never confirmed readable is not a verified backup.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/backup-database.sh [OUTPUT_FILE]
# Default OUTPUT_FILE: ./backups/ordervora-<UTC-timestamp>.dump
# Requires: pg_dump, pg_restore (PostgreSQL client tools). Falls back to
# sourcing apps/api/.env for DATABASE_URL if it isn't already exported.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"

log() { printf '[backup] %s\n' "$1"; }
fail() { printf '[backup] FAILED: %s\n' "$1" >&2; exit 1; }

if [ -z "${DATABASE_URL:-}" ] && [ -f "$API_DIR/.env" ]; then
  # shellcheck disable=SC1090
  . "$API_DIR/.env"
fi
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set (export it, or set it in apps/api/.env)"

# pg_dump speaks libpq, not Prisma's connection-string dialect — strip a
# Prisma-only "?schema=public" suffix that libpq wouldn't understand.
DB_URL_PSQL=$(printf '%s' "$DATABASE_URL" | sed -E 's/\?.*$//')

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUTPUT_FILE="${1:-$REPO_ROOT/backups/ordervora-${TIMESTAMP}.dump}"
mkdir -p "$(dirname "$OUTPUT_FILE")"

log "Dumping database -> $OUTPUT_FILE"
pg_dump -Fc --no-owner --no-acl "$DB_URL_PSQL" -f "$OUTPUT_FILE" || fail "pg_dump failed"
[ -s "$OUTPUT_FILE" ] || fail "pg_dump produced an empty file"

# Confirm the artifact is a readable custom-format archive, not a truncated or
# corrupt file — the listing also doubles as a quick manifest of what's inside.
TABLE_COUNT=$(pg_restore -l "$OUTPUT_FILE" 2>/dev/null | grep -c 'TABLE DATA' || true)
[ "${TABLE_COUNT:-0}" -gt 0 ] || fail "the dump is not a readable archive (pg_restore -l found no table data)"

SIZE=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')
log "Backup OK: $OUTPUT_FILE (${SIZE} bytes, ${TABLE_COUNT} tables with data)"
log "Restore with: pg_restore --no-owner --no-acl -d <fresh-database-url> \"$OUTPUT_FILE\""
log "Verify a restore end-to-end with: ./scripts/restore-drill.sh"
