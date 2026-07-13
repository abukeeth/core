#!/bin/sh
# Production startup entrypoint (Production Hardening Phase 4).
#
# Deliberately execs node directly rather than being invoked via
# `pnpm start`/`npm start`: npm/pnpm's process wrapper does not reliably
# forward SIGTERM to its child, which would silently defeat the graceful-
# shutdown handling in src/index.ts (server.close() + Prisma disconnect on
# SIGTERM) and turn every rolling deploy into a hard kill instead of a
# drain. `exec` replaces this shell process with node in place (same PID),
# so the container's PID 1 is node itself and orchestrator signals reach
# it directly.
set -e

# Migrations run here by default, inside the container's own startup,
# rather than depending on a platform-specific pre-deploy hook (Render's
# preDeployCommand and similar). Not every Docker host has that concept
# (Koyeb, Fly.io, and plain `docker run` don't), so this default keeps the
# exact same image working identically everywhere without any host-
# specific config. `prisma migrate deploy` is explicitly safe to run on
# every container start, including restarts and scale-ups, not just the
# first.
#
# SKIP_STARTUP_MIGRATIONS=true is an opt-in for hosts that DO have a real
# pre-deploy hook wired up and confirmed working (e.g. Render's
# preDeployCommand on a paid plan, set in render.yaml) — the whole point
# being to get the (idle-sleep-compounding, on Render's free tier) DB
# round-trip off the hot boot path for every restart, not just deploys.
# Left unset by default so this image's behavior is unchanged everywhere
# it's already running; only flip it on a host where the pre-deploy hook
# has actually been verified to apply migrations, never speculatively —
# if it's set but nothing upstream really ran the migration, `prisma
# migrate status`'s non-zero exit (still under `set -e` above) refuses to
# boot rather than silently serving traffic against a stale schema.
if [ "$SKIP_STARTUP_MIGRATIONS" = "true" ]; then
  ./node_modules/.bin/prisma migrate status
else
  ./node_modules/.bin/prisma migrate deploy
fi

# The idempotent beta seed is unaffected by the above — always safe and
# cheap to run on every start regardless of where migrations happened.
node dist/scripts/seed-if-empty.js

exec node dist/src/index.js
