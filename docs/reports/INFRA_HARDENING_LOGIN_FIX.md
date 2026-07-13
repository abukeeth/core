# Infrastructure hardening — login/cold-start fix

Branch: `claude/infra-hardening-login-fix` (off `main`). Not merged, not deployed. Implements the safe, code-level half of the infra recommendation from the prior architecture review — timeouts, the file-storage production guard, the cookie fix, and Render/Vercel deployment preparation — without requiring a plan upgrade or a platform migration first.

## What changed and why

### 1. Request timeouts (`apps/web/src/lib/api.ts`, `apps/web/src/lib/server-api.ts`)

Neither file had any timeout on any `fetch()` call before this change. On a cold-started backend, that meant the login button (and any server-rendered page waiting on `serverFetch`, e.g. the dashboard layout's auth check) had no upper bound at all — it just hung until whatever external timeout happened to apply. Both now use `AbortSignal.timeout()`:

- `apiFetch` (client-side, everything in `api.ts` routes through it): 25s default, 120s for the two raw multipart upload calls (`createImportJob`, `uploadSiteAsset` — large PDFs/photos legitimately need longer).
- `serverFetch` (server-side, used by every Server Component that needs auth/data before rendering): 25s.

A timeout now throws/returns a specific, human-readable message ("The server is taking longer than expected to respond — it may be waking up. Please try again in a moment.") distinct from a genuine network failure, instead of either hanging forever or surfacing a raw `AbortError`. `serverFetch`'s failure branch gained an additive `reason: "timeout" | "network" | "http"` field — existing callers (`dashboard/layout.tsx` and others) are unaffected since they only ever checked `.ok`, but this gives future work a hook to show a friendlier message than an unconditional redirect to `/login` on what might just be a slow wake-up, not an actual auth failure. **Not implemented in this pass** — flagged as a follow-up, not silently done, since it touches many page files beyond what was asked.

25s was chosen to survive a Render free-tier cold start (often cited in the 30-60s range) rather than fight it — a timeout hit today will usually succeed instantly on retry, since the backend is now warm. Once the plan upgrade below lands, this becomes a pure safety ceiling that's essentially never hit.

### 2. Production file-storage guard (`apps/api/src/lib/object-storage-client.ts`, `apps/api/src/index.ts`)

The existing `FileStorage`/`ReleaseStorage` abstraction already had a real S3-compatible implementation (`S3FileStorage`) — it just silently fell back to local disk whenever `OBJECT_STORAGE_BUCKET` was unset, with no distinction between "local dev, that's fine" and "production, that's active data loss on every redeploy." `assertProductionObjectStorageConfigured()` now runs once at boot, right after the existing `assertStartupEnv()`, and refuses to start the process when `NODE_ENV=production` and object storage isn't configured. An explicit escape hatch (`ALLOW_LOCAL_DISK_STORAGE_IN_PRODUCTION=true`) exists for the one legitimate exception — a host with a real persistent volume mounted.

Supabase Storage needs no new adapter — it's S3-compatible, so the existing `S3FileStorage`/`getS3Client()` code path already works against it. `docs/runbooks/object-storage.md` now documents the exact `OBJECT_STORAGE_*` values for Supabase specifically.

**This guard is why the current production deployment cannot be redeployed from this branch as-is** — it's on local disk today (no `OBJECT_STORAGE_*` vars in `render.yaml` before this branch), and the new guard will refuse to boot until real storage credentials are set. This is intentional — see the checklist below.

### 3. Cookie `SameSite: None` → `Lax` (`apps/api/src/modules/auth/cookies.ts`)

Scoped to owner/staff auth only. Confirmed before changing: `next.config.ts`'s `rewrites()` (the thing that makes `/api/*` same-origin from the browser's perspective) is unconditional, not gated behind `process.env.VERCEL` — identical behavior on Render or Vercel. `customer-cookies.ts` and `guest-session.ts` were already `Lax`; `auth/cookies.ts` was the one outlier still on `None`, a holdover from an earlier period when a browser genuinely called `apps/api` cross-site. This change aligns it with the rest of the codebase rather than introducing a new pattern. Customer-facing cookies (public storefront, custom domains) were deliberately **not** touched — that's a different flow with potentially different cross-origin requirements and wasn't part of what broke login.

### 4. `prisma migrate deploy` off the hot boot path (`apps/api/scripts/start.sh`, `render.yaml`)

Default behavior is **unchanged** — `start.sh` still runs `prisma migrate deploy` on every boot unless `SKIP_STARTUP_MIGRATIONS=true` is explicitly set, which it isn't anywhere in this branch. `render.yaml` gains a `preDeployCommand` (Render only honors this on paid instance types — a documented no-op on the current `plan: free`) and a commented-out `SKIP_STARTUP_MIGRATIONS` line, deliberately left commented with an explicit instruction not to enable it until `preDeployCommand` is confirmed working via a real deploy log on a paid plan. If it's ever enabled prematurely (or `preDeployCommand` silently fails to run), `start.sh` falls back to `prisma migrate status` under `set -e` — refuses to boot rather than silently serving traffic against a stale schema. Verified locally (see Verification below) with a stubbed `prisma` binary: default path calls `migrate deploy`, opt-in path calls `migrate status`, and a simulated pending-migration status correctly aborts startup before the seed step or server ever run.

### 5. Vercel deployment prep (`apps/web/vercel.json`, `docs/runbooks/vercel-deployment.md`)

Additive only — `ordervora-web` in `render.yaml` is untouched and still deploys. `vercel.json` pins `framework: nextjs` explicitly; the runbook documents the Root Directory dashboard setting (not expressible in a repo file), the `API_URL` env var (build-time, read directly — no Docker ARG plumbing needed on Vercel), and one honestly-flagged unverified caveat: `sharp` is in `pnpm-workspace.yaml`'s `ignoredBuiltDependencies`, and this sandbox has no live Vercel build to confirm that's still fine outside Render's Docker build environment.

## Migration risks (recap from pre-flight, now confirmed against the actual diff)

1. **Contained**: the migration-deploy change only changes behavior if `SKIP_STARTUP_MIGRATIONS=true` is set, which nothing in this branch does.
2. **Real, intentional**: the object-storage guard will fail production boot without real `OBJECT_STORAGE_*` credentials configured first — this is the point of the fix, not a bug, but it is a hard prerequisite before this branch can go live.
3. **Low**: cookie change verified same-origin-safe by inspecting `rewrites()`; still worth a real login check against the actual deployed domain before calling this final.
4. **None**: Vercel config and docs are additive; nothing existing was removed.

## Rollback plan

Every change is its own reviewable commit on an unmerged branch. If any single piece needs reverting after review: `git revert` the specific commit — none of these changes have side effects outside their own file (the storage guard and migration change are both gated behind explicit conditions that default to today's behavior).

---

## Environment variable checklist

### Render — `ordervora-api` (existing vars unchanged; new ones from this branch marked ✦)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Supabase connection string (Supavisor pooler, per `lib/prisma.ts`'s existing guidance) |
| `FRONTEND_URL` | yes | Update to the Vercel domain once that migration happens |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | yes | `generateValue: true` in `render.yaml` |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | yes | `15m` / `30d` |
| `COMMERCE_ENCRYPTION_KEY` | yes | 64-char hex, `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | yes | Seeds the platform admin |
| `SMTP_*` | yes for email | Transactional order emails |
| `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`) | yes for AI features | Priority order OpenAI → Anthropic → Gemini |
| `GOOGLE_MAPS_API_KEY` | only for Google Maps import | |
| `SITE_PLATFORM_DOMAIN` | yes | Custom-domain CNAME suffix |
| ✦ `OBJECT_STORAGE_BUCKET` | **yes in production, enforced at boot now** | See Supabase Storage checklist below |
| ✦ `OBJECT_STORAGE_REGION` | yes | Your Supabase project region |
| ✦ `OBJECT_STORAGE_ENDPOINT` | yes | `https://<project-ref>.supabase.co/storage/v1/s3` |
| ✦ `OBJECT_STORAGE_ACCESS_KEY_ID` / `OBJECT_STORAGE_SECRET_ACCESS_KEY` | yes | Storage → S3 Access Keys in Supabase dashboard |
| ✦ `SKIP_STARTUP_MIGRATIONS` | **do not set yet** | Only after `preDeployCommand` is confirmed working on a paid plan |

### Vercel — `ordervora-web` project (new deployment target, all new)

| Variable | Required | Notes |
|---|---|---|
| `API_URL` | yes | Full URL of `ordervora-api`, e.g. `https://ordervora-api-2gkw.onrender.com` |
| `NEXT_PUBLIC_SITE_URL` | yes | The Vercel deployment's domain, or final custom domain |

Do not set `NODE_ENV` manually — Vercel manages it per environment.

### Supabase Storage (feeds the `OBJECT_STORAGE_*` vars above)

1. Storage → New bucket. Keep it **private**.
2. Storage → S3 Access Keys → New access key. These are separate from your database credentials.
3. Project Settings → General → note your project ref and region — they build `OBJECT_STORAGE_ENDPOINT`/`OBJECT_STORAGE_REGION`.

---

## Corrected monthly cost table

| Combination | Cost | Caveats |
|---|---|---|
| Vercel **Hobby** + Render **Starter** (API only, or +Starter web = $14) + Supabase **Free** | **$7–14/mo** | Two real caveats, not footnotes: (a) Vercel Hobby's ToS restricts it to non-commercial use — OrderVora is a paid SaaS, so this is a compliance risk, not just a budget option; (b) **Supabase's free tier pauses the project after ~1 week of inactivity** — a second, independent "wakes up slowly / fails on first request" problem, on top of whatever Render does. Fixing Render alone does not fully fix the reported symptoms if Supabase is still on the free tier. |
| Vercel **Pro** + Render **Standard** + Supabase **Pro** | **$20 + $25 + $25 = $70/mo** | No caveats — every layer (frontend, backend, database) is on a tier that doesn't sleep/pause. This is the actual "fully solved, nothing sleeps anywhere" configuration. |
| Both services on Render **Starter** + Supabase **Free** (or **Pro**) | **$14/mo** (Supabase free, with the same pause caveat above) or **$39/mo** (Supabase Pro) | Cheapest fully-Render option; still needs the Supabase tier decision made explicitly rather than left on free by default if reliability is the actual goal. |
| Vercel **Pro** + Railway (usage-based) + Supabase **Pro** | **$20 + ~$10–25 + $25 ≈ $55–70/mo** | Railway's usage-based pricing makes this an estimate, not a fixed number; still carries the migration-risk-for-no-extra-benefit tradeoff from the original recommendation. |

**New finding worth acting on regardless of which option is picked:** Supabase's own free tier has the same category of problem you're trying to fix on Render — an inactivity pause with a slow wake-up. If Supabase is still on the free tier today, that's worth confirming and likely upgrading (Supabase Pro, $25/mo) as part of this fix, not just Render.

## Verification performed

- `apps/web`: `pnpm typecheck` clean, full test suite **143/143 passing** (11 new tests: 6 for `api.ts` timeout/error-mapping, 5 for `server-api.ts`).
- `apps/api`: `pnpm typecheck` clean, storage/cookie test files passing in isolation and as part of the full auth/storage module runs (12 new tests for the storage guard, 3 new for the cookie change).
- `render.yaml` parsed successfully as valid YAML after edits.
- `start.sh` verified with a stubbed `prisma` binary: default path calls `migrate deploy`; `SKIP_STARTUP_MIGRATIONS=true` calls `migrate status` instead; a simulated pending-migration status correctly aborts startup (non-zero exit under `set -e`) before the seed step or server start — the safety net actually works, not just reads plausibly.

Not verified (requires infrastructure this sandbox doesn't have access to): a live Vercel build, a live Render paid-plan `preDeployCommand` run, and a live login against the actual deployed domains. These are the manual checks called for in `docs/runbooks/vercel-deployment.md`'s "Before cutting DNS over" section.
