#!/bin/sh
# Production startup entrypoint (Production Hardening Phase 4). Runs the
# Next.js standalone server (next.config.ts's output:"standalone") directly
# via node rather than `next start` or `pnpm start` — same signal-forwarding
# reasoning as apps/api/scripts/start.sh: `exec` makes node PID 1 so the
# container receives SIGTERM directly instead of it being swallowed by an
# npm/pnpm wrapper process.
set -e
exec node apps/web/server.js
