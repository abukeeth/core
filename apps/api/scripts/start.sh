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

# Migrations + the idempotent beta seed run here, inside the container's
# own startup, rather than depending on a platform-specific pre-deploy hook
# (Render's preDeployCommand and similar). Not every Docker host has that
# concept (Koyeb, Fly.io, and plain `docker run` don't), so keeping this in
# the image itself means the exact same image works identically everywhere
# without any host-specific config. `prisma migrate deploy` and
# seed-if-empty.js are both explicitly safe to run on every container
# start, including restarts and scale-ups, not just the first.
./node_modules/.bin/prisma migrate deploy
node dist/scripts/seed-if-empty.js

exec node dist/src/index.js
