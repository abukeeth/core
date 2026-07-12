#!/bin/sh
# Production Hardening Phase 10 — restore drill.
#
# "Actually execute a restore drill: restore the latest backup into a
# throwaway database, boot the app against it, confirm data integrity and
# correct startup. This must happen at least once before backups are
# considered 'working,' not just configured." (master spec Phase 10, work
# item 4 — this script IS that verification, not a stand-in for it.)
#
# What it does, against the database DATABASE_URL already points at:
#   1. Writes one marker row into a dedicated drill table (proves the dump
#      captures whatever's really in the database — no dependency on any
#      seed script, demo or otherwise).
#   2. pg_dump's the database (plain SQL, --no-owner --no-acl: portable
#      across roles/hosts, the same property a managed provider's restore
#      onto a fresh instance needs).
#   3. Creates a throwaway database (via the `postgres` maintenance
#      database — more portable across environments than the createdb/
#      dropdb utilities, which don't uniformly accept a full connection
#      URI as their dbname argument) and restores the dump into it.
#   4. Boots the compiled server against the throwaway database
#      (a distinct DATABASE_URL, never the original) and polls /health and
#      /ready until both return success.
#   5. Confirms the marker row survived the round trip byte-for-byte.
#   6. Tears down: stops the booted server, drops the throwaway database
#      and the marker row from the original database, removes the dump
#      file.
#
# Exits non-zero (and still tears down what it can) on any step's failure
# — a restore drill that silently reports success on a partial restore
# would be worse than not running one at all.
#
# Usage: DATABASE_URL=postgresql://... ./scripts/restore-drill.sh
# Requires: pg_dump, psql (any recent PostgreSQL client tools), a compiled
# apps/api (pnpm --filter api run build), and the same core env vars
# apps/api/.env.example documents (this script sources apps/api/.env if
# present and DATABASE_URL isn't already exported).

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
DRILL_ID="restore_drill_$(date +%s)"
DUMP_FILE="/tmp/${DRILL_ID}.sql"
SERVER_PORT=4099
SERVER_PID=""

log() { printf '[restore-drill] %s\n' "$1"; }
fail() { printf '[restore-drill] FAILED: %s\n' "$1" >&2; exit 1; }

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    log "Stopping drill server (pid $SERVER_PID)"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "${MAINTENANCE_DB_URL:-}" ]; then
    log "Dropping throwaway database $DRILL_DB_NAME"
    psql "$MAINTENANCE_DB_URL" -v ON_ERROR_STOP=0 -c \
      "DROP DATABASE IF EXISTS \"${DRILL_DB_NAME}\";" >/dev/null 2>&1 || true
  fi
  if [ -n "${ORIGINAL_DATABASE_URL_PSQL:-}" ]; then
    log "Removing marker table from the original database"
    psql "$ORIGINAL_DATABASE_URL_PSQL" -v ON_ERROR_STOP=0 -c \
      "DROP TABLE IF EXISTS _restore_drill_marker;" >/dev/null 2>&1 || true
  fi
  rm -f "$DUMP_FILE" "/tmp/${DRILL_ID}.pid" "/tmp/${DRILL_ID}.server.log"
}
trap cleanup EXIT

if [ -z "${DATABASE_URL:-}" ] && [ -f "$API_DIR/.env" ]; then
  # shellcheck disable=SC1090
  . "$API_DIR/.env"
fi
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set (export it, or set it in apps/api/.env)"

# psql/pg_dump speak libpq, not Prisma's connection-string dialect — a
# `?schema=public` suffix (Prisma-only, meaningless to psql/pg_dump) is
# stripped for every direct-psql/pg_dump use below. The *app* still gets
# the original, unmodified DATABASE_URL when booted against the restored
# database (Prisma needs it); only this script's own psql/pg_dump calls
# use the stripped variant.
ORIGINAL_DATABASE_URL="$DATABASE_URL"
ORIGINAL_DATABASE_URL_PSQL=$(printf '%s' "$ORIGINAL_DATABASE_URL" | sed -E 's/\?.*$//')
DRILL_DB_NAME="ordervora_${DRILL_ID}"
# Swap only the database name segment, keeping host/port/user/password intact.
DRILL_DB_URL_PSQL=$(printf '%s' "$ORIGINAL_DATABASE_URL_PSQL" | sed -E "s#(postgresql://[^/]+)/.+#\1/${DRILL_DB_NAME}#")
DRILL_DB_URL=$(printf '%s' "$ORIGINAL_DATABASE_URL" | sed -E "s#(postgresql://[^/]+)/[^?]+(\?.*)?#\1/${DRILL_DB_NAME}\2#")
MAINTENANCE_DB_URL=$(printf '%s' "$ORIGINAL_DATABASE_URL_PSQL" | sed -E "s#(postgresql://[^/]+)/.+#\1/postgres#")

log "Step 1/6: writing a marker row to the source database"
MARKER_VALUE="drill-$(date -u +%Y%m%dT%H%M%SZ)"
psql "$ORIGINAL_DATABASE_URL_PSQL" -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE IF NOT EXISTS _restore_drill_marker (id serial PRIMARY KEY, value text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());" >/dev/null
psql "$ORIGINAL_DATABASE_URL_PSQL" -v ON_ERROR_STOP=1 -c \
  "INSERT INTO _restore_drill_marker (value) VALUES ('${MARKER_VALUE}');" >/dev/null

log "Step 2/6: pg_dump of the source database -> $DUMP_FILE"
pg_dump --no-owner --no-acl "$ORIGINAL_DATABASE_URL_PSQL" > "$DUMP_FILE" \
  || fail "pg_dump failed"
[ -s "$DUMP_FILE" ] || fail "pg_dump produced an empty file"

log "Step 3/6: creating throwaway database $DRILL_DB_NAME and restoring into it"
psql "$MAINTENANCE_DB_URL" -v ON_ERROR_STOP=1 -c \
  "CREATE DATABASE \"${DRILL_DB_NAME}\";" >/dev/null || fail "CREATE DATABASE failed"
psql "$DRILL_DB_URL_PSQL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE" >/dev/null \
  || fail "restore into throwaway database failed"

log "Step 4/6: booting the compiled server against the throwaway database"
[ -f "$API_DIR/dist/src/index.js" ] || fail "apps/api is not built — run 'pnpm --filter api run build' first"
(
  cd "$API_DIR"
  DATABASE_URL="$DRILL_DB_URL" PORT="$SERVER_PORT" node dist/src/index.js \
    > "/tmp/${DRILL_ID}.server.log" 2>&1 &
  echo $! > "/tmp/${DRILL_ID}.pid"
)
SERVER_PID=$(cat "/tmp/${DRILL_ID}.pid")

ATTEMPTS=0
until curl -fs "http://localhost:${SERVER_PORT}/ready" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -gt 30 ]; then
    fail "server never became ready against the restored database (see /tmp/${DRILL_ID}.server.log)"
  fi
  sleep 1
done
curl -fs "http://localhost:${SERVER_PORT}/health" >/dev/null || fail "/health did not return success against the restored database"
log "  /health and /ready both succeeded against the restored database"

log "Step 5/6: confirming the marker row survived the restore byte-for-byte"
RESTORED_VALUE=$(psql "$DRILL_DB_URL_PSQL" -t -A -c \
  "SELECT value FROM _restore_drill_marker WHERE value = '${MARKER_VALUE}';")
[ "$RESTORED_VALUE" = "$MARKER_VALUE" ] || fail "marker row did not survive the restore (expected '${MARKER_VALUE}', got '${RESTORED_VALUE}')"
log "  Marker row round-tripped correctly: ${RESTORED_VALUE}"

log "Step 6/6: tearing down (server, throwaway database, dump file, marker row)"

log "Restore drill PASSED."
