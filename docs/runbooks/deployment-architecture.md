# Deployment Architecture

Part of Production Hardening Phase 4 (`PRODUCTION_HARDENING_MASTER_SPEC.md`). Covers the Dockerfiles, `docker-compose.yml`, health/readiness semantics, graceful shutdown, immutability measures, and the zero-downtime rollout contract. Builds directly on Phase 1 (migrations), Phase 2 (CI/CD pipeline shape), and Phase 3 (centralized config/secrets) — this phase is what those three actually run inside.

## Overview

Two Dockerfiles, one `docker-compose.yml`:

- `apps/api/Dockerfile` — three-stage build (`fetch` → `build` → `prod-deps` → `runtime`, four stages total) producing a slim, non-root runtime image running the compiled `dist/src/index.js`.
- `apps/web/Dockerfile` — two-stage build (`fetch` → `build` → `runtime`) using Next.js's `output: "standalone"` mode (`next.config.ts`), producing a self-contained `server.js` + pruned `node_modules`.
- `docker-compose.yml` — local production simulation: Postgres + api + web, wired with the same health-gating a real rolling deploy uses (`depends_on: condition: service_healthy`).

Both Dockerfiles use the monorepo root as their build context (`context: .` in `docker-compose.yml`), because this is a pnpm workspace — apps/api's and apps/web's dependencies resolve against the single root `pnpm-lock.yaml`, not an isolated per-app lockfile.

## Why apps/api needs four stages, not two

The naive approach — one install with `devDependencies`, then `pnpm prune --prod` to shed them before the runtime `COPY` — does not work in this pnpm workspace. `pnpm prune` operates relative to the **root** `package.json` in a workspace, not a single filtered package: running it after a `--filter api...` install deletes apps/api's `node_modules` entirely instead of reducing it to production-only (verified directly against this repo's lockfile before writing this Dockerfile — see the Dockerfile's own comment on the `prod-deps` stage).

The actual structure:

1. **`fetch`** — populates pnpm's content-addressable store from `pnpm-lock.yaml` alone. Cached until a dependency actually changes; unaffected by application source edits.
2. **`build`** — a full `--filter api...` install (with `devDependencies`, since `tsc` needs the TypeScript compiler and `prisma generate` needs the `prisma` CLI), then `prisma generate`, then `tsc` to `dist/`.
3. **`prod-deps`** — a **second, independent** `--filter api... --prod` install from the same lockfile, followed by its own `prisma generate` call. This only works because `prisma` (the CLI) was moved from `devDependencies` to a regular `dependencies` entry in `apps/api/package.json` as part of this phase — a deliberate, common pattern specifically because `prisma generate` and `prisma migrate deploy` need to run in contexts where `devDependencies` aren't installed (a production container, a deploy pipeline step). Without that move, this stage would have no `prisma` CLI available and `prisma generate` would fail here.
4. **`runtime`** — copies `prod-deps`'s `node_modules` (production-only, with the CLI-generated Prisma Client already baked in) and `build`'s `dist/` — never the `build` stage's own `node_modules`, which still contains the full TypeScript/ESLint/Vitest toolchain.

Two independent `prisma generate` calls (one per install) is deliberate, not an oversight: the generated client physically lives beside wherever `@prisma/client` resolves to *within that specific install's virtual store*, and stage 3's install is a distinct resolution event from stage 2's.

## Why apps/web is simpler

Next.js's `output: "standalone"` (enabled in `next.config.ts`) does the equivalent work natively: `next build` traces every page's actual runtime dependencies via `@vercel/nft` and emits a self-contained `.next/standalone/` — a pre-pruned `node_modules` plus a minimal `server.js` — so there's no separate prod-deps install to reason about. `outputFileTracingRoot` is set to the monorepo root because apps/web's dependencies are hoisted there, not into `apps/web/node_modules` — without it, tracing would miss them and `server.js` would fail to start (this is a documented pnpm-monorepo caveat of the `output: "standalone"` feature, not a bug we hit and worked around).

`public/` and `.next/static` are **not** included in the standalone output by Next.js's own design (its docs recommend serving those from a CDN); since this project has no CDN yet, both are copied into the runtime image manually in the Dockerfile's final stage — the same thing any non-CDN standalone deployment needs to do.

## apps/web's deployment target: two real options

The master spec calls this out explicitly as a decision with real tradeoffs, not something to assume one way on. Both are viable for this project; neither is implemented as "the" answer here — `apps/web/Dockerfile` exists so the containerized option is available, but choosing between them is an infrastructure/cost decision, not a code one.

**Option A — containerize apps/web alongside apps/api (what this phase builds).** One deployment system to operate (one registry, one health-check contract, one rollout mechanism) instead of two. Simpler if the team doesn't want to reason about two different platforms. Downside: loses Vercel-specific Next.js optimizations (edge network, automatic image optimization, zero-config preview deployments per PR).

**Option B — deploy apps/web to Vercel, apps/api to a container host elsewhere.** Next.js is developed by Vercel and its platform-specific features (edge caching, image optimization, preview URLs) are strongest there. Downside: two deployment systems to operate, and `next.config.ts`'s `rewrites()` (which proxies `/api`, `/assets`, `/preview` to `API_URL`) needs `API_URL` to point at wherever apps/api actually ends up running, same as either option.

Recommendation if forced to pick one: **Option B (Vercel for web)** is usually the better default specifically *because* this is a Next.js app and Vercel is purpose-built for it — but this is a hosting-cost/operational-preference call for whoever owns the infrastructure budget, not a code-correctness one, so this phase intentionally leaves both paths open rather than deleting one.

## `/health` vs `/ready`

Two distinct endpoints (`apps/api/src/app.ts`), serving two distinct orchestration purposes:

- **`GET /health`** (liveness, pre-existing) — reports the process is up (`{ status: "ok", uptime, timestamp }`). Backs each container's `HEALTHCHECK` directive. A container that fails this repeatedly is *stuck* (e.g. event loop wedged) and should be restarted.
- **`GET /ready`** (readiness, new this phase) — runs `SELECT 1` against the database via Prisma; returns `200 { status: "ready" }` if it succeeds, `503 { status: "not ready" }` if it doesn't. This is what a load balancer/orchestrator should check before routing traffic to a new instance — a process can be alive (healthy) while its database connection is down or still establishing (not ready), especially in the first seconds after startup.

Verified directly (see Verification below): a real instance returns `200` from both endpoints against a live database, and `503` from `/ready` (while still returning `200` from `/health`) when pointed at an unreachable database.

## Security headers (`helmet`)

`app.ts` applies `helmet()` with a custom Content-Security-Policy rather than its stricter defaults. This is a deliberate accommodation, not an oversight: published restaurant sites (`modules/sites/renderer/render-page.ts`) embed an inline `<style>` block (`theme-css.ts`) and two inline `<script type="application/ld+json">` tags (`seo-head.ts`). CSP's `script-src`/`style-src` directives govern inline tags regardless of content type, and a nonce-based policy isn't viable here without breaking the renderer's own documented determinism guarantee ("same definition + theme version → identical output" — `publishSite` writes static HTML once, but a nonce is per-request-random). `'unsafe-inline'` is used for `script-src`/`style-src` specifically as the pragmatic tradeoff; `default-src`, `object-src`, `base-uri`, and `frame-ancestors` all stay strict (`'self'`/`'none'`). The renderer's actual XSS defense is (and already was) output escaping at generation time (`html-escape.ts`, `safeJsonLd`) — CSP here is additional defense-in-depth on top of that, not a replacement for it.

`crossOriginEmbedderPolicy` is explicitly disabled: this app's browser-facing architecture is entirely same-origin-via-proxy (`apps/web`'s `next.config.ts` rewrites every `/api`, `/assets`, `/preview` call server-side to apps/api — the browser never makes a cross-origin request to apps/api directly), so COEP provides no benefit here and risks unexpected breakage.

Verified directly: `curl -I` against a running instance shows `Content-Security-Policy`, `Strict-Transport-Security`, and `X-Frame-Options: SAMEORIGIN` present on every response.

## Graceful shutdown

`apps/api/src/index.ts` now handles `SIGTERM`/`SIGINT`: on receipt, it immediately stops both background schedulers (`clearInterval` on the outbox-worker and stale-offer-scheduler timers), then calls `server.close()` — which stops accepting *new* connections but lets in-flight requests finish — then disconnects Prisma's connection pool, then exits. A 10-second force-exit timer guards against a hang (a leaked connection preventing `server.close()`'s callback from ever firing) blocking an orchestrator's rollout indefinitely.

This matters specifically for zero-downtime rolling deploys: an orchestrator sends `SIGTERM` to an outgoing instance and expects it to drain gracefully, not drop in-flight requests. Verified directly: booting a compiled instance, sending `SIGTERM`, and confirming the log shows `"SIGTERM received, shutting down gracefully"` followed by a clean process exit (see Verification below).

**Startup scripts** (`apps/api/scripts/start.sh`, `apps/web/scripts/start.sh`) exist specifically to make this reliable in practice: each `exec`s `node` directly rather than being invoked via `pnpm start`/`npm start`. npm/pnpm's process wrapper does not reliably forward `SIGTERM` to its child, which would silently defeat this whole mechanism — `exec` replaces the shell process with `node` in place (same PID), so the container's PID 1 is `node` itself and the orchestrator's signal reaches it directly. `docker-compose.yml` additionally sets `init: true` per service, which runs `tini` as the true PID 1 ahead of the start script — correct zombie-process reaping plus correct signal forwarding, belt-and-suspenders.

## Immutability

- **Non-root**: both runtime images run as the unprivileged `node` user (built into the official Node images), not root.
- **No package manager, no build toolchain, no application source** in either runtime image — `apps/api`'s ships only compiled `dist/` + production `node_modules`; `apps/web`'s ships only the traced `server.js` + its pruned `node_modules`. Neither has `pnpm`/`corepack`/`tsc`/`vitest` present at all.
- **Pinned base image version** (`ARG NODE_VERSION=22.22.2`, not the floating `node:22-alpine` tag) — a rebuild next month can't silently change the runtime underneath a previously-tested image.
- **Read-only root filesystem**: `docker-compose.yml` sets `read_only: true` on both the `api` and `web` services, with a `tmpfs` mount for `/tmp` (cheap insurance for any dependency that expects a writable temp directory — none currently identified in this codebase's own source, but several native/WASM dependencies in the tree could plausibly want one) and a named volume specifically for `apps/api/uploads` (see below — the one genuinely necessary write path).

**The one real exception, and why it's there, not a gap**: `lib/file-storage.ts`/`lib/release-storage.ts` still write import uploads and published-site output to local disk (`apps/api/uploads/`). A read-only container filesystem would break this entirely, so `docker-compose.yml` mounts a named volume at exactly that path and nowhere else. This is already a documented, known limitation carried forward from earlier sprints — container filesystems are ephemeral by nature, and the master spec's own sequencing note is explicit that **Phase 7 (Object Storage Migration) must land with or before this phase's real production cutover**, replacing this local-disk volume with real object storage. Phase 4 does not attempt to solve that; it makes the current, honest tradeoff (a volume) rather than either pretending the problem doesn't exist or blocking on a phase this task was explicitly scoped not to touch ("Do not start Object Storage").

## The zero-downtime rollout contract

Per the master spec, a real rolling deploy against this architecture must follow:

1. `prisma migrate deploy` runs **once**, before any new instance starts — never per-instance (already how `docs/runbooks/database-setup.md` and the Phase 2 `deploy.yml` CD workflow are written).
2. Only backward-compatible (expand-then-contract) migrations are permitted in a rolling deploy — a migration that both old and new code can tolerate running simultaneously against.
3. New instances must pass `/ready` (this phase) before the load balancer sends them traffic.
4. Old instances drain in-flight requests (graceful shutdown, this phase) before terminating.

This phase provides the two new primitives (3) and (4) that a real orchestrator (whichever one is chosen — Fly.io, ECS, Kubernetes, Render, Railway, etc.) needs to actually implement this contract; wiring a specific orchestrator's health-check/rollout configuration to these endpoints is hosting-platform-specific and deliberately out of this phase's scope (no cloud infrastructure exists yet to configure).

## Usage

```bash
docker compose up --build
curl http://localhost:4000/health
curl http://localhost:4000/ready
open http://localhost:3000
```

`docker-compose.yml` deliberately does **not** include Redis (Phase 5) or a MinIO/S3-compatible object-storage service (Phase 7) yet, even though the master spec's Phase 4 section describes the eventual full-stack compose file including both — neither service exists in this codebase yet, and this phase was explicitly scoped not to introduce them ("Do not start Redis. Do not start Object Storage.").

## Verification

**Environment limitation, documented transparently**: this sandbox's outbound network policy blocks Docker Hub's image-layer CDN (`production.cloudfront.docker.com` and equivalent mirrors return `403 Forbidden` for every image tried, including `node:22-alpine`, `alpine:3.20`, and `hello-world` — confirmed as a policy-level denial, not a transient failure, per the proxy's own diagnostic status). This means `docker build`/`docker compose up` could not literally be executed against these Dockerfiles in this environment.

To compensate, the exact command sequences each Dockerfile stage runs were verified directly, outside Docker, against isolated copies of the real lockfile/workspace/source so nothing in this repo's own working state was mutated in the process:

- The `build` stage's sequence (`pnpm install --filter api...` → `prisma generate` → `tsc`) — confirmed working, and caught a real bug in the process: the initial Dockerfile draft never copied `tsconfig.base.json` (which `apps/api/tsconfig.json` extends) into the build stage, which would have failed the container build the first time anyone actually ran it. Fixed before this was ever committed.
- The `prod-deps` stage's sequence (`pnpm install --filter api... --prod` → `prisma generate`) — confirmed working only *after* discovering `pnpm prune --prod` doesn't work the way a single-package Dockerfile needs in a workspace (see above) and switching to this two-independent-installs design instead.
- The assembled runtime (prod-deps' `node_modules` + build's `dist/`) was actually booted with `node dist/src/index.js` against this sandbox's real local Postgres, with production-shaped environment variables (matching what `docker-compose.yml` sets): confirmed `GET /health` → `200`, `GET /ready` → `200` (real `SELECT 1` against the live database) and `503` when pointed at an unreachable database, security headers present (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`), and `SIGTERM` producing a clean graceful shutdown (log line + process exit, no hang).
- `apps/web`'s standalone build was verified the same way: `.next/standalone/apps/web/server.js`, run directly with `public/`/`.next/static` copied alongside it exactly as the Dockerfile's final stage does, served `200` on both `/` and `/login`.
- `docker compose config` (which validates and interpolates the compose file without needing to pull any image) confirms `docker-compose.yml` itself is syntactically valid and resolves as intended.

This is the same category of limitation this project's sandbox has documented before (no live Anthropic/Google Maps API keys, no outbound network egress in earlier sprints) — the underlying commands and artifacts are proven correct, but an actual `docker build`/`docker compose up` run in a normal CI or developer environment (where Docker Hub is reachable) is the recommended final check before the first real deployment, and is exactly what the Phase 2 CD pipeline's still-placeholder image-build step will do once it's wired up in a later phase.
