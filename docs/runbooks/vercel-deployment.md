# Deploying apps/web to Vercel

Prepared alongside `docs/reports/INFRA_HARDENING_LOGIN_FIX.md` — apps/api stays on Render throughout. This is a **preparation** doc: creating the Vercel project below produces a working preview deployment without touching production traffic (`ordervora-web` on Render keeps serving until you deliberately cut DNS over).

## Why this is low-risk for this codebase specifically

`apps/web/next.config.ts` already has Vercel-aware handling that predates this doc:

- `output: process.env.VERCEL ? undefined : "standalone"` — Vercel sets `VERCEL=1` automatically during its build, so the Docker-oriented `standalone` output (meant for `apps/web/Dockerfile`'s runtime stage) is skipped there with no action needed.
- `outputFileTracingRoot` already points at the pnpm workspace root, which Vercel's own dependency tracing also needs for a monorepo.
- `rewrites()` (the same-origin `/api/*` → `apps/api` proxy) is **unconditional** — it runs identically on Vercel as it does today on Render. This is what keeps the login flow same-origin (see the cookie `SameSite` reasoning in `apps/api/src/modules/auth/cookies.ts`) regardless of which platform serves `apps/web`.

## Vercel project setup (dashboard steps — not expressible in a repo file)

1. New Project → import this repository.
2. **Root Directory**: `apps/web`. Vercel then finds `apps/web/vercel.json` (already added — pins `framework: nextjs` explicitly) and, because it also walks up and finds the workspace root's `pnpm-lock.yaml` + `packageManager: pnpm@10.33.0` in `package.json`, installs with pnpm from the true monorepo root automatically — no custom install/build command needed for this repo.
3. Leave Build Command / Install Command / Output Directory on their framework defaults unless a real build failure says otherwise — don't pre-guess an override here.

### A known caveat worth watching on the first real build

`pnpm-workspace.yaml` lists `sharp` under `ignoredBuiltDependencies` — pnpm 10 doesn't run its native postinstall/build script automatically. This has worked on Render's Docker build so far (verify why — likely a prebuilt binary already satisfies it there); it's flagged here specifically because a Vercel build is a different environment and hasn't been exercised yet. If the first Vercel build fails or an image-processing code path errors at runtime, this is the first place to look — not a reason to expect trouble, just an honest gap in verification this sandbox couldn't close (no live Vercel access).

## Environment variables (Vercel project settings → Environment Variables)

| Variable | Value | Notes |
|---|---|---|
| `API_URL` | `https://<your-render-api-domain>` (e.g. `https://ordervora-api-2gkw.onrender.com`, or the final custom API domain) | **Build-time** — both `next.config.ts`'s rewrite manifest and `lib/server-api.ts` read this. Unlike the Docker path (which assembles this from `API_URL_SCHEME`/`API_HOST` build ARGs), Vercel has no Dockerfile — set `API_URL` directly, whole. |
| `NEXT_PUBLIC_SITE_URL` | Your Vercel deployment's domain, or final custom domain once attached | Used by `sitemap.ts`/`robots.ts`/OG tags. Inlined at build time like every `NEXT_PUBLIC_*` var. |

Do not set `NODE_ENV` — Vercel manages that itself per environment (Production/Preview/Development), and setting it manually can conflict with Vercel's own build pipeline.

## Before cutting DNS over

1. Deploy with the above settings — this produces a `*.vercel.app` preview URL without affecting the live domain.
2. Walk the full flow against that preview URL: login, setup wizard, dashboard, placing a test order.
3. Update `FRONTEND_URL` on `ordervora-api` (Render) to the Vercel domain you'll actually use — this only matters for the small set of non-browser callers `app.ts`'s CORS check gates (the primary browser flow is same-origin-proxied and unaffected either way), but it should be correct before go-live.
4. Only once 2–3 are confirmed: point your real domain's DNS at Vercel (or attach it directly in the Vercel project), then decommission `ordervora-web` on Render after DNS TTL expires. `render.yaml`'s `ordervora-web` service is untouched by this doc — nothing here removes it.
