# Architecture Verification — Is Vercel Actually Required?

Investigation only, based entirely on the current codebase. No code was modified and no deployment was performed while producing this report.

---

## 1. Can `apps/web` be deployed entirely on Render?

**Yes.** `apps/web` already has a complete, independent, production-grade Dockerfile — `apps/web/Dockerfile` — that requires nothing from Vercel:

- Multi-stage build: `pnpm fetch` → `next build` (with `output: "standalone"`, `next.config.ts` line 29) → a slim `node:22.22.2-alpine` runtime stage running the traced, self-contained `server.js`.
- Exposes port `3000`, runs as non-root (`USER node`), has its own Docker `HEALTHCHECK` (`GET /` every 30s), and its own `scripts/start.sh` using `exec node apps/web/server.js` for correct `SIGTERM` forwarding — the exact same production-hardening pattern already used and already verified for `apps/api`.
- Render already runs a Docker web service today (`apps/api`, via `render.yaml`). Render's Docker-service mechanism is generic — nothing about `apps/web/Dockerfile` requires a feature Render doesn't already support for `apps/api`.
- **Already exercised, not just theoretical:** `docker-compose.yml` (repo root) runs a complete `api` + `web` stack together right now, built from these exact two Dockerfiles, with `web` depending on `api`'s healthcheck and reaching it via `API_URL=http://api:4000` — i.e., the two-Docker-service architecture Render deployment would require is already built and already used for local production simulation (per its own top-of-file comment: *"Brings up the full stack ... built from the same Dockerfiles the real deployment target uses"*).

**Conclusion: yes, unconditionally — the code and Docker configuration for a Render-hosted `apps/web` already exist and are already tested.**

---

## 2. Does `render.yaml` already include every required web service?

**No.** `render.yaml` currently defines exactly one service:

```yaml
services:
  - type: web
    name: ordervora-api
    runtime: docker
    ...
```

There is no second service block for `apps/web`. `render.yaml`'s own top-of-file comment confirms this is deliberate as of today, not an oversight: *"This is the one supported backend deployment target for this project ... apps/web is deployed separately, to Vercel."*

**Conclusion: no — deploying `apps/web` on Render today would require adding a new service block to `render.yaml` (or configuring a second Render service manually). The Dockerfile it would use already exists (§1); the Blueprint entry that would reference it does not exist yet.**

---

## 3. Is there any production dependency on Vercel?

**No hard dependency found**, after checking every common coupling point:

| Coupling point checked | Found? | Evidence |
|---|---|---|
| `vercel.json` anywhere in the repo | No | `find . -iname vercel.json` → no results |
| `@vercel/*` packages in `apps/web/package.json` | No | Full dependency list checked — only `next`, `react`, `react-dom`, Stripe SDKs, `lucide-react`, `qrcode.react`, `canvas-confetti` |
| `@vercel/*` packages anywhere else | Yes, but in `apps/api`, not `apps/web` — and explicitly not Vercel-locked | `@vercel/functions` (`waitUntil`) is used in 5 files under `apps/api/src`. Its own code comment (`apps/api/src/modules/imports/job-runner.ts` lines 17-25) states plainly: *"Off Vercel (Docker/Render/local/tests), it's a no-op passthrough ... identical behavior to the previous `void this.run(...)`."* This is a defensive dual-environment compatibility shim, not a platform requirement — `apps/api` has never been deployed to Vercel in any reviewed document (it's explicitly Docker/Render-only per `render.yaml`'s own comment). |
| Vercel KV / Blob / Postgres / Analytics / Edge Config / Speed Insights | No | Searched both apps — zero matches |
| `middleware.ts` (Vercel Edge Runtime) | No | No `middleware.ts` file exists anywhere under `apps/web/src` |
| ISR / `revalidate` | No | Zero matches for `revalidate` in `apps/web/src` |
| Vercel Cron (`vercel.json` crons) | No | No `vercel.json` at all (see above) |
| `process.env.VERCEL` checks | Yes — one, and it's the opposite of a dependency | `next.config.ts` line 29: `output: process.env.VERCEL ? undefined : "standalone"`. This line exists specifically so that **when** building on Vercel, the Docker-oriented `"standalone"` output (which has caused build/tracing issues on Vercel for other Next.js monorepos, per the same file's comment) is skipped — Vercel is treated as *one interchangeable build target among several*, detected and special-cased, not assumed or required. |

A third data point beyond the code itself: `RAILWAY_DEPLOYMENT.md` (repo root) documents a **third**, already-attempted deployment target for both `apps/api` and `apps/web` — Railway — using the same Dockerfiles, explicitly stated to coexist with the Render+Vercel setup *"without conflict."* The codebase has already been deployed (or at minimum, fully configured for deployment) to more than one non-Vercel target.

**Conclusion: no. Every place Vercel could plausibly be load-bearing was checked and found either absent or explicitly designed to degrade gracefully off Vercel.**

---

## 4. Are there any Next.js features in use that require Vercel specifically?

Checked every major Vercel-coupled Next.js feature class:

| Feature | In use? | Detail |
|---|---|---|
| `next/image` (Vercel's built-in image optimization API) | **Deliberately not used** | Exactly one file references it — `apps/web/src/app/dashboard/import/[id]/business-profile-preview.tsx` — and only in a code comment explaining why a plain `<img>` tag is used *instead*: *"A plain `<img>` is used for the logo since its host is whatever the import's storage backend serves from, not known ahead of time for next/image's remote-pattern allowlist."* No `<Image>` component is imported or rendered anywhere in `apps/web/src`. No `images` config block exists in `next.config.ts` either. This is the single most Vercel-associated Next.js feature, and the codebase actively avoids it. |
| Edge Middleware | Not used | No `middleware.ts` |
| ISR (`revalidate`) | Not used | Confirmed via search |
| Server Actions requiring Vercel's infrastructure | N/A | Server Actions are a standard Next.js feature that runs on any Node server, including the standalone output `apps/web/Dockerfile` already produces — not Vercel-specific |
| `output: "standalone"` | **Used, and specifically to avoid Vercel-only deployment** | `next.config.ts` — this is the Docker/self-host output mode, the opposite of a Vercel dependency |

**Conclusion: no. If anything, the codebase actively engineers around the one Next.js feature (`next/image`) most associated with requiring Vercel's infrastructure.**

---

## 5. If Vercel is removed completely, what breaks?

**Nothing at the code or architecture level.** Specifically:

- `apps/web` still builds, via the exact same `next build` command, into the exact same `.next/standalone` output — this was already verified working end-to-end in this engagement (`docs/reports/DEPLOYMENT_BLOCKERS.md` §6: a real `next build` with `API_URL`/`NEXT_PUBLIC_SITE_URL` set produced 42 routes and a correct `.next/standalone/apps/web/server.js`).
- The web↔API communication path (`next.config.ts`'s `rewrites()`, proxying `/api/*` same-origin to `API_URL`) was already verified working with both servers running as plain Node processes, no Vercel involved (`docs/reports/DEPLOYMENT_BLOCKERS.md` §8).
- `apps/web/Dockerfile` + `docker-compose.yml` already prove the full two-service architecture runs correctly outside Vercel.

**What operational work removing Vercel would actually require** (config authoring, not a capability gap):

1. Add a second service block to `render.yaml` (or a second manually-configured Render Docker service) pointing at `apps/web/Dockerfile`, mirroring `apps/api`'s existing block — this doesn't exist yet (§2).
2. Set the build-time `API_HOST`/`API_URL_SCHEME` Docker `ARG`s (or the equivalent Render build-arg mechanism) to the Render API service's own hostname — `next.config.ts` only reads `API_URL` once, at `next build` time, so this must be a build-time value, exactly as `apps/web/Dockerfile`'s own comment explains (lines 24-29).

**One honestly-disclosed trade-off, not a break** — already flagged by the codebase itself, not newly discovered here: `apps/web/Dockerfile`'s comment (lines 38-41) states that the standalone output's `public/` and `.next/static` assets are copied into the runtime image and served directly by the Node process, because *"this project has no CDN yet"* — Vercel's biggest genuine advantage is a zero-config global CDN/edge network for those static assets. Removing Vercel means static assets are served from wherever Render's single instance runs, not from edge locations worldwide. This is a performance/latency consideration for a geographically distributed user base, not a functional break, and the codebase already documents it as a known, accepted gap rather than something Vercel is silently covering up.

**Conclusion: nothing breaks. The only costs are (a) writing the `render.yaml` service block that doesn't exist yet, and (b) losing Vercel's free global CDN for static assets — a pre-existing, already-documented trade-off, not new information.**

---

## Summary of Evidence

| Question | Answer | Strength of evidence |
|---|---|---|
| Can `apps/web` deploy entirely on Render? | Yes | Direct — complete Dockerfile + working `docker-compose.yml` stack already exist |
| Does `render.yaml` already cover web? | No | Direct — only one service block exists today |
| Any production dependency on Vercel? | No | Direct — every common coupling point checked, all absent; one explicit anti-coupling code comment found |
| Any Next.js feature requiring Vercel? | No | Direct — the most Vercel-associated feature (`next/image`) is deliberately avoided, with a code comment explaining why |
| What breaks if Vercel is removed? | Nothing functional; one pre-existing, already-documented CDN trade-off | Direct — verified build/runtime behavior identical off Vercel in this engagement's own prior dry run |

---

## VERCEL OPTIONAL

---

## Resolution (Production Phase 2C)

Acted on: `render.yaml` now declares `ordervora-web` as a second Render Docker web service (`docs/reports/RENDER_BLUEPRINT_FINAL.md`), using `apps/web/Dockerfile` exactly as identified in §1 above. Two small, additive Dockerfile-only changes (no application source code) were required to make the cross-service env vars declared in `render.yaml` actually take effect: wiring `NEXT_PUBLIC_SITE_URL` into the build (previously not consumed by the Dockerfile at all) and persisting a runtime `API_URL` computed from the same `API_URL_SCHEME`/`API_HOST` build args already in use (so `apps/web/src/lib/server-api.ts`'s existing, unmodified runtime read of `process.env.API_URL` resolves correctly). Vercel is no longer part of this project's deployment configuration.
