# Production Hardening Phase 4 — multi-stage build for apps/web.
#
# Build context is the monorepo root (see docker-compose.yml), same
# reasoning as apps/api/Dockerfile: this is a pnpm workspace, so apps/web's
# dependencies resolve against the root lockfile.
ARG NODE_VERSION=22.22.2

# ---- fetch ------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS fetch
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# ---- build --------------------------------------------------------------
# `next build` with output:"standalone" (next.config.ts) traces every
# page's actual runtime dependencies and emits a self-contained
# .next/standalone/ — a pruned node_modules plus a minimal server.js —
# so the runtime stage below never needs pnpm or the full dependency tree.
# outputFileTracingRoot (next.config.ts) points tracing at the monorepo
# root, since apps/web's own dependencies are hoisted there, not into
# apps/web/node_modules.
FROM fetch AS build
# API_HOST/API_URL_SCHEME let a host-only value (e.g. Render's fromService,
# which exposes a bare host with no scheme) be assembled into the full URL
# next.config.ts bakes into the standalone build's rewrite manifest at
# `next build` time — process.env.API_URL alone is not enough here because
# a plain runtime env var (docker-compose's approach) has no effect on
# next.config.ts, which only ever reads it once, during this build.
ARG API_URL_SCHEME=http
ARG API_HOST=localhost:4000
COPY pnpm-workspace.yaml package.json ./
COPY apps/web ./apps/web
RUN pnpm install --offline --frozen-lockfile --filter web...
RUN API_URL="${API_URL_SCHEME}://${API_HOST}" pnpm --filter web run build

# ---- runtime --------------------------------------------------------------
# next build's standalone output does not include public/ or .next/static
# by design (Next.js's own docs recommend serving those from a CDN) — this
# project has no CDN yet, so they're copied in manually here, same as any
# non-CDN standalone deployment would need to.
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY apps/web/scripts/start.sh ./apps/web/scripts/start.sh

RUN chmod +x ./apps/web/scripts/start.sh && chown -R node:node /app

# Immutable/non-root — see apps/api/Dockerfile's equivalent note; the
# standalone output ships no package manager and no application source,
# only the traced server.js + pruned node_modules.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('node:http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/',timeout:3000},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["./apps/web/scripts/start.sh"]
