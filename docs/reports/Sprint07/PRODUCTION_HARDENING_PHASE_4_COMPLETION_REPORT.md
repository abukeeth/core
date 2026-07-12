# Production Hardening Phase 4 — Completion Report

**Deployment Architecture & Containerization**

Implemented per `docs/reports/Sprint07/PRODUCTION_HARDENING_MASTER_SPEC.md`, Phase 4. Builds directly on Phase 1 (migrations), Phase 2 (CI/CD pipeline shape), and Phase 3 (centralized config/secrets) — this phase defines the actual path from "code in this repository" to "running in production," which did not exist before it.

## 1. What was done

### 1.1 Production-ready Dockerfiles (multi-stage)

- **`apps/api/Dockerfile`** — four stages (`fetch` → `build` → `prod-deps` → `runtime`). Compiles TypeScript to `dist/`, generates the Prisma Client, and ships a runtime image with only production `node_modules` and compiled output — no TypeScript/ESLint/Vitest toolchain, no application source, no pnpm/corepack.
- **`apps/web/Dockerfile`** — two stages (`fetch` → `build` → `runtime`), using Next.js's `output: "standalone"` mode (newly enabled in `next.config.ts`) to produce a self-contained, pre-pruned `server.js` + `node_modules`.

**A design problem discovered and fixed during this phase, not assumed away**: the naive approach (one full install, then `pnpm prune --prod`) does not work in this pnpm workspace — `pnpm prune` operates relative to the *root* `package.json`, not a single filtered package, and running it after a `--filter api...` install deletes apps/api's `node_modules` entirely rather than reducing it to production-only. This was caught by testing the actual command sequence in an isolated copy of the repo (see §4) before it was ever baked into a committed Dockerfile. The fix: a **second, independent** `--prod`-only install (the `prod-deps` stage) rather than pruning the `build` stage's install. This only works because `prisma` (the CLI) was moved from `devDependencies` to a regular `dependencies` entry in `apps/api/package.json` — `prisma generate` needs the CLI present, and needs to run once per install (its output lives beside wherever `@prisma/client` resolves to *within that install's own virtual store*).

A second real bug caught the same way: the first Dockerfile draft never copied `tsconfig.base.json` (the shared root config `apps/api/tsconfig.json` extends) into the build stage — the compile would have failed on the very first real build. Fixed before commit.

### 1.2 `docker-compose.yml` (local production simulation)

Three services — `postgres`, `api`, `web` — wired with the same health-gating a real rolling deploy uses: `api` only starts once `postgres` is `service_healthy`; `web` only starts once `api` is. Deliberately does **not** include Redis (Phase 5) or MinIO/object storage (Phase 7) yet, per this phase's explicit scope ("Do not start Redis. Do not start Object Storage.") — those services don't exist in this codebase yet.

### 1.3 Health checks

- **`GET /health`** (pre-existing, liveness) — process-up check, backs each image's `HEALTHCHECK` directive.
- **`GET /ready`** (new, readiness) — runs `SELECT 1` against the database via Prisma; `200` if reachable, `503` if not. This is what an orchestrator/load balancer should gate new-instance traffic on — a process can be alive while its DB connection is still down. Verified directly (§4): `200` against a live database, `503` against an unreachable one, with `/health` still returning `200` in the latter case.

### 1.4 Graceful shutdown

`apps/api/src/index.ts` now handles `SIGTERM`/`SIGINT`: stops both background schedulers immediately, lets `server.close()` drain in-flight HTTP requests, disconnects Prisma's pool, then exits — with a 10-second force-exit guard against a hang. `apps/api/scripts/start.sh` and `apps/web/scripts/start.sh` `exec` `node` directly (never via `pnpm start`/`npm start`, which doesn't reliably forward `SIGTERM`) so this is actually reachable; `docker-compose.yml` additionally sets `init: true` per service for correct zombie-reaping and signal-forwarding via `tini`. Verified directly (§4): booting a compiled instance and sending `SIGTERM` produces the expected log line and a clean exit, no hang.

### 1.5 Production startup scripts

`apps/api/scripts/start.sh` / `apps/web/scripts/start.sh` — minimal, committed, `exec`-form entrypoints, specifically to avoid the well-known npm/pnpm-wrapper signal-forwarding gap described above.

### 1.6 Multi-stage image size optimization

Both runtime images carry only what's needed to run: apps/api ships compiled `dist/` + production `node_modules` (no TypeScript compiler, no test runner, no linter, no dev-only Prisma tooling — those live only in the discarded `build`/`prod-deps` build stages); apps/web ships only the Next.js-traced `server.js` + its own pre-pruned `node_modules` (via `output: "standalone"`, which uses `@vercel/nft` to trace each page's actual runtime dependencies rather than shipping the full tree).

### 1.7 Immutable production containers

- Both images run as the unprivileged `node` user, not root.
- Base image version pinned (`ARG NODE_VERSION=22.22.2`), not the floating `node:22-alpine` tag.
- `docker-compose.yml` sets `read_only: true` on both `api` and `web`, with a `tmpfs` mount for `/tmp` and a named volume scoped specifically to `apps/api/uploads` — the one genuine write path this codebase still has (import uploads / published-site output, `lib/file-storage.ts` / `lib/release-storage.ts`), a known, already-documented limitation that Phase 7 (Object Storage) is what actually resolves; this phase makes the honest tradeoff (a scoped volume) rather than pretending the gap doesn't exist or touching Phase 7's explicitly-out-of-scope territory.
- Neither runtime image contains a package manager or application source to modify.

### 1.8 Security headers (`helmet`)

Added to `apps/api/src/app.ts` with a deliberately customized CSP (not `helmet`'s stricter defaults): published restaurant sites embed an inline `<style>` block (`theme-css.ts`) and inline `<script type="application/ld+json">` tags (`seo-head.ts`), and CSP's `script-src`/`style-src` govern inline tags regardless of content type. A nonce-based policy isn't viable without breaking the renderer's documented determinism guarantee (static HTML generated once at publish time; a nonce is per-request-random), so `'unsafe-inline'` is used for those two directives specifically, while `default-src`/`object-src`/`base-uri`/`frame-ancestors` stay strict. The renderer's actual XSS defense (output escaping at generation time, pre-existing) is unchanged — CSP here is additional defense-in-depth, not a replacement. `crossOriginEmbedderPolicy` is explicitly disabled (this app's architecture is entirely same-origin-via-proxy; COEP provides no benefit and risks unexpected breakage). Verified directly (§4): `Content-Security-Policy`, `Strict-Transport-Security`, and `X-Frame-Options: SAMEORIGIN` all present on a live response.

### 1.9 Deployment architecture documentation

`docs/runbooks/deployment-architecture.md` (new) — full design rationale for every decision above, plus:

- **apps/web's deployment target, both options presented explicitly** (per the master spec's own instruction not to assume one): containerize alongside apps/api (what this phase builds and enables), or deploy to Vercel while apps/api runs in a container elsewhere. Tradeoffs for each are documented; neither is deleted or foreclosed by this phase's code.
- The zero-downtime rolling-deploy contract this phase's primitives (`/ready`, graceful shutdown) exist to support.
- The environment limitation described in §4, documented transparently.

## 2. Files changed

**New:**
- `apps/api/Dockerfile`
- `apps/api/scripts/start.sh`
- `apps/web/Dockerfile`
- `apps/web/scripts/start.sh`
- `docker-compose.yml`
- `.dockerignore`
- `docs/runbooks/deployment-architecture.md`
- `docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_4_COMPLETION_REPORT.md` (this file)

**Modified:**
- `apps/api/src/app.ts` — `helmet` middleware (CSP + baseline security headers), new `GET /ready` endpoint.
- `apps/api/src/index.ts` — graceful shutdown (`SIGTERM`/`SIGINT` handling, drained server close, Prisma disconnect, force-exit guard).
- `apps/api/package.json` — `helmet` added as a dependency; `prisma` moved from `devDependencies` to `dependencies` (needed for `prisma generate`/`migrate deploy` to run in production-only installs).
- `apps/web/next.config.ts` — `output: "standalone"`, `outputFileTracingRoot` (monorepo-aware tracing).
- `pnpm-lock.yaml` — reflects the two dependency changes above.

**Explicitly not touched, per this phase's stated scope:** no Redis, no object storage/MinIO, no monitoring/logging stack, no application business logic (all changes are infrastructure/config — routing, process lifecycle, dependency classification, container packaging).

## 3. A real design correction made during this phase

Both bugs below were caught *before* being committed, by testing the actual command sequences directly rather than trusting the Dockerfile's logic on paper:

1. **`pnpm prune --prod` doesn't work per-package in a workspace** — deletes the target package's `node_modules` instead of reducing it to prod-only. Replaced with a second, independent `--prod` install (§1.1).
2. **`tsconfig.base.json` wasn't in the build stage's `COPY`** — the compile would have failed on the first real build. Fixed by adding it to the `build` stage's `COPY` list.

## 4. Verification results

| Check | Result |
|---|---|
| `prisma validate` | ✅ Pass |
| `prisma generate` | ✅ Pass |
| `pnpm run lint` (root, both apps) | ✅ Pass, no warnings |
| `pnpm run typecheck` (root, both apps) | ✅ Pass |
| `pnpm run test` (root, both apps) | ✅ **855/855 passing** (846 `apps/api` + 9 `apps/web`) |
| `pnpm run build` (root, both apps) | ✅ Pass — all 28 web routes compiled, api `tsc` clean |

**Container boot verification — environment limitation, documented transparently.** This sandbox's outbound network policy blocks Docker Hub's image-layer CDN outright (`production.cloudfront.docker.com` and equivalent returned `403 Forbidden` for every base image tried — `node:22-alpine`, `alpine:3.20`, `hello-world` — confirmed as a policy-level denial via the proxy's own diagnostic status, not a transient failure). `docker build`/`docker compose up` could therefore not be literally executed against these Dockerfiles here.

To compensate, every command each Dockerfile stage runs was verified directly, outside Docker, against isolated copies of the real lockfile/workspace/source (so this repository's own working state was never mutated in the process) — this is what surfaced both bugs in §3:

- The `build` stage's full sequence (install → `prisma generate` → `tsc`) — confirmed working end to end.
- The `prod-deps` stage's sequence (`--prod` install → `prisma generate`) — confirmed working, and is what surfaced the `pnpm prune` problem in the first place.
- **The assembled runtime was actually booted** (`node dist/src/index.js`, combining the `prod-deps` stage's `node_modules` with the `build` stage's `dist/`, exactly as the Dockerfile's final `COPY` instructions do) against this sandbox's real local Postgres, with production-shaped environment variables matching `docker-compose.yml`:
  - `GET /health` → `200`
  - `GET /ready` → `200` (real `SELECT 1` against the live database) and `503` when pointed at an unreachable database
  - Security headers present: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`
  - `SIGTERM` → `"SIGTERM received, shutting down gracefully"` logged, clean process exit, no hang
- **apps/web's standalone build was verified the same way**: `.next/standalone/apps/web/server.js`, run directly with `public/`/`.next/static` copied alongside it exactly as the Dockerfile's final stage does — served `200` on both `/` and `/login`.
- `docker compose config` (validates/interpolates the compose file without pulling any image) confirms `docker-compose.yml` itself is syntactically valid and resolves as intended.

This is the same category of limitation this project has documented in earlier phases (no live Anthropic/Google Maps API keys, no outbound network egress for those adapters) — the underlying artifacts and command sequences are proven correct, but an actual `docker build`/`docker compose up` run in a normal CI or developer environment (where Docker Hub is reachable) is the recommended final check before any real deployment.

## 5. Notes / deferred items

- **apps/web's real hosting target (containerized vs. Vercel) is intentionally left as an open decision**, per the master spec's explicit instruction not to assume one — both are documented with tradeoffs in `docs/runbooks/deployment-architecture.md`. `apps/web/Dockerfile` makes the containerized path available; choosing between them is an infrastructure/cost decision for whoever owns that budget, not a code change.
- **The `apps/api/uploads` local-disk volume is a known, already-documented gap**, not new to this phase — Phase 7 (Object Storage Migration, explicitly out of this phase's scope) is what replaces it with real durable storage before any real production cutover.
- **Wiring a specific orchestrator's rollout configuration to `/ready` + graceful shutdown is deliberately not done here** — no cloud infrastructure exists yet to configure, and the master spec's own dependency note ties the CD pipeline's actual image-build/deploy steps to a later phase once a hosting target is chosen.
- **`docker build`/`docker compose up` should be re-run in a normal environment** (this sandbox's Docker Hub access is blocked, §4) as the final pre-deployment check, even though the underlying build logic has been verified as thoroughly as this environment allows.

---

*Phase 4 complete. Waiting for your review before Phase 5 (Redis Introduction) begins.*
