#!/bin/sh
# Production Hardening Phase 11 — orchestrates a full load-test run
# against a throwaway database (same pattern as scripts/restore-drill.sh):
# create a fresh database, apply the real migration history, boot one or
# two compiled server instances against it, seed checkout-ready data,
# drive real HTTP load at the checkout hot path, sample Postgres
# connection counts throughout, verify no double-processing occurred,
# then tear everything down.
#
# Usage:
#   ./load-tests/run-load-test.sh <restaurants> <carts-per-restaurant> [instances]
#
# Examples:
#   ./load-tests/run-load-test.sh 10 50 1     # ~10-restaurant scenario, single instance
#   ./load-tests/run-load-test.sh 100 20 1    # ~100-restaurant scenario, single instance
#   ./load-tests/run-load-test.sh 100 20 2    # same volume, 2 instances sharing Postgres/Redis
#
# Requires: pg_dump-free (uses `psql`/`prisma migrate deploy` only), a
# compiled apps/api (pnpm --filter api run build), tsx (apps/api's own
# devDependency) and autocannon (root devDependency, already installed
# for this phase). Never run against a database anyone else is using --
# a brand-new throwaway database is always created for this.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
RESTAURANT_COUNT="${1:-10}"
CARTS_PER_RESTAURANT="${2:-50}"
INSTANCES="${3:-1}"
RUN_ID="load_test_$(date +%s)"
BASE_PORT=4100

SERVER_PIDS=""
SAMPLER_PID=""

log() { printf '[load-test] %s\n' "$1"; }
fail() { printf '[load-test] FAILED: %s\n' "$1" >&2; exit 1; }

cleanup() {
  for pid in $SERVER_PIDS; do
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
  if [ -n "$SAMPLER_PID" ]; then
    kill "$SAMPLER_PID" 2>/dev/null || true
    wait "$SAMPLER_PID" 2>/dev/null || true
  fi
  if [ -n "${MAINTENANCE_DB_URL:-}" ]; then
    log "Dropping throwaway database $DRILL_DB_NAME"
    psql "$MAINTENANCE_DB_URL" -v ON_ERROR_STOP=0 -c "DROP DATABASE IF EXISTS \"${DRILL_DB_NAME}\";" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [ -z "${DATABASE_URL:-}" ] && [ -f "$API_DIR/.env" ]; then
  # shellcheck disable=SC1090
  . "$API_DIR/.env"
fi
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set (export it, or set it in apps/api/.env)"
[ -f "$API_DIR/dist/src/index.js" ] || fail "apps/api is not built — run 'pnpm --filter api run build' first"

ORIGINAL_DATABASE_URL_PSQL=$(printf '%s' "$DATABASE_URL" | sed -E 's/\?.*$//')
DRILL_DB_NAME="ordervora_${RUN_ID}"
DRILL_DB_URL=$(printf '%s' "$DATABASE_URL" | sed -E "s#(postgresql://[^/]+)/[^?]+(\?.*)?#\1/${DRILL_DB_NAME}\2#")
DRILL_DB_URL_PSQL=$(printf '%s' "$ORIGINAL_DATABASE_URL_PSQL" | sed -E "s#(postgresql://[^/]+)/.+#\1/${DRILL_DB_NAME}#")
MAINTENANCE_DB_URL=$(printf '%s' "$ORIGINAL_DATABASE_URL_PSQL" | sed -E "s#(postgresql://[^/]+)/.+#\1/postgres#")
DB_NAME_FOR_SAMPLING="$DRILL_DB_NAME"

log "Scenario: ${RESTAURANT_COUNT} restaurants x ${CARTS_PER_RESTAURANT} carts each, ${INSTANCES} server instance(s)"

log "Creating throwaway database $DRILL_DB_NAME"
psql "$MAINTENANCE_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DRILL_DB_NAME}\";" >/dev/null

log "Applying migration history to the throwaway database"
(cd "$API_DIR" && DATABASE_URL="$DRILL_DB_URL" pnpm exec prisma migrate deploy) >/dev/null

log "Seeding checkout-ready data (RESTAURANT_COUNT=${RESTAURANT_COUNT}, CARTS_PER_RESTAURANT=${CARTS_PER_RESTAURANT})"
(cd "$API_DIR" && DATABASE_URL="$DRILL_DB_URL" RESTAURANT_COUNT="$RESTAURANT_COUNT" CARTS_PER_RESTAURANT="$CARTS_PER_RESTAURANT" \
  pnpm exec tsx "$REPO_ROOT/load-tests/seed-load-test-data.ts")

TOTAL_CARTS=$((RESTAURANT_COUNT * CARTS_PER_RESTAURANT))
CARTS_PER_INSTANCE=$((TOTAL_CARTS / INSTANCES))

log "Booting ${INSTANCES} server instance(s) against the throwaway database"
i=0
while [ "$i" -lt "$INSTANCES" ]; do
  PORT=$((BASE_PORT + i))
  (
    cd "$API_DIR"
    DATABASE_URL="$DRILL_DB_URL" PORT="$PORT" LOG_LEVEL="${LOAD_TEST_LOG_LEVEL:-error}" node dist/src/index.js \
      > "/tmp/${RUN_ID}.server${i}.log" 2>&1 &
    echo $! > "/tmp/${RUN_ID}.server${i}.pid"
  )
  SERVER_PIDS="$SERVER_PIDS $(cat "/tmp/${RUN_ID}.server${i}.pid")"
  i=$((i + 1))
done

i=0
while [ "$i" -lt "$INSTANCES" ]; do
  PORT=$((BASE_PORT + i))
  ATTEMPTS=0
  until curl -fs "http://localhost:${PORT}/ready" >/dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    [ "$ATTEMPTS" -le 30 ] || fail "instance $i never became ready (see /tmp/${RUN_ID}.server${i}.log)"
    sleep 1
  done
  i=$((i + 1))
done
log "All instances ready"

log "Starting Postgres connection-count sampler (samples every 0.5s)"
SAMPLE_FILE="/tmp/${RUN_ID}.pg-connections.txt"
(
  while true; do
    psql "$MAINTENANCE_DB_URL" -t -A -c \
      "SELECT count(*) FROM pg_stat_activity WHERE datname = '${DB_NAME_FOR_SAMPLING}';" >> "$SAMPLE_FILE" 2>/dev/null
    sleep 0.5
  done
) &
SAMPLER_PID=$!

log "Running load test"
RESULTS_DIR="/tmp/${RUN_ID}.results"
mkdir -p "$RESULTS_DIR"
i=0
LOAD_PIDS=""
while [ "$i" -lt "$INSTANCES" ]; do
  PORT=$((BASE_PORT + i))
  OFFSET=$((i * CARTS_PER_INSTANCE))
  (
    cd "$REPO_ROOT/load-tests"
    BASE_URL="http://localhost:${PORT}" MANIFEST_OFFSET="$OFFSET" MANIFEST_COUNT="$CARTS_PER_INSTANCE" \
      CONNECTIONS="${CONNECTIONS:-20}" RESULTS_PATH="${RESULTS_DIR}/instance${i}.json" \
      node checkout-load-test.mjs > "${RESULTS_DIR}/instance${i}.stdout.log" 2>&1
  ) &
  LOAD_PIDS="$LOAD_PIDS $!"
  i=$((i + 1))
done
for pid in $LOAD_PIDS; do
  wait "$pid" || fail "a load-test instance process failed — see ${RESULTS_DIR}"
done

kill "$SAMPLER_PID" 2>/dev/null || true
wait "$SAMPLER_PID" 2>/dev/null || true
SAMPLER_PID=""
PEAK_CONNECTIONS=$(sort -n "$SAMPLE_FILE" 2>/dev/null | tail -1)
log "Peak Postgres connections observed against the throwaway database: ${PEAK_CONNECTIONS:-unknown}"

log "Waiting for the outbox worker to drain (up to 15s, polling every second)"
WAIT=0
while [ "$WAIT" -lt 15 ]; do
  REMAINING=$(psql "$DRILL_DB_URL_PSQL" -t -A -c "SELECT count(*) FROM \"OutboxEvent\" WHERE \"processedAt\" IS NULL;")
  [ "$REMAINING" = "0" ] && break
  sleep 1
  WAIT=$((WAIT + 1))
done

log "Verifying no double-processing: order count vs. requests sent"
ORDER_COUNT=$(psql "$DRILL_DB_URL_PSQL" -t -A -c "SELECT count(*) FROM \"Order\";")
OUTBOX_UNPROCESSED=$(psql "$DRILL_DB_URL_PSQL" -t -A -c "SELECT count(*) FROM \"OutboxEvent\" WHERE \"processedAt\" IS NULL;")
log "Orders created: ${ORDER_COUNT} (expected: ${TOTAL_CARTS}); unprocessed OutboxEvent rows remaining after drain wait: ${OUTBOX_UNPROCESSED}"

log "Results written to ${RESULTS_DIR}/instance*.json"
log "Load test run complete."
