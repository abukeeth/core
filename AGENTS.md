# AGENTS.md

## Cursor Cloud specific instructions

OrderVora is a pnpm monorepo (Node >=20, pnpm 10.33) with two apps:

- `apps/api` — Express + Prisma backend on port **4000** (`tsx watch src/index.ts`).
- `apps/web` — Next.js 16 frontend on port **3000** (`next dev`). The browser calls same-origin `/api/*`, which Next.js proxies to `API_URL` (the backend).

Standard scripts live in the root and per-app `package.json` (`pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, all fanning out via `pnpm -r`). Run them from the repo root.

### Startup caveats (non-obvious)

- **PostgreSQL is required and does NOT auto-start.** The update script does not (and must not) start it. Before running the API, tests-that-touch-the-DB, or migrations, start the local cluster:
  ```
  sudo pg_ctlcluster 16 main start
  ```
  A local `ordervora` database already exists; connection is `postgresql://postgres:postgres@localhost:5432/ordervora` (see `apps/api/.env`).
- **`.env` files are gitignored** and were created during environment setup (they live in the VM snapshot, not the repo). `apps/api/.env` has real dev-only `JWT_ACCESS_SECRET` / `COMMERCE_ENCRYPTION_KEY` values (the latter must be 64-hex or the API refuses to boot); `apps/web/.env` sets `API_URL=http://localhost:4000`. If these are ever missing, recreate them from the `.env.example` files, generating secrets with `openssl rand -hex 32`.
- **Prisma seed is not wired into `prisma.config.ts`**, so `prisma db seed` reports "No seed command configured". Run the seed directly instead:
  ```
  pnpm --filter api exec tsx prisma/seed.ts
  ```
  It seeds the ADMIN user (`ADMIN_EMAIL`/`ADMIN_PASSWORD` from `.env`) and the theme catalog. Apply migrations with `pnpm --filter api exec prisma migrate deploy`.
- **Optional services are unset by default and have local fallbacks**: Redis (`REDIS_URL`) → in-process rate limiting; object storage → local disk; AI providers (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`) → required only to exercise AI menu-import / website-builder flows; SMTP, Stripe, Google Maps, Sentry → only needed for their specific features.

### Verified working

`pnpm dev` runs both apps; registering an owner at `/register` creates a `RESTAURANT_OWNER` and redirects into the 7-step `/setup` wizard end-to-end.
