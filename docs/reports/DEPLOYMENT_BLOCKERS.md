# Deployment Blockers — Phase 2C Dry Run

A complete deployment dry run was executed against this codebase — not a code-reading exercise, an actual local execution of every step Render will perform: `pnpm install`, `prisma migrate deploy`, `prisma generate`, `tsc` build, the seed step, server boot, health-check requests, a real Next.js production build, and a live web↔API integration test. Environment used: Node `22.22.2` (matches the Dockerfile's pinned version), pnpm `10.33.0` (matches `packageManager`), local PostgreSQL `16.13`. No deployment was performed against Render/Supabase/Vercel, and no application code was modified.

**One confirmed, unconditional blocker was found. It must be resolved or explicitly accepted before the first production deploy.**

---

## Blocker — Production boot silently seeds a public-password ADMIN account instead of the operator's own credentials

### What was verified

`apps/api/scripts/start.sh` (the container's entrypoint, run on every boot including Render) executes, in order:

```sh
./node_modules/.bin/prisma migrate deploy
node dist/scripts/seed-if-empty.js
exec node dist/src/index.js
```

`dist/scripts/seed-if-empty.js` (compiled from `apps/api/scripts/seed-if-empty.ts`) does **not** call `apps/api/prisma/seed.ts` — the script that reads `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` via `requireEnv()`. It instead unconditionally shells out to `apps/api/prisma/seed-beta.ts` — the **Sprint 08 beta demo seed** — the first time it finds the `restaurant` table empty:

```ts
// apps/api/scripts/seed-if-empty.ts
const existing = await prisma.restaurant.count();
if (existing > 0) { ...skip... }
execFileSync(process.execPath, [path.join(__dirname, "../prisma/seed-beta.js")], { stdio: "inherit" });
```

This was reproduced live: running `node dist/scripts/seed-if-empty.js` against a freshly-migrated, empty database — with `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` all correctly set in the environment — produced this output:

```
seed-if-empty: database is empty, running beta seed...
Seeding Sprint 08 beta demo environment...
Admin: admin@demo.ordervora.example
Golden Dragon Bistro: owner/staff/kitchen/driver seeded (...)
Bella Italia Trattoria seeded (...)
Taco Fiesta Cantina seeded (...)
Demo customer: customer@demo.ordervora.example
Sprint 08 beta structural seed complete.
All demo accounts share the password: OrdervoraDemo!23
```

The `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` values were never read or used. Instead:

- A `Role.ADMIN` account is created at the hardcoded address `admin@demo.ordervora.example` (`apps/api/prisma/seed-beta.ts` line 205).
- Its password — along with every other demo account's password (staff, kitchen, driver, restaurant owners, a demo customer) — is the constant `OrdervoraDemo!23`, defined in `apps/api/prisma/demo-credentials.ts` and printed in multiple committed docs.
- Three fictitious demo restaurants (Golden Dragon Bistro, Bella Italia Trattoria, Taco Fiesta Cantina) with full staff rosters are created alongside the platform admin.
- No `NODE_ENV` check gates any of this — confirmed by grepping `seed-if-empty.ts`, `seed-beta.ts`, and `start.sh` for `NODE_ENV`: zero matches in all three. It runs identically in `production`.

The codebase itself documents that this is not the intended production path — `seed-beta.ts` line 202-204's own comment reads: *"Platform Admin (separate from the ADMIN_EMAIL bootstrap account in seed.ts, so real production admin credentials are never printed in any committed demo guide)."* This confirms the two seed scripts were designed for two different purposes (`seed.ts` = real production bootstrap, `seed-beta.ts` = demo-only), but `start.sh` is wired to the demo one.

`render.yaml` itself is written under the (incorrect, as verified) assumption that the real seed runs: its comment on the `ADMIN_EMAIL` variable reads *"Bootstraps the single platform ADMIN account on first boot (see apps/api/prisma/seed.ts)"* — `apps/api/prisma/seed.ts` is not invoked anywhere in the actual boot path.

### Impact

Because `abukeeth/core` is a **public** GitHub repository, `OrdervoraDemo!23` and `admin@demo.ordervora.example` are publicly visible in `apps/api/prisma/demo-credentials.ts` and other committed files right now. Deploying today, unmodified, means:

- The first Render boot automatically creates a live, real, `Role.ADMIN` account reachable with a password anyone can read on GitHub.
- The `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` values operators are instructed to set in Render (per `docs/reports/RENDER_DEPLOYMENT_CHECKLIST.md` §10/§16) have **no effect** — they are silently ignored.
- Three demo restaurants with fabricated data appear in the live production database and dashboard alongside any real restaurant onboarded later.

This is a real, exploitable, unconditional production-security issue, not a hypothetical.

### This report does not fix it

Per this phase's instructions, no application code was modified. Resolving this requires a code or configuration change (e.g., pointing `start.sh`/`seed-if-empty.ts` at `prisma/seed.ts` instead of `seed-beta.ts` for production boots, or gating the beta seed behind an explicit opt-in flag) — that decision and change belongs to a follow-up phase, not this dry run.

---

## Everything Else Verified in This Dry Run (no issues found)

| # | Check | Method | Result |
|---|---|---|---|
| 1 | Every required environment variable | Set all 8 core-schema variables + `ADMIN_*`, ran real process | All accepted; `assertStartupEnv()` passed with no validation errors |
| 2 | Docker build | **Not executed** — no Docker daemon available in this sandbox (`dockerd` present but `service docker start` fails with `ulimit: Operation not permitted`, a sandbox restriction, not a repo issue). Substituted with a native, stage-by-stage reproduction of the Dockerfile's build logic (`pnpm fetch` equivalent → `pnpm install --filter api...` → `prisma generate` → `tsc` build) | Every step that could be run natively succeeded; the Dockerfile itself was re-read and its stages match this sequence exactly (see §4 caveat below) |
| 3 | Prisma migration flow | `prisma migrate deploy` against a real, empty PostgreSQL 16.13 database | All 13 migrations applied cleanly, zero errors |
| 4 | Render `start.sh` flow | Ran the exact three commands in `start.sh`, in order, against the compiled `dist/` output | Migrations applied → seed ran (see blocker above) → server started and listened on port 4000 |
| 5 | Health check endpoint | `curl http://localhost:4000/health` after real boot | `200`, `{"status":"ok","uptime":...,"workers":{...}}` |
| 5b | Readiness endpoint (bonus check) | `curl http://localhost:4000/ready` | `200`, `{"status":"ready"}` — confirms live DB connectivity through the same `@prisma/adapter-pg` code path production will use |
| 6 | Next.js production build assumptions | `next build` with `API_URL`/`NEXT_PUBLIC_SITE_URL` set, matching `apps/web/.env.example`'s documented build-time requirement | Compiled successfully, 42 routes generated, `.next/standalone/apps/web/server.js` produced correctly for the Docker/self-hosted path |
| 7 | API startup | Full boot sequence observed in logs: env validation → `"API server listening"` → background workers initialized | Clean startup, no errors; `SIGTERM` produced `"Signal received, shutting down gracefully"` and the process exited cleanly (graceful-shutdown handling confirmed working) |
| 8 | Web ↔ API communication | Ran both the built Next.js standalone server (port 3000) and the API (port 4000) simultaneously; hit `/api/auth/nonexistent-route` on both | Identical response body/status (`404`, `"Cannot GET /api/auth/nonexistent-route"`) from both — proves Next.js's `rewrites()` correctly proxies `/api/*` to the API exactly as `next.config.ts` and `apps/web/.env.example` describe |
| 9 | Supabase connection requirements | Re-confirmed against `docs/reports/SUPABASE_SETUP_REPORT.md`; `lib/prisma.ts`'s `poolConfigFromUrl()` SSL-detection logic re-read against the dry run's own connection string handling | Consistent — Session Pooler requirement stands; local dry run necessarily used `sslmode=disable` (no TLS on the local Postgres instance) but exercised the identical code path |

---

## Risk Assessment

| Risk | Severity | Likelihood if deployed today | Notes |
|---|---|---|---|
| Public-password ADMIN account created in production | **Critical** | **Certain** (100% — unconditional, no env-var override, no `NODE_ENV` gate) | The single blocker above. Anyone can find `OrdervoraDemo!23` in the public repo and log in as a platform admin. |
| Demo/fictitious restaurant data mixed into production | High | **Certain** (100%, same seed run) | Cosmetic/data-integrity issue compounding the above — three fake restaurants with full menus/staff appear in the live dashboard. |
| Docker build fails on Render despite native steps succeeding | Low | Low | Could not literally execute `docker build` in this sandbox (daemon unavailable). Every stage's underlying command was run natively and succeeded; the Dockerfile was independently re-read and matches. Residual risk is limited to Alpine-specific native-module compilation (`argon2`, `sharp`) not exercised in this Debian-based sandbox — both have alpine-compatible prebuilt binaries per their own package configuration, but this wasn't verified byte-for-byte. |
| Supabase Session Pooler reachability/behavior | Low | Low | Logic re-verified against Phase 1 findings; not re-tested against a live Supabase project in this phase (out of scope — no live Supabase project exists yet to test against). |
| Everything else (migrations, health checks, build, startup, web↔API proxy) | None found | N/A | All independently exercised end-to-end against real processes and a real database in this dry run. |

---

## Remaining Manual Steps

1. **Resolve the seeding blocker above** before the first real production deploy — this is the only step that blocks a *safe* launch (not a *successful* one; see probability note below).
2. Continue with the previously-documented manual steps, unaffected by this finding:
   - Provision the Supabase project and obtain the completed Session Pooler `DATABASE_URL` (`docs/reports/SUPABASE_DEPLOYMENT_CHECKLIST.md`).
   - Generate `COMMERCE_ENCRYPTION_KEY` via `openssl rand -hex 32`.
   - Obtain an OpenAI API key and SMTP credentials.
   - Run the Render Blueprint deploy per `docs/reports/RENDER_DEPLOYMENT_CHECKLIST.md`.
   - Deploy `apps/web` to Vercel with `API_URL` and `NEXT_PUBLIC_SITE_URL` set as build-time variables.
   - Return to Render and set the real `FRONTEND_URL` once the Vercel URL is known.
3. After deploying with the blocker unresolved (if that path is chosen anyway, e.g. for a deliberate beta launch): immediately rotate the `admin@demo.ordervora.example` account's password and audit for unauthorized access, since its password is public. This is a mitigation, not a fix — the underlying wiring issue would still affect every future fresh-database deploy.

---

## Estimated First Deployment Success Probability

- **Technical deployment success (container builds, boots, passes Render's health check): ~90%.** Every step in the actual boot sequence was independently verified to work end-to-end against a real database and real compiled build. The only untested step is the literal `docker build` invocation itself (sandbox had no Docker daemon available), and the risk there is narrow (Alpine-specific native module compilation for `argon2`/`sharp`) — the identical dependency versions ship documented prebuilt binaries for Alpine, so this is a low-probability failure mode, not an unknown one.
- **Safe-for-production success: not applicable / do not proceed.** The blocker above is unconditional and certain (100% reproducible) — it is not a probability question. Deploying as-is *will* succeed technically and *will* create a publicly-accessible admin account with a known password. This must be resolved or explicitly, knowingly accepted before proceeding, independent of the technical success estimate above.
