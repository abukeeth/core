# Production Hardening Phase 4 — multi-stage build for apps/api.
#
# Build context is the monorepo root (see docker-compose.yml's
# `context: .` / `dockerfile: apps/api/Dockerfile`), because this is a
# pnpm workspace: apps/api's dependencies are resolved and hoisted against
# the root pnpm-lock.yaml, so the lockfile and workspace manifest must be
# in the build context alongside apps/api's own source.
#
# Version pinned to this project's actual Node 22 release (not the
# floating `node:22-alpine` tag) so a rebuild next month can't silently
# change the runtime underneath a previously-tested image.
ARG NODE_VERSION=22.22.2

# ---- fetch ------------------------------------------------------------
# Populates pnpm's content-addressable store from the lockfile alone. This
# is the expensive, network-bound layer; keeping it isolated to a COPY of
# only pnpm-lock.yaml means it stays cached across rebuilds triggered by
# application source changes, and only invalidates when a dependency
# actually changes.
FROM node:${NODE_VERSION}-alpine AS fetch
ENV CI=true
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# ---- build ----------------------------------------------------------------
# A full install (including devDependencies — tsc, the compiler, needs
# them) to compile TypeScript to dist/. `prisma generate` also runs here
# so type-checking sees the generated Prisma Client types, but this
# stage's node_modules is NOT what ships in the runtime image — see the
# prod-deps stage below for why.
FROM fetch AS build
# prisma.config.ts resolves DATABASE_URL while the Prisma CLI loads the
# config, even for `prisma generate` (which does not connect to the DB).
# Render runtime env vars are not available inside Docker build stages, so
# provide a non-secret syntactically valid placeholder only for generation.
# The real DATABASE_URL is still required at runtime and is supplied by
# Render's environment configuration.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter api...
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter api run build

# ---- prod-deps --------------------------------------------------------------
# A second, independent --prod install, rather than pruning the build
# stage's node_modules: pnpm's workspace-aware `prune` operates on the
# *whole* workspace relative to the repo-root package.json, not a single
# filtered package, and deletes apps/api's node_modules entirely instead of
# reducing it to prod-only (confirmed against this exact lockfile before
# writing this Dockerfile) — a plain `--prod` install is the correct tool.
# `prisma generate` runs a second time here for the same reason it must
# run in `build`: the generated client lives beside wherever
# `@prisma/client` resolves to *in this store*, and this is a distinct
# install from the one above. This only works because `prisma` (the CLI)
# is a regular dependency of apps/api, not a devDependency — moved
# deliberately (Production Hardening Phase 4) so `prisma generate` /
# `prisma migrate deploy` are available wherever only production
# dependencies are installed.
FROM fetch AS prod-deps
# Same build-only placeholder as the build stage above. It is not copied as
# an ENV setting into the runtime stage.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY apps/api/scripts ./apps/api/scripts
RUN pnpm install --frozen-lockfile --filter api... --prod
RUN pnpm --filter api exec prisma generate

# ---- runtime --------------------------------------------------------------
# Slim, immutable runtime image: no pnpm/corepack, no TypeScript/ESLint/
# Vitest toolchain, no application source (only compiled dist/) — just the
# production node_modules (with the CLI-generated Prisma Client already
# baked in) and what's needed to run.
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY apps/api/scripts/start.sh ./apps/api/scripts/start.sh

RUN chmod +x ./apps/api/scripts/start.sh && chown -R node:node /app

# Immutable/non-root (Production Hardening Phase 4): runs as the
# unprivileged `node` user baked into the official image, not root — the
# image ships no package manager and no application source to modify, so
# there is nothing meaningful a compromised process could rewrite even
# with a writable filesystem, but this is additionally paired with
# `read_only: true` + a tmpfs for /tmp at the orchestrator level (see
# docker-compose.yml and docs/runbooks/deployment-architecture.md).
USER node
WORKDIR /app/apps/api

EXPOSE 4000

# Liveness probe backed by GET /health (app.ts) — a container stuck in an
# unrecoverable state (e.g. the event loop wedged) fails this and gets
# restarted by the orchestrator. Deliberately checks /health, not /ready:
# a container that's alive but waiting on the database should be restarted
# far less aggressively than one that's simply not ready yet (that's what
# /ready + the orchestrator's readiness gate is for, not HEALTHCHECK).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('node:http').get({host:'127.0.0.1',port:process.env.PORT||4000,path:'/health',timeout:3000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["./scripts/start.sh"]
