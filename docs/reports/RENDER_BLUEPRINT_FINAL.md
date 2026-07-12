# Render Blueprint — Final (Both Services)

Production Phase 2C. Render is now the only production platform for OrderVora — `render.yaml` deploys both `apps/api` (`ordervora-api`) and `apps/web` (`ordervora-web`) as Docker web services. Vercel has been removed from the architecture entirely, per `docs/reports/ARCHITECTURE_VERIFICATION.md`'s finding (no code-level dependency on Vercel exists anywhere in this codebase). No deployment was performed while producing this report.

---

## 1. What Changed

| File | Change | Why |
|---|---|---|
| `render.yaml` | Added a second service, `ordervora-web` (Docker, `apps/web/Dockerfile`, free plan). Updated header/`FRONTEND_URL` comments to describe the two-service architecture instead of Vercel. **`ordervora-api`'s service block is otherwise byte-identical** — same `type`, `name`, `runtime`, `plan`, `dockerfilePath`, `dockerContext`, `healthCheckPath`, and all 20 `envVars` entries unchanged (verified via `git diff` — only surrounding comments changed for that service). | Requested: keep the API service unchanged, add the web service |
| `apps/web/Dockerfile` | Two small, additive changes (detailed in §3) — a build-time `ARG NEXT_PUBLIC_SITE_URL` (previously not wired into the build at all) and a runtime-stage `ARG`/`ENV` pair that persists `API_URL` into the running container. | Required for `render.yaml`'s declared env vars to actually take effect — without these, the new env vars would silently do nothing |
| `docs/PRODUCTION_SOURCE_OF_TRUTH.md` | Rewrote "Canonical production architecture" and "Environment ownership" sections: Vercel → `ordervora-web` on Render throughout | Living document describing current architecture; was factually wrong after this change otherwise |
| `docs/runbooks/render-deploy.md` | Consolidated the two-step (Render API, then Vercel web) walkthrough into one Render Blueprint step covering both services; updated the Koyeb fallback note | Operational runbook meant to be followed literally |
| `docs/runbooks/deployment-architecture.md` | Added a "Resolved" note under the pre-existing "two real options" analysis (Option A vs. Option B) — the historical tradeoff discussion is preserved, not deleted | That doc explicitly framed this as an open decision; it no longer is |
| `docs/reports/PRODUCTION_ENVIRONMENT_VALUES.md` | Added a new `ordervora-web` variables section (5 vars) and an updated Deployment Order covering both services; fixed `FRONTEND_URL`'s row to reference `ordervora-web` instead of Vercel | Requested: update deployment documentation accordingly |
| `docs/reports/FINAL_PRODUCTION_DEPLOYMENT_BOOK.md` | Updated accounts (§2), env vars (§3, §5, §6), deployment order (§11), post-deploy checklist (§14), and rollback plan (§15) to remove Vercel and reflect two Render services | Explicitly declared "the single source of truth for every future deployment" in the prior phase — a banner alone wasn't enough here |
| `docs/reports/ARCHITECTURE_VERIFICATION.md` | Added a short "Resolution" addendum at the end | Preserves the original point-in-time investigation; records that its conclusion was acted on |
| `docs/reports/RENDER_DEPLOYMENT_GUIDE.md`, `docs/reports/RENDER_DEPLOYMENT_CHECKLIST.md` | Added a one-line "superseded" banner pointing to this document | Their `ordervora-api`-only content remains accurate; they're no longer the complete picture on their own |

**Not modified:** `apps/api/Dockerfile`, `apps/api/scripts/start.sh`, any file under `apps/api/src`, any file under `apps/web/src`, `apps/web/next.config.ts`, `docker-compose.yml`, the Prisma schema, migrations, or any test file. No application source code was touched.

---

## 2. `render.yaml` — Both Services

```yaml
services:
  - type: web
    name: ordervora-api
    runtime: docker
    plan: free
    dockerfilePath: ./apps/api/Dockerfile
    dockerContext: .
    healthCheckPath: /health
    envVars:
      # ... all 20 variables, unchanged — see render.yaml directly

  - type: web
    name: ordervora-web
    runtime: docker
    plan: free
    dockerfilePath: ./apps/web/Dockerfile
    dockerContext: .
    healthCheckPath: /
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3000"
      - key: API_URL_SCHEME
        value: http
      - key: API_HOST
        fromService:
          type: web
          name: ordervora-api
          property: hostport
      - key: NEXT_PUBLIC_SITE_URL
        sync: false
```

Full file, with every explanatory comment, is `render.yaml` at the repo root — not reproduced here in full to avoid a second copy drifting out of sync.

---

## 3. Internal Communication Between Web and API — How It Actually Works

This required more than a `render.yaml` entry. Two facts made it non-trivial:

1. **Render has no string-templating/concatenation in `envVars`** (confirmed against Render's own Blueprint documentation and reference material) — a `fromService` entry returns exactly one raw value (`host`, `hostport`, etc.); there's no way to write `value: "http://" + fromService(...)` in one YAML entry.
2. **`apps/web` reads the API address in two different places, at two different times:**
   - `next.config.ts`'s `rewrites()` — resolved once, at `next build` time, from `process.env.API_URL`. This drives every browser-initiated `/api/*`, `/preview/*`, `/assets/*` call (the primary traffic path — same-origin proxy, keeps auth cookies first-party).
   - `apps/web/src/lib/server-api.ts` — reads `process.env.API_URL` fresh at server process startup (runtime, not build time). Used by 15 dashboard pages for server-side data fetching, bypassing the rewrite proxy.

`apps/web/Dockerfile` already had `ARG API_URL_SCHEME=http` / `ARG API_HOST=localhost:4000` for the build-time path, with a code comment explicitly anticipating "Render's `fromService`, which exposes a bare host with no scheme." That part just needed `render.yaml` wiring (§2's `API_URL_SCHEME`/`API_HOST` entries — Render automatically forwards Docker-service `envVars` as build `ARG`s when the Dockerfile declares a matching `ARG` name, confirmed against Render's own documentation).

The runtime path (`server-api.ts`) had no equivalent — `API_URL` was never persisted into the actual running container, only computed transiently inside one `RUN` command during the build. Docker `ARG`s also don't cross stage boundaries, so the `build` stage's values weren't available in the separate `runtime` stage either.

**Fix (in `apps/web/Dockerfile` only, no application code touched):**

```dockerfile
# runtime stage
ARG API_URL_SCHEME=http
ARG API_HOST=localhost:4000
ENV API_URL=${API_URL_SCHEME}://${API_HOST}
```

Re-declaring the same two `ARG`s in the `runtime` stage (Render passes the same build-arg values to every stage that asks for them) and computing a real, persisted `ENV API_URL` from them means the running container's `process.env.API_URL` is set correctly, automatically, with **zero application code changes** — `server-api.ts`'s existing `process.env.API_URL ?? "http://localhost:4000"` picks it up unmodified.

**Verified, not just written:** ran the exact Dockerfile build commands natively (no Docker daemon available in this sandbox) —
- `next build` with `API_URL=http://ordervora-api:4000` and `NEXT_PUBLIC_SITE_URL=https://ordervora.example` set: succeeded, 42 routes generated.
- Confirmed `ordervora-api:4000` baked into `.next/standalone/apps/web/.next/routes-manifest.json` and `required-server-files.json` (the rewrite manifest).
- Booted the built standalone server and confirmed `sitemap.xml`/`robots.txt` correctly show `https://ordervora.example`, not `localhost`.
- Confirmed the runtime-stage `ARG`/`ENV` computation produces the exact value `server-api.ts`'s existing code expects (`http://ordervora-api:4000`).
- `pnpm run typecheck` and `pnpm run test` for `apps/web`: both pass (132/132 tests, 21/21 files) — no regression from the Dockerfile-only change.

**Result:** internal communication is fully automatic in both directions of the web→API path. `API_HOST` re-resolves via `fromService` on every deploy/sync, so if `ordervora-api` is ever recreated or its internal address changes, `ordervora-web` picks up the new value on its next deploy with no manual step.

**The one direction that remains a manual paste:** `ordervora-api`'s `FRONTEND_URL`. Render's `fromService` only resolves *pre-existing* services' internal addresses — it cannot resolve a sibling service's own public URL within the same Blueprint `Apply` run (both services are created together; `ordervora-web`'s URL doesn't exist yet at the moment `ordervora-api` would need it). This is a Render platform constraint, not something this codebase's configuration can work around. §5 documents the one-time manual step.

---

## 4. Health Checks

| Service | Path | Behavior | Verified |
|---|---|---|---|
| `ordervora-api` | `/health` | Liveness only, no DB query — `200` with `{status, uptime, timestamp, workers}` | Unchanged from prior phases; re-confirmed present in `render.yaml`, untouched |
| `ordervora-web` | `/` | Statically prerendered homepage — matches `apps/web/Dockerfile`'s own Docker-level `HEALTHCHECK`, which already targets the same path (`GET /`, expects status `<500`) | No dedicated health route exists in the Next.js app (it's a frontend, not an API) — `/` is the correct, already-established choice, not a new decision |

---

## 5. Validation Performed

- [x] `render.yaml` parses as valid YAML (`python3 -c "import yaml; yaml.safe_load(...)"`)
- [x] Exactly 2 services present: `ordervora-api`, `ordervora-web`
- [x] Both services: `type: web`, `runtime: docker`, `plan: free`, correct `dockerfilePath`/`dockerContext`/`healthCheckPath`
- [x] `ordervora-api`: 20 env vars, no duplicates, unchanged from the prior phase (`git diff` shows only comment changes)
- [x] `ordervora-web`: 5 env vars, no duplicates
- [x] `API_HOST`'s `fromService` block correctly targets `type: web`, `name: ordervora-api`, `property: hostport`
- [x] `apps/web` build succeeds with the new Dockerfile-equivalent env vars (`API_URL`, `NEXT_PUBLIC_SITE_URL`) set exactly as Render would set them
- [x] Built output correctly bakes both values in (rewrite manifest, sitemap/robots)
- [x] Runtime `API_URL` computation verified to produce the exact value `server-api.ts` expects
- [x] `apps/web` typecheck: pass
- [x] `apps/web` full test suite: 132/132 pass, 0 failed
- [x] No application source code file was modified (`git diff --stat` shows only `render.yaml`, `apps/web/Dockerfile`, and documentation)

**Not verified (sandbox limitation, consistent with every prior phase's own disclosed limitation):** an actual `docker build`/Render deploy — no Docker daemon available in this sandbox. Every underlying build/runtime step was reproduced natively instead (§3). Render's `fromService`/build-arg-forwarding mechanisms themselves were verified against Render's own published documentation, not against a live Render account.

---

## 6. Deployment Order (Updated)

Supersedes the single-service version in earlier reports. Full detail: `docs/reports/FINAL_PRODUCTION_DEPLOYMENT_BOOK.md` §11.

1. Provision Supabase, obtain the Session Pooler `DATABASE_URL`.
2. render.com → **New +** → **Blueprint** → select `abukeeth/core`, branch `main` → **Apply**. Render shows **both** `ordervora-api` and `ordervora-web` in the preview.
3. Fill every prompted value across both services (`ordervora-api`'s 12 prompts, then `ordervora-web`'s 1 prompt — `NEXT_PUBLIC_SITE_URL`). `API_URL_SCHEME`/`API_HOST` need no input.
4. Wait for both builds. Verify `<api-url>/health`, `<api-url>/ready`, and `<web-url>/`.
5. Check `ordervora-api`'s logs for `"Seeded ADMIN user: <your ADMIN_EMAIL>"` (confirms the seed-system fix from the prior phase is in effect).
6. Return to `ordervora-api` → Environment → paste `ordervora-web`'s real URL into `FRONTEND_URL` → save (auto-redeploys `ordervora-api`).
7. Done — no Vercel step exists anymore.

---

## Verdict

Both services validated and represented correctly in `render.yaml`. Internal web↔API communication is automatic via `fromService`, requiring the smallest possible Dockerfile-only fix (no application code) to actually take effect for both the build-time and runtime read paths. All deployment documentation updated to match. No deployment was performed.
