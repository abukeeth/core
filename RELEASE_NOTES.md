# Release Notes — v0.1.0-foundation

## Sprint 01 Summary

Sprint 01 established the foundation of the Ordervora MVP monorepo: a pnpm
workspace containing a Next.js frontend and an Express + Prisma backend,
with working CI, linting, and a health-check endpoint. The repository had
no prior history, so this sprint scaffolded the project from scratch and
verified every part of it before merging to `main`.

No product features (ordering, menus, auth, etc.) were built in this
sprint — this is infrastructure/foundation only. Sprint 02 has not been
started.

## Features Completed

- **Monorepo workspace**: pnpm workspace (`apps/*`, `packages/*`) with a
  single root lockfile and shared root scripts (`lint`, `typecheck`,
  `build`, `dev`, `test`).
- **Frontend (`apps/web`)**: Next.js 16 App Router app, TypeScript, Tailwind
  CSS v4, ESLint 9 flat config (`eslint-config-next`). Builds to static
  pages with Turbopack.
- **Backend (`apps/api`)**: Express 5 app with a `GET /health` endpoint
  returning `{ status, uptime, timestamp }`. TypeScript compiled via `tsc`,
  dev loop via `tsx watch`.
- **Database layer**: Prisma 7 schema (`apps/api/prisma/schema.prisma`)
  with a foundational `User` model, `PrismaClient` wired up through the
  `@prisma/adapter-pg` driver adapter (`apps/api/src/lib/prisma.ts`).
- **CI** (`.github/workflows/ci.yml`): on every push/PR to `main`, installs
  dependencies, validates and generates the Prisma client, lints,
  typechecks, and builds both apps.
- **Verification report** (`SPRINT_01_REPORT.md`): a full 14-point
  checklist verifying package.json validity, workspace config, builds,
  Prisma schema, Tailwind, ESLint, CI, imports, dependencies, duplicate
  files, TypeScript config, and the health endpoint.

## Architecture Decisions

- **pnpm workspaces** over a single flat package or Turborepo/Nx — the
  project is small enough that plain pnpm workspace globs (`apps/*`,
  `packages/*`) give project isolation without extra tooling overhead.
- **Separate Next.js frontend and Express backend** (rather than Next.js
  API routes) — keeps the API deployable and scalable independently of the
  frontend, and matches a conventional two-service architecture for the
  MVP.
- **Prisma 7 with driver adapters** — this project intentionally pins the
  current Prisma major version rather than an older one. Prisma 7 removed
  inline `datasource.url` support in `schema.prisma`; connection
  configuration now lives in `apps/api/prisma.config.ts`, and
  `PrismaClient` is constructed with an explicit `@prisma/adapter-pg`
  adapter instead of relying on the schema's connection string directly.
  This is a deliberate choice to start on the current major version rather
  than begin on a version that will require an early migration.
  **Superseded in Sprint 02**: the `prisma-client` generator (which wrote
  TS source to `apps/api/generated/prisma`) was replaced by the classic
  `prisma-client-js` generator — see the Sprint 02 section below for why.
- **ESLint flat config** (`eslint.config.mjs`) in both apps, matching the
  current ESLint 9 default and Next.js 16's own tooling, instead of the
  legacy `.eslintrc` format.
- **TypeScript `NodeNext` module resolution** in `apps/api` — required so
  the `exports`-mapped `@prisma/client/runtime/client` subpath and the
  generated Prisma client (which is now generated as TypeScript source
  under `apps/api/generated/prisma`) both resolve and compile correctly.

## Known Limitations

- **No database is provisioned.** The Prisma schema validates and the
  client generates, but no Postgres instance is connected in this
  environment; `apps/api/.env` holds a placeholder `DATABASE_URL` only.
  Actual query execution against a live database has not been exercised.
- **No automated tests yet.** The `test` script exists at the root
  (`pnpm -r --if-present test`) but neither app has test files or a test
  runner configured.
- **No authentication, ordering, or business-domain features.** The
  `User` model is a placeholder to prove the Prisma toolchain works, not a
  designed data model.
- **CI does not run against a real database** — it validates the schema
  and generates the client, but does not run migrations or integration
  tests against Postgres.
- **Environment-specific Prisma download quirk**: in some sandboxed/proxied
  environments, downloading Prisma's `schema-engine` binary from
  `binaries.prisma.sh` can be reset by a restrictive egress proxy. This is
  not a code defect (a direct `curl` through the same proxy succeeds) and
  does not affect GitHub Actions, which has open network access.

## Environment Requirements

- **Node.js**: 22.x (matches `engines.node: >=20` in the root
  `package.json`; developed and verified against Node 22.22.2).
- **pnpm**: 10.x (pinned via `packageManager: pnpm@10.33.0` in the root
  `package.json`).
- **PostgreSQL**: required only to actually run the API against a real
  database (not required to build, lint, or typecheck). Set
  `DATABASE_URL` in `apps/api/.env` (see `apps/api/.env.example`).

## Commands to Run the Project

```bash
# from the repo root
pnpm install

# lint / typecheck / build everything
pnpm run lint
pnpm run typecheck
pnpm run build

# run the frontend (http://localhost:3000)
pnpm --filter web dev

# run the backend (http://localhost:4000), then:
# curl http://localhost:4000/health
pnpm --filter api dev

# Prisma (from apps/api, requires DATABASE_URL to be set)
pnpm --filter api exec prisma validate
pnpm --filter api exec prisma generate
```

---

# Release Notes — v0.2.0-auth

## Sprint 02 Summary

Sprint 02 built platform authentication on top of the Sprint 01
foundation: real accounts and login/session handling for the three
internal roles that operate the platform — **Restaurant Owner**,
**Restaurant Staff**, and **Platform Admin**. Customer-facing
authentication and all restaurant/menu/order domain modeling remain
out of scope, deferred to a later sprint, per the approved Sprint 02
plan.

## Authentication Features

- **Self-registration for Restaurant Owners** — `POST /api/auth/register`
  creates a `RESTAURANT_OWNER` account and immediately issues a session
  (no separate login step required after signup).
- **Login / session** — `POST /api/auth/login` verifies credentials and
  issues a short-lived JWT access token plus a long-lived, DB-backed
  refresh token, both as `httpOnly` cookies.
- **Session refresh with rotation** — `POST /api/auth/refresh` exchanges
  a valid refresh token for a new access+refresh pair, revoking the old
  refresh token in the same operation.
- **Logout** — `POST /api/auth/logout` revokes the current refresh token
  and clears both cookies.
- **Current user** — `GET /api/auth/me` returns the authenticated user's
  public profile (`id`, `email`, `name`, `role`).
- **Staff invitation** — `POST /api/auth/staff` lets an authenticated
  `RESTAURANT_OWNER` create a `RESTAURANT_STAFF` account (staff cannot
  self-register).
- **Admin bootstrap** — the single `ADMIN` account is created only via
  `pnpm --filter api exec prisma db seed` (`apps/api/prisma/seed.ts`),
  reading `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` from the
  environment. There is no HTTP path to create or elevate to `ADMIN`.
- **Minimal `apps/web` UI** — `/login`, `/register`, and a protected
  `/dashboard` placeholder that renders the logged-in user's name/role
  and a logout button, enough to exercise the whole flow in a browser.

## Architecture Decisions

- **JWT access token + DB-backed opaque refresh token (hybrid)** —
  stateless verification for most requests, while keeping server-side
  revocability for logout and breach response.
- **httpOnly cookies over `localStorage`** — appropriate for this
  first-party web app; removes an entire class of XSS token-theft risk.
- **argon2id over bcrypt** for password hashing — stronger
  memory-hardness against modern cracking hardware, current OWASP
  recommendation.
- **Role as a single enum field on `User`**, not a join table — correct
  while each account has exactly one role; revisit if/when multi-role or
  multi-tenant needs appear.
- **Admin bootstrap via seed script, not an API route** — removes the
  platform's most powerful role from the HTTP attack surface entirely.
- **`apps/api/src/modules/auth/` layering** (routes → controller →
  service → validation) — keeps `app.ts` a thin composition root and
  establishes the module pattern future domain features (restaurants,
  menus, orders) will follow.
- **Next.js `next.config.ts` rewrite of `/api/*` to the Express API** —
  makes the browser treat all API calls as same-origin, so auth cookies
  set by the API stay first-party to the Next.js origin and are visible
  to Server Components / `proxy.ts` (Next.js 16's renamed
  `middleware.ts`) without extra cross-origin cookie configuration.
- **Reverted the Prisma client generator to `prisma-client-js`** (from
  the newer `prisma-client` used in Sprint 01). The newer generator's
  output contains `import.meta.url`, which is invalid once TypeScript
  compiles it to CommonJS for our `tsc`-built Express server — the
  generated file's `@ts-nocheck` suppresses the compile-time error, so it
  only surfaced as a runtime crash a few seconds after the compiled
  server started. `prisma-client-js` is fully CJS-safe and avoids this
  class of bug; this was confirmed by killing all stray dev processes
  and re-testing the actual compiled `node dist/src/index.js` binary
  directly (an earlier "successful" test had unknowingly hit a leftover
  `tsx watch` dev process instead of the build under test).

## Security Improvements

- Passwords hashed with **argon2id**, never logged or returned in any
  response.
- Refresh tokens stored as a **SHA-256 hash only** — a database read
  compromise doesn't yield usable tokens — and are individually
  revocable.
- **Refresh token rotation with reuse detection**: every refresh
  invalidates the prior token; presenting an already-used refresh token
  revokes all of that user's active sessions (treated as suspected
  theft).
- **No client-controlled roles**: `/register` hardcodes
  `RESTAURANT_OWNER`, `/staff` hardcodes `RESTAURANT_STAFF` server-side —
  `role` is never accepted from request input, and `ADMIN` has no public
  creation path at all.
- **Rate limiting** on `/login` and `/register` (10 requests/min per IP)
  to blunt brute-force/credential-stuffing.
- **Generic authentication errors** (`Invalid email or password`) to
  avoid user enumeration on login; registration still reports "email
  already in use," a deliberate, noted usability trade-off.
- **Input validation** on every auth request body via `zod`.
- **CORS tightened**: Sprint 01's permissive default `cors()` was
  replaced with an explicit `FRONTEND_URL`-based allowlist plus
  `credentials: true`, required for credentialed (cookie-bearing)
  cross-origin requests to work at all.

## Database Changes

- New enum `Role { ADMIN, RESTAURANT_OWNER, RESTAURANT_STAFF }`.
- `User` model replaced the Sprint 01 placeholder: added `passwordHash`,
  made `name` required, added `role` (no default — every account must be
  created with an explicit role by server logic), and added
  `invitedById` (self-relation) recording which Restaurant Owner created
  a given Staff account — a stand-in for a real restaurant/staff linkage
  until a `Restaurant` model exists.
- New `RefreshToken` model: `userId` (FK → `User`), `tokenHash` (unique,
  SHA-256), `expiresAt`, `revokedAt` (nullable), `createdAt`.
- This is the project's first schema change since Sprint 01's
  placeholder `User` model; it has not yet been applied via
  `prisma migrate dev` against a real database (see Known Limitations).

## Known Limitations

- **No live database in this environment.** As in Sprint 01, there is no
  provisioned Postgres instance available here. `prisma validate` and
  `prisma generate` pass, and the compiled server correctly returns
  `401`/`403` for auth/authorization failures and a clean `500` for
  DB-dependent operations (register, login, staff invite) — but
  `prisma migrate dev`, the seed script's actual DB write, and a true
  end-to-end register→login→refresh→logout round trip have not been
  exercised against a real database.
- **Cross-origin cookies in local dev** are handled via the Next.js
  rewrite (see Architecture Decisions) rather than true cross-origin
  cookie configuration; if the API is ever deployed to a genuinely
  different domain than the frontend, this will need revisiting.
- **`invitedById` stands in for a real Restaurant linkage.** When a
  future sprint introduces a `Restaurant` model, this will need a
  follow-up migration to properly scope staff/owners to a specific
  restaurant.
- **No password reset, email verification, 2FA, or OAuth** — explicitly
  deferred per the approved Sprint 02 scope.
- **No customer-facing authentication** — explicitly deferred per the
  approved Sprint 02 scope.
- **The `v0.2.0-auth` tag could not be pushed to the remote** in this
  session: the git proxy used by this environment returns `HTTP 403` for
  any push to `refs/tags/*` (confirmed reproducible and distinct from
  ordinary branch pushes, which succeed) — this is a session/environment
  policy restriction, not a project defect. The tag exists in the local
  repository at the `main` merge commit; pushing it requires a git
  client with direct, non-proxied push access to the remote.

## Verification Results

- `pnpm install`, `pnpm run lint`, `pnpm run typecheck`, and
  `pnpm run build` all pass cleanly at the repo root after the merge to
  `main`.
- `prisma validate` passes against the updated schema.
- The compiled Express server (`node dist/src/index.js`) was confirmed
  stable under sustained requests (30+ seconds, multiple sequential
  calls) after fixing the `import.meta.url`/CommonJS crash — verified
  against the actual compiled binary, not a dev-mode process.
- Manually verified: `GET /health` → `200`; `GET /api/auth/me` without a
  cookie → `401`; `POST /api/auth/staff` without auth → `401`;
  `POST /api/auth/register` with an invalid body → `400` with per-field
  validation errors; `POST /api/auth/register` with a valid body → clean
  `500` (expected — no live database in this environment, not a crash).
- The Next.js `/api/*` rewrite was verified end-to-end: requests to
  `http://localhost:3000/api/auth/register` correctly proxy to the
  Express API on port 4000 and return the same response as calling the
  API directly.
- `/login`, `/register`, and `/dashboard` all render; unauthenticated
  requests to `/dashboard` correctly redirect (`307`) to `/login` via
  `proxy.ts`.
- Not verified in this environment (requires a live Postgres instance):
  `prisma migrate dev`, the seed script's actual database write, and a
  full register→login→refresh→logout round trip returning real session
  cookies.

---

# Release Notes — v0.3.0-restaurant-menu

## Sprint 03 Summary

Sprint 03 introduced the platform's first business-domain, multi-tenant
data model on top of Sprint 02's authentication: restaurants and their
menus. Restaurant Owners can now set up a restaurant profile, and Owners
and Staff can manage its menu catalog (categories and items) — all
strictly scoped to their own restaurant. This also resolved the Sprint 02
`invitedById` stand-in flagged as a known limitation: staff invited by an
owner now inherit a real `restaurantId`, the platform's actual tenant
boundary.

## Restaurant Module

- `apps/api/src/modules/restaurants/` (routes → controller → service →
  validation, matching the `modules/auth` pattern).
- A `RESTAURANT_OWNER` creates exactly one restaurant (`name`,
  `description`, `address`, `phone`, `isPublished`); a second creation
  attempt is rejected.
- `getOwnRestaurantId(userId)` in `restaurant.service.ts` is the single
  function that maps an authenticated user to "their" restaurant — every
  other restaurant/menu controller resolves tenant scope through it
  rather than deriving it independently.
- `RESTAURANT_STAFF` can read the restaurant profile; only the
  `RESTAURANT_OWNER` can update it.
- `ADMIN` gets a separate, read-only `/api/admin/restaurants` listing
  across all restaurants.

## Menu Module

- `apps/api/src/modules/menu/`: `MenuCategory` (name, `sortOrder`) and
  `MenuItem` (name, description, `priceCents`, `isAvailable`,
  `sortOrder`), each scoped to a restaurant, items additionally scoped to
  a category.
- Full CRUD for both categories and items, usable by both
  `RESTAURANT_OWNER` and `RESTAURANT_STAFF` of that restaurant.
- Prices are stored as integer cents (`priceCents`), never floats, to
  avoid rounding bugs; the frontend converts to/from dollars only at the
  display/input layer.
- Deleting a category deletes its items in the same transaction, avoiding
  a foreign-key violation from orphaned items.

## Tenant Isolation

- **Restaurant is the single tenant boundary.** No owner/staff-facing
  endpoint ever accepts a client-supplied `restaurantId` — it is always
  resolved server-side from the authenticated user via
  `getOwnRestaurantId`.
- Every category/item mutation re-verifies `resource.restaurantId ===
  callerRestaurantId` before writing (`findOwnCategory`/`findOwnItem` in
  `menu.service.ts`).
- **IDOR-hardened**: a category or item belonging to a different
  restaurant returns `404` (not `403`) on update/delete — the caller
  can't distinguish "doesn't exist" from "isn't yours."
- Only `ADMIN`, via the clearly separate `/api/admin/*` namespace,
  crosses tenant boundaries, and only read-only.

## API Endpoints

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/api/restaurants` | `RESTAURANT_OWNER` | Create the caller's restaurant (409 if one already exists) |
| GET | `/api/restaurants/me` | `RESTAURANT_OWNER`, `RESTAURANT_STAFF` | Read caller's own restaurant |
| PATCH | `/api/restaurants/me` | `RESTAURANT_OWNER` | Update restaurant profile |
| GET | `/api/admin/restaurants` | `ADMIN` | List all restaurants (read-only) |
| GET | `/api/menu/categories` | `RESTAURANT_OWNER`, `RESTAURANT_STAFF` | List caller's restaurant's categories + items |
| POST | `/api/menu/categories` | `RESTAURANT_OWNER`, `RESTAURANT_STAFF` | Create a category |
| PATCH | `/api/menu/categories/:id` | `RESTAURANT_OWNER`, `RESTAURANT_STAFF` | Update a category (404 if not caller's tenant) |
| DELETE | `/api/menu/categories/:id` | `RESTAURANT_OWNER`, `RESTAURANT_STAFF` | Delete a category and its items |
| POST | `/api/menu/items` | `RESTAURANT_OWNER`, `RESTAURANT_STAFF` | Create a menu item |
| PATCH | `/api/menu/items/:id` | `RESTAURANT_OWNER`, `RESTAURANT_STAFF` | Update a menu item (404 if not caller's tenant) |
| DELETE | `/api/menu/items/:id` | `RESTAURANT_OWNER`, `RESTAURANT_STAFF` | Delete a menu item |

## Frontend Pages

- `apps/web/src/app/dashboard/restaurant/page.tsx` — restaurant profile:
  shows a creation form if none exists yet, else an edit form.
- `apps/web/src/app/dashboard/menu/page.tsx` — menu management: add/
  delete categories, add items, toggle item availability, delete items.
- `apps/web/src/components/dashboard-nav.tsx` — shared nav (Home /
  Restaurant / Menu) reused across all three dashboard pages.
- `apps/web/src/lib/server-api.ts` — a `serverFetch` helper (forwards
  cookies, typed result) reused by all three dashboard server components,
  replacing the one-off fetch that used to live inline in the dashboard
  home page.

## Tests Added

- Introduced `vitest` in `apps/api` (no test runner existed before this
  sprint).
- `restaurant.service.test.ts`: `getOwnRestaurantId` resolution;
  `createRestaurant` rejects a second restaurant for the same owner and
  correctly links the new restaurant to the owner's `User` row in the
  same transaction.
- `menu.service.test.ts`: the core tenant-isolation guarantee —
  updating/deleting a category or item that belongs to a different
  restaurant is rejected (`CategoryNotFoundError`/`ItemNotFoundError`)
  without ever calling the underlying `update`/`delete` — plus a
  same-tenant update succeeding as the positive case.
- All tests run against a mocked Prisma client, so they execute without a
  live database (9/9 passing in this environment).

## Security Improvements

- Tenant scoping resolved exclusively server-side, never trusting
  request bodies/params for `restaurantId`.
- IDOR prevention via uniform `404` responses for cross-tenant resource
  access (see Tenant Isolation).
- Restaurant profile edits restricted to `RESTAURANT_OWNER`; menu content
  management open to both `RESTAURANT_OWNER` and `RESTAURANT_STAFF` of
  that restaurant, matching real-world staff duties.
- All new endpoints validate input via `zod` (name length, non-negative
  integer `priceCents`, etc.), consistent with the Sprint 02 pattern.
- No new public/unauthenticated endpoints — every route added this
  sprint requires `requireAuth`.

## Known Limitations

- **No live database in this sandbox** (recurring from Sprints 01–02):
  `prisma migrate dev` and a real end-to-end CRUD round trip (create
  restaurant → add menu → verify persisted data) have not been exercised
  against a live Postgres instance here. The new unit tests cover the
  tenant-isolation logic itself without needing one.
- **One restaurant per owner** — enforced via a unique constraint on
  `Restaurant.ownerId`; multiple restaurants per owner is explicitly
  deferred.
- **No customer-facing browsing/ordering, payments, or order state
  machine** — explicitly out of scope, to be built in a later sprint now
  that restaurants and menus exist as data.
- **No menu item modifiers/variants, image uploads, or drag-and-drop
  reordering** — flat items with a plain numeric `sortOrder`, by design.
- **Pre-existing Sprint 02 staff accounts** (if any existed in a real
  deployment) would need a data backfill of `restaurantId` — not a
  concern in this sandbox since no rows exist without a live database.
- **The `v0.3.0-restaurant-menu` tag could not be pushed** to the remote
  in this session — the git proxy returns `HTTP 403` for any push to
  `refs/tags/*` (confirmed reproducible again this sprint, and distinct
  from ordinary branch pushes, which succeed). This is a session/
  environment policy restriction, not a project defect. The tag exists in
  the local repository at the `main` merge commit.

## Verification Results

- `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, and
  `pnpm run build` all pass cleanly at the repo root after the merge to
  `main`.
- `prisma validate` and `prisma generate` succeed against the updated
  schema (using the `prisma-client-js` generator, per the Sprint 02 fix).
- `vitest run` in `apps/api`: 2 test files, 9 tests, all passing.
- The compiled Express server (`node dist/src/index.js`) was confirmed
  as the genuine running binary (not a leftover dev process) and stayed
  stable while being exercised.
- Manually verified: every new restaurant/menu endpoint returns `401`
  when called without authentication (`POST /api/restaurants`,
  `GET /api/admin/restaurants`, `GET /api/menu/categories`,
  `POST /api/menu/categories`), confirming `requireAuth` is applied
  uniformly.
- `pnpm run build` for `apps/web` registers all new routes
  (`/dashboard/restaurant`, `/dashboard/menu`) as expected.
- Not verified in this environment (requires a live Postgres instance):
  an authenticated end-to-end walkthrough (register → create restaurant
  → add category/items → confirm cross-tenant `404` against a second
  seeded owner) and `prisma migrate dev`.

---

# Release Notes — v0.4.0-import-engine

## Sprint 04 Summary

Sprint 04 built the **OrderVora Import Engine**: a way to populate a
restaurant's menu from an uploaded file instead of typing every category
and item by hand. Seven import sources are named as the long-term target
(PDF, Images, Website URL, Google Maps, DoorDash, Uber Eats, Grubhub);
per the approved plan, only **PDF and Image import are implemented**
this sprint. The other five ship as real, registered adapters that
report themselves as not-yet-implemented, so turning one on later means
writing one adapter class and registering it — no route, schema, or
job-lifecycle changes.

## Architecture: One Interface, One Registry, One Table

- **`ImportAdapter` interface** (`apps/api/src/modules/imports/types.ts`):
  `{ sourceType, implemented, extract(input) }`. Every source, present or
  future, implements this same contract — the request path never
  branches on which source is being used.
- **`ImportAdapterRegistry`** (`adapters/registry.ts`): a `Map` keyed by
  source type, populated once at startup with all seven adapters. The
  controller resolves the adapter generically and checks its
  `implemented` flag to decide whether to proceed or return `501` —
  there is no hardcoded list of "which sources currently work" anywhere
  in the request path.
- **One `ImportJob` table** for all seven sources (see Database Changes)
  — every source produces the same `ExtractedMenuData` shape once
  extracted, so no new table is needed as sources are added.

## PDF and Image Import (Implemented)

- Both funnel through a shared extraction core,
  `extractMenuFromImages()` (`vision-extractor.ts`), which sends one or
  more page images to Claude's vision API (`@anthropic-ai/sdk`) with a
  structured-output prompt and validates the response with `zod` before
  trusting any of it.
- `PdfImportAdapter` renders each PDF page to a PNG via `pdf-to-img`,
  then treats the result identically to a plain image upload —
  `ImageImportAdapter` passes the uploaded image straight through. This
  is the concrete code-reuse the "extensible" requirement asked for.
- Uploads are handled by `multer` (in-memory, MIME-type allowlist, size
  cap) and never write straight into the live menu: every job lands in
  `AWAITING_REVIEW` with its extracted data, and only an explicit
  `POST /api/imports/:id/approve` commits it — reusing Sprint 03's
  `createCategory`/`createItem` (`modules/menu/menu.service.ts`) so the
  import engine doesn't duplicate the existing tenant-scoping
  guarantees.

## Deferred Sources: Website, Google Maps, DoorDash, Uber Eats, Grubhub

- Each has a real class in `apps/api/src/modules/imports/adapters/`,
  registered in the same registry, correctly typed against the same
  `ImportAdapter` interface, with `implemented: false`.
- Calling `.extract()` on any of them rejects with `NotImplementedError`;
  `POST /api/imports` for any of these five source types returns a
  synchronous `501 Not Implemented` — no job row is even created.
- DoorDash, Uber Eats, and Grubhub adapters carry an explicit code
  comment flagging that a real implementation would likely require
  scraping (no public partner API for this use case exists), which
  risks violating those platforms' Terms of Service — a legal/product
  decision for whoever builds those adapters later, not resolved by this
  sprint's interface design.

## Database Changes

- New enum `ImportSourceType { PDF, IMAGE, WEBSITE, GOOGLE_MAPS,
  DOORDASH, UBER_EATS, GRUBHUB }` — all seven listed now so the column
  never needs a migration when a new source is turned on.
- New enum `ImportStatus { PENDING, PROCESSING, AWAITING_REVIEW,
  APPROVED, REJECTED, FAILED }`.
- New model `ImportJob`: `restaurantId` (FK), `createdById` (FK →
  `User`), `sourceType`, `status` (default `PENDING`), `sourceFilePath`
  (file-based sources), `sourceUrl` (reserved for URL-based sources),
  `extractedData` (`Json?`), `errorMessage`, `reviewedAt`.

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/imports` | Create a job (`multipart/form-data`: `sourceType` + `file`). `202` for PDF/Image; `501` for the five deferred sources |
| GET | `/api/imports` | List the caller's restaurant's import jobs |
| GET | `/api/imports/:id` | Get one job, including `extractedData` once ready (`404` if not caller's tenant) |
| POST | `/api/imports/:id/approve` | Commit `extractedData` into real `MenuCategory`/`MenuItem` rows; sets `APPROVED` |
| POST | `/api/imports/:id/reject` | Discard the extraction; sets `REJECTED` |

All require `requireAuth` + `requireRole(RESTAURANT_OWNER,
RESTAURANT_STAFF)`, tenant-scoped via the existing `getOwnRestaurantId`.

## Frontend Pages

- `apps/web/src/app/dashboard/import/page.tsx` — upload form (PDF/Image
  enabled; the other five shown disabled with a "coming soon" label,
  reflecting the real backend state) plus a list of past import jobs.
- `apps/web/src/app/dashboard/import/[id]/page.tsx` — review screen:
  extracted categories/items read-only, with Approve/Reject actions.

## Tests Added

- `adapters/registry.test.ts` — all seven sources resolve from the
  registry; PDF/Image report `implemented: true`, the other five report
  `false`; a stub adapter's `.extract()` rejects with
  `NotImplementedError`. (This test caught a real bug: the stub
  adapters' `extract()` methods were missing `async`, so they threw
  synchronously instead of returning a rejected promise — fixed during
  this sprint.)
- `import.service.test.ts` — tenant isolation (approving/rejecting a job
  from a different restaurant returns `404`), rejecting a job that isn't
  `AWAITING_REVIEW`, and the approve flow committing categories/items
  with the correct `restaurantId`.
- `vision-extractor.test.ts` — a malformed AI response is rejected by
  the `zod` schema rather than silently accepted; the happy path parses
  correctly. The Anthropic client is fully mocked — no real API call.
- All 21 tests (5 files) run against mocked Prisma/Anthropic clients, no
  live database or API key required.

## Security Improvements

- Upload validation: MIME-type allowlist and a size cap enforced by
  `multer` before any adapter sees the buffer; oversized/wrong-type
  uploads are rejected before processing.
- Tenant scoping resolved exclusively server-side, exactly like the
  restaurant/menu modules — never accepted from the client; cross-tenant
  job access returns `404`, not `403`.
- AI-extracted content is never trusted implicitly: approval still goes
  through `menu.service.ts`'s existing validation (name length,
  non-negative integer `priceCents`).
- Uploaded files are stored outside any web-servable path and are never
  executed.
- `ANTHROPIC_API_KEY` stays server-side only.
- `POST /api/imports` is rate-limited to bound AI API cost exposure per
  account.

## Known Limitations

- **No live database or Anthropic API key in this sandbox** (recurring
  constraint from every prior sprint): the actual extract → review →
  approve round trip against a real PDF/image has not been exercised
  here. Unit tests cover the tenant-scoping, approval-gating, and
  response-validation logic with mocks in its place.
- **Review is approve/reject only, not inline-editable** — a v1
  limitation; correcting an AI extraction error currently means
  rejecting and re-uploading, not editing in place.
- **No real background job queue** — the MVP `ImportJobRunner` runs
  in-process; the interface is the seam for swapping in a real queue
  (BullMQ/SQS) later without touching the controller.
- **No import job retention/cleanup policy** — uploaded files and job
  rows accumulate with no expiry, by design deferred.
- **Website/Google Maps/DoorDash/Uber Eats/Grubhub have no real
  extraction logic** — interfaces and stubs only, as scoped.

## Verification Results

- `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, and
  `pnpm run build` all pass cleanly at the repo root after the merge to
  `main`.
- `prisma validate` and `prisma generate` succeed against the updated
  schema.
- `vitest run` in `apps/api`: 5 test files, 21 tests, all passing.
- The compiled Express server (`node dist/src/index.js`) was confirmed
  as the genuine running binary and stayed stable while being
  exercised.
- Manually verified: every new import endpoint (`POST /api/imports`,
  `GET /api/imports`, `GET /api/imports/:id`,
  `POST /api/imports/:id/approve`) returns `401` when called without
  authentication.
- `pnpm run build` for `apps/web` registers the new routes
  (`/dashboard/import`, `/dashboard/import/[id]`) as expected.
- Not verified in this environment (requires a live Postgres instance
  and a real `ANTHROPIC_API_KEY`): an actual PDF/image upload completing
  extraction, the `501` response for a deferred source end-to-end, and a
  real approve-into-menu round trip.

---

# Release Notes — Sprint 05: Website Import + Google Maps Import

## Sprint 05 Summary

Sprint 05 turned two of Sprint 04's five stub import sources into real,
working adapters — **Website** and **Google Maps** — proving out the
"adding a source is one adapter file" extensibility claim the Import
Engine was designed around. DoorDash, Uber Eats, and Grubhub remain
untouched stubs. No `ImportJob` schema migration was needed for either
new source, confirming the Sprint 04 design: `sourceUrl` already existed
unused, and `extractedData` is already a JSON column.

## Website Import

`WebsiteImportAdapter` fetches a restaurant's menu page once and extracts
from **both** its text content and any candidate menu images embedded in
it — not one or the other:

- `cheerio` parses the fetched HTML to produce readable text (stripping
  `<script>`/`<style>`/nav/footer noise) and to collect every on-page
  `<img>` as a candidate (`apps/api/src/modules/imports/adapters/website/parse-page.ts`).
  Heading association is computed by walking the document in order, so
  an image several containers deep under a "Menu" heading is still
  correctly associated with it.
- Page text goes through a new `extractMenuFromText`; the top-ranked
  candidate images (see Image Ranking Heuristic below) go through
  Sprint 04's existing `extractMenuFromImages` unchanged — the concrete
  reuse point between the two extraction paths.
- Both results are combined into one `ExtractedMenuData` via a new
  `mergeExtractedMenuData` helper.
- A single bad image (fetch failure, disallowed host, unsupported
  content) or a failed text extraction doesn't fail the whole import —
  each extraction attempt is caught independently, and whatever
  succeeds is still merged and sent to review.
- Number of images processed per page is capped by
  `IMPORT_WEBSITE_MAX_IMAGES` (default 5).

## Google Maps Import

`GoogleMapsImportAdapter` accepts either a raw Google Place ID or a Maps
URL (including `maps.app.goo.gl` short links, resolved via redirect):

- `resolve-place-id.ts` handles the common URL shapes (direct Place ID,
  `place_id`/`query_place_id` query params, a `ChIJ`-style ID embedded
  anywhere in the URL, short-link redirect resolution) but is explicitly
  isolated in one function since Google's URL formats aren't a stable
  public contract — see Known Limitations.
- `places-client.ts` calls the Google Places API (New) directly via
  plain `fetch` — Place Details for profile fields (name/address/phone)
  and photo references, and Photo Media to fetch actual photo bytes. No
  Google SDK dependency was added for two endpoints.
- Google's Places API has **no itemized-menu endpoint** — any menu
  content comes from running up to 3 listing photos through the
  existing `extractMenuFromImages`, exactly like the Website adapter's
  image path. Results across profile + all photos are combined via the
  same `mergeExtractedMenuData` helper used by the Website adapter.
- A single unavailable/failed photo doesn't fail the whole import.

## businessProfile Changes

`ExtractedMenuData` gained an optional `businessProfile`
(`name?`/`address?`/`phone?`) — named generically rather than
"restaurant profile" per explicit direction, so the import engine's data
shape isn't tied to one business type as more sources are added later.
Approving a job whose `extractedData.businessProfile` is present now
also updates the restaurant's profile fields (via a new
`updateRestaurantById` in `restaurant.service.ts`), in addition to
creating any extracted menu categories/items — reusing Sprint 03's
existing validation (`updateRestaurantSchema`) rather than duplicating
it. The review page previews these fields before approval so the
reviewer knows what will change.

## SSRF Protection

Both new sources fetch a server-side URL the caller influences (directly
for Website, indirectly via short-link resolution for Google Maps), so a
shared guard, `safeFetch` (`apps/api/src/lib/safe-fetch.ts`), was added
and is mandatory for every such outbound call — including the Website
adapter's embedded-image fetches, which go through it exactly like the
page fetch itself rather than being treated as "already trusted" just
because the URL came from a page already fetched. `safeFetch`:

- Rejects non-http(s) URL schemes.
- Resolves DNS and rejects private/loopback/link-local/CGNAT/reserved
  ranges, including the `169.254.169.254` cloud metadata endpoint.
- Re-validates the target of every redirect hop (not just the original
  URL), capped at 3 redirects.
- Enforces a request timeout and a maximum response size, both via a
  streamed read with a byte-count cap (not relying solely on
  `Content-Length`, which a server could omit or misreport).
- **Known residual risk**: this checks the resolved address at lookup
  time but doesn't pin the connection to that exact address, so a
  DNS-rebinding attack (the hostname resolving differently between the
  check and the actual request) isn't defended against — noted directly
  in the code and called out here rather than overclaiming full
  protection.
- The Google Places API calls themselves use plain `fetch` (not
  `safeFetch`), since their host (`places.googleapis.com`) is fixed and
  trusted, not derived from caller input — `safeFetch` is reserved for
  genuinely attacker-influenced URLs.

## Image Ranking Heuristic

`rank-menu-images.ts` scores candidate on-page images using alt text,
the nearest preceding heading's text, the filename, and declared
width/height for menu-related signals (`menu`, `food`, `dish`, category
names, etc.) versus non-menu signals (`logo`, `icon`, `favicon`,
`banner`, etc.), plus a size heuristic favoring larger images over
icon-sized ones. Per explicit direction, this **ranks rather than
filters**: even when nothing scores well, the top-ranked candidates up
to the configured cap are still processed, so a page with no
obviously-labeled menu image doesn't silently yield zero image
candidates — the heuristic influences priority, not inclusion.

## API/Frontend Changes

- No new routes. `POST /api/imports` now also accepts
  `sourceType: WEBSITE | GOOGLE_MAPS` with a `sourceUrl` form field
  instead of a file — the same multipart body, since `multer` parses
  text fields whether or not a file is attached.
- `ImportAdapter` gained `readonly inputKind: "file" | "url"` so
  `import.controller.ts` decides whether to require a file upload or a
  `sourceUrl` by reading the registered adapter's declared input kind —
  never a hardcoded per-source-type list, the same extensibility pattern
  Sprint 04 used for the `implemented` flag.
- `apps/web`'s upload form: Website and Google Maps moved from disabled
  to enabled, with a URL text input replacing the file input for these
  two sources; DoorDash/Uber Eats/Grubhub remain visibly present but
  disabled.
- The import review page shows a restaurant-profile preview section
  whenever `extractedData.businessProfile` is present.

## Tests Added

All new tests run against mocked Prisma/Anthropic/Places-API/`safeFetch`
— no live network, database, or API keys required, consistent with
every prior sprint:

- `safe-fetch.test.ts` — rejects non-http(s) schemes, private/loopback/
  link-local IPs, and the cloud metadata endpoint; rejects a redirect
  chain that points at a disallowed address partway through; enforces
  both the `Content-Length`-declared and the streamed byte caps.
- `rank-menu-images.test.ts` — proves ranking rather than filtering,
  including the case where no candidate has any positive signal.
- `merge-extracted-data.test.ts` — concatenates categories across
  results in order; fills `businessProfile` fields from the first
  result that has each one; handles empty-categories results.
- `vision-extractor.test.ts` — extended with `extractMenuFromText`
  coverage (valid response including `businessProfile`, malformed
  response rejected).
- `website.adapter.test.ts` — text-only pages, text+image merging, the
  `IMPORT_WEBSITE_MAX_IMAGES` cap, and a failed image not sinking the
  whole import.
- `resolve-place-id.test.ts`, `places-client.test.ts`,
  `google-maps.adapter.test.ts` — Place ID resolution (direct ID, query
  param, embedded `ChIJ` pattern, short-link redirect), Places API
  response mapping, and the photo-count cap / partial-failure handling.
- `registry.test.ts` and `import.service.test.ts` updated: Website and
  Google Maps now assert `implemented: true`/`inputKind`; a new
  `approveJob` case confirms `businessProfile` is applied via
  `updateRestaurantById` when present, and left untouched when absent.
- Total: 64 tests across 12 files in `apps/api` (up from 21 across 5 in
  Sprint 04).

## Known Limitations

- **No live database, network egress, Anthropic key, or Google Maps API
  key in this sandbox** (recurring constraint): the actual fetch →
  extract → review → approve round trip for either source, and the
  live SSRF-rejection/`501` behaviors, can't be exercised end-to-end
  here — covered by unit tests with mocks instead.
- **Google Maps URL parsing is inherently fragile** — Google doesn't
  publish a stable contract for share-link formats; `resolvePlaceId`
  will need maintenance as those formats drift, and a URL that doesn't
  match one of the handled shapes requires passing the Place ID
  directly instead.
- **DNS-rebinding is not defended against** by `safeFetch` (see SSRF
  Protection above) — a known, documented residual risk, not silently
  assumed away.
- **Website import is static-HTML-only** — no headless browser
  rendering, so JS-rendered single-page-app menus yield a thin or empty
  extraction (not a crash; the human review step catches it).
- **Google Maps menu-photo extraction is best-effort by design** — most
  listings don't have an actual menu photo, so many Google Maps imports
  will yield a `businessProfile` with zero categories/items. Expected
  behavior, not a bug.
- **Review remains approve/reject only**, not inline-editable — carried
  over from Sprint 04, unchanged this sprint.
- **DoorDash, Uber Eats, and Grubhub are unaffected** — still stubs,
  still `501`, untouched this sprint.

## Verification Results

- `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, and
  `pnpm run build` all pass cleanly at the repo root after the merge to
  `main`.
- `prisma validate` passes — schema is unchanged this sprint, confirming
  no migration was needed.
- `vitest run` in `apps/api`: 12 test files, 64 tests, all passing.
- The compiled Express server (`node dist/src/index.js`) was confirmed
  as the genuine running binary and stayed stable while being
  exercised.
- Manually verified: `POST /api/imports` (Website and DoorDash source
  types) returns `401` when called without authentication, confirming
  `requireAuth` is applied uniformly ahead of the source-type/`501`
  check.
- `pnpm run build` for `apps/web` continues to register the import
  routes with the updated upload form.
- Not verified in this environment (requires a live Postgres instance,
  network egress, an `ANTHROPIC_API_KEY`, and a `GOOGLE_MAPS_API_KEY`):
  a real website fetch and extraction, a real Google Places API call, a
  live SSRF rejection against an actual private address, and a real
  approve-into-menu round trip for either source.

# Release Notes — Sprint 06: AI Website Builder

## Sprint 06 Summary

Sprint 06 gives a restaurant owner a one-click path from an imported menu
to a published, real, rendered restaurant website. It implements the full
approved Sprint 06 specification: a Theme Engine with a curated catalog
across three style families, deterministic AI-driven theme matching, an
AI Generator pipeline that produces three complete design variations per
generation batch, a five-dimension AI Website Score with ranked one-click
fixes, a constrained draft editor, and — added in a review follow-up once
the approved spec's own build order was checked line-by-line — the Layout
Engine and public component library that actually renders `SiteDefinition`
JSON into real HTML, plus static site generation at publish, a live
preview system, and Host-based public serving.

This sprint shipped in two passes on the same branch:

1. **First pass**: Theme Engine, AI Generator (Brand Analysis, content
   generation, theme matching), AI Website Score, constrained editor,
   publish/rollback/domain/contact-form data-layer workflow.
2. **Review follow-up**: the reviewer asked whether "no public site
   renderer" was an approved boundary of the spec or a gap. Re-reading the
   spec's own "Suggested build order within the sprint" showed the Layout
   Engine + component library listed as step 2 of *this* sprint's build
   order, not deferred to a later one — so it was implemented before this
   sprint was approved for merge.

## Theme Engine

- 8 curated themes across three style families — **Luxury** (`fine-dining`,
  `elegant-dark`), **Modern** (`modern-bistro`, `street-food`, `coastal`),
  **Minimal** (`cafe`, `casual-family`, `rustic-minimal`) — each carrying
  design tokens (color seed, typography pairing, radius, motion, type-scale
  ratio), component variants (hero style, menu layout), an allowed home-page
  section order, a personality vector, cuisine affinities, and hard
  constraints (e.g. a minimum photo count for photo-dependent themes).
- Theme selection is **deterministic, not LLM-based**: Brand Analysis (LLM)
  produces a personality vector once; a pure cosine-similarity scoring
  function over bipolar-centered axes (so opposite ends of a spectrum are
  genuinely dissimilar, not just "less similar") picks the best-fit theme
  per style family. Golden tests pin the exact expected theme for fixture
  profiles (upscale sushi, casual taqueria, French patisserie) and confirm
  the same inputs always produce the same theme.
- Every style family always returns a theme, even when every candidate in
  that family is hard-excluded by a photo-count constraint — a documented
  fallback picks the family's least photo-dependent theme rather than
  leaving the Variation Picker with a missing option.
- Palette derivation (`lib/color.ts`) expands one seed color into a 10-step
  OKLCH scale per token (primary/secondary/accent/surface/text/success/
  error), and **guarantees** — not just hopes — that the CTA-button pairing
  (white text on primary-600) and the body-text pairing (text-900 on
  surface-50) pass WCAG AA, auto-adjusting lightness if the raw seed would
  fail. Verified against adversarial seed colors in tests, not just typical
  ones.

## AI Website Generator

- Pipeline: ingest live restaurant/menu data → Brand Analysis (LLM,
  structured Brand Profile with per-field confidence) → AI theme selection
  (×3, deterministic) → shared content core (LLM, generated once) →
  per-variation tone adaptation (LLM, ×3 only — the expensive stages run
  once, keeping the 3-variation cost well under 3× a single generation) →
  assembly into three `SiteDefinition` documents → AI Website Score (×3) →
  finalize as three `SiteVersion` rows sharing one `generationBatchId`.
- **Every AI-backed stage has a non-throwing safe-default fallback** —
  brand analysis falls back to a neutral profile (confidence 0), content
  generation falls back to templated copy, the brand-consistency judge
  falls back to a neutral score. The pipeline cannot "fully fail" from an
  LLM outage; it only fails a batch on a genuine infrastructure error,
  which by definition would also prevent any fallback from persisting.
- Low-confidence Brand Profile fields are overridden with safe defaults
  before theme matching runs, rather than trusting a weak guess.
- A profanity/claims filter strips unverifiable superlative claims
  ("best in the world", "award-winning", fabricated health claims) from
  every LLM-generated copy field before it's stored.
- Facts (address, phone, hours, whether online ordering/reservations
  exist) are **never** LLM-generated — they're copied verbatim from
  structured data into every variation, byte-identical across all three,
  verified by test.
- CTA copy (`cta.ts`) is computed by a small deterministic function, not
  the LLM: online ordering wins if it exists, then reservations, then a
  plain "View Menu" — with family-appropriate wording (formal for Luxury,
  energetic for Modern, terse for Minimal).
- Regeneration replaces only the unselected `VARIATION` rows for a site;
  an already-selected `DRAFT` is left untouched.

## AI Website Score

- Five dimensions, equally weighted into one overall score: **SEO**
  (rule-based: title/meta length, cuisine keyword presence, alt-text
  coverage), **Performance** (a documented heuristic proxy — see Known
  Limitations), **Accessibility** (rule-based: hero-over-photo contrast,
  alt-text coverage; body-text/button contrast is a structural guarantee
  from the Theme Engine, not scored here since it can't actually fail),
  **Brand Consistency** (hybrid: deterministic font/palette-adherence
  checks plus an LLM judge comparing copy tone against the stored Brand
  Profile), **Conversion** (rule-based: primary CTA above the fold,
  hours/location on the home page, a click-to-call phone number).
- Every failed check produces a ranked `Suggestion` object
  (`{dimension, issue, impact, suggestion, autoFixKind?}`); suggestions
  are pooled across dimensions and sorted high-impact first.
- **Three working one-click auto-fixes**: `missingAltText` (asset layer —
  generates deterministic alt text per asset kind + restaurant name),
  `heroContrast` (definition layer — boosts a hero's scrim opacity until
  white text clears WCAG AA against the image's measured or assumed
  luminance), `missingMetaDescription` (definition layer — regenerates an
  empty meta description from the tagline/cuisine/city). Each fix is
  tested to actually resolve the specific check that flagged it.
- Publish re-scores the draft and **warns** (never blocks) if the new
  score is lower than the currently-live version's score.

## Public Website Renderer (Layout Engine + Component Library)

- **Layout Engine** (`renderer/layout-engine.ts` + `registry.ts`): a
  section-type → component registry. Unregistered or future/deprecated
  block types are skipped with a logged warning rather than crashing a
  page. `testimonials` is deliberately left unregistered — there is no
  testimonial data source in this data model, and §2's guardrail against
  fabricating one means the correct behavior for that block type is to
  never render, which the graceful-degradation path already provides for
  free.
- **Public component library** (`renderer/components/`): Hero (3 variants,
  auto-contrast scrim over a photo when one exists), SignatureDishes,
  AboutTeaser/AboutStory (with an optional photo band), HoursLocation (with
  a Google Maps search-query link needing no API key), MenuSection,
  Gallery (with a lightweight lightbox), CtaBanner, ContactInfo/ContactForm
  (honeypot-protected, posts to the existing public contact endpoint),
  SiteHeader/Nav, SiteFooter, MobileActionBar (Call/Directions/primary
  CTA, hidden at desktop widths). Every interpolated string is
  HTML-escaped — owner-editable and LLM-generated text is never trusted as
  markup.
- **One shared renderer**: `renderPage()` (pure) and `renderAllPages()`
  (resolves live data, then delegates to `renderPage()`) are the *only*
  rendering code path — used identically by the on-demand preview route
  and by static generation at publish, so the two can never drift apart.
- **The Menu section queries live data at render time** — `MenuCategory`/
  `MenuItem` rows, not a snapshot baked into the stored `SiteDefinition` —
  matching the spec's "single source of truth" requirement for the menu
  page.
- SEO/OG/JSON-LD (`renderer/seo-head.ts`, `json-ld.ts`): title, meta
  description, canonical URL, Open Graph + Twitter Card tags, a generated
  1200×630 SVG share image (a template-based card, not a headless-browser
  screenshot), and JSON-LD (`Restaurant` with live `hasMenu`/
  `MenuSection`/`MenuItem`, plus `BreadcrumbList`) on every page.
- `sitemap.xml` and `robots.txt` are generated per release
  (`renderer/sitemap.ts`).

## Publish Workflow

- `publishSite` renders every page of the draft via the shared renderer
  and writes each to a new `releaseStorage` (local-disk object-storage
  substitute, same swappable-interface pattern as the existing
  `fileStorage`/`safeFetch` libs), along with `sitemap.xml`, `robots.txt`,
  and the OG share image for that release.
- Pre-publish checks: the stored definition must parse against
  `siteDefinitionSchema` (schema-valid gate), and any photo assets that
  exist must have finished processing. Contrast and required-field checks
  are *not* re-checked here since they're already hard guarantees earlier
  in the pipeline — repeating them would be dead code.
- Publish re-scores and warns (never blocks) on a score drop versus the
  live version; the most recent 10 releases are retained, older ones
  auto-archived.
- **Rollback** re-materializes the target release's static pages with
  *current* live menu/profile data (not whatever was live when that
  release first published), so a one-click rollback never resurrects
  stale prices.
- **Menu/profile revalidation**: menu item/category mutations and
  restaurant-profile updates each trigger a fire-and-forget
  `revalidatePublishedSite()` call that re-renders and overwrites the
  currently-published release's static pages — a price change appears on
  the live site without a republish.
- **Public serving**: a Host-header-based middleware resolves an incoming
  request to a `Site` (via the `{slug}.{platform-domain}` pattern or a
  verified custom `Domain`), serves its pre-rendered static pages, a 503
  holding page when `UNPUBLISHED`, and `sitemap.xml`/`robots.txt`/the OG
  image — the closest substitute available in this sandbox for real edge/
  CDN routing.
- **Preview**: a signed, expiring, site-scoped JWT (`GET
  /api/sites/:id/preview-token`) plus a `GET /preview/:token` route that
  renders on demand from the latest draft (or a specific `?variation=`),
  always with `noindex`/no-store headers — never a stale static file. The
  dashboard's variation-preview page embeds this behind a real mobile/
  tablet/desktop device-toggle iframe, proxied through `next.config.ts`.

## Database Changes

9 new Prisma models, all tenant-scoped through `Site.restaurantId`:

| Model | Purpose |
|---|---|
| `Site` | One website per restaurant — slug, status, active theme, published-version pointer, persisted Brand Profile, settings |
| `SiteVersion` | Every generated/edited/published cut of a site — `SiteDefinition` JSON, status (VARIATION/DRAFT/PUBLISHED/ARCHIVED), style family, generation batch id |
| `Theme` | The curated theme catalog — tokens, variants, layouts, personality vector, cuisine affinities, constraints |
| `SiteScore` | One AI Website Score snapshot per `SiteVersion` |
| `Domain` | Custom/platform domains — verification + TLS status, primary flag |
| `SiteAsset` | Uploaded images (hero/gallery/logo/OG) — storage key, renditions, alt text |
| `GenerationJob` | One row per generation batch — stage/status/error tracking |
| `ContactMessage` | Public contact-form submissions — hashed IP only |

Plus 9 new enums (`SiteStatus`, `SiteVersionStatus`, `StyleFamily`,
`ScoreSource`, `DomainType`, `DomainVerificationStatus`, `DomainTlsStatus`,
`AssetKind`, `GenerationStage`, `GenerationStatus`). No live migration was
run (no live Postgres in this sandbox, same constraint as every prior
sprint); `prisma validate` passes against the schema as merged.

## API Endpoints

31 endpoints under `/api/sites` (authenticated, tenant-scoped): site core
(`GET /me`, `POST /`, `PATCH /:id`, `GET /:id/preview-token`), generation
and variations, versions and draft editing, scoring and suggestion
auto-fixes, assets, publish/rollback/unpublish and domain management,
and the contact-message inbox. Public/unauthenticated:
`POST /public/sites/:id/contact` (rate-limited, honeypot-protected). New
non-API routes added in the renderer follow-up: `GET /preview/:token` and
a Host-header site-resolution middleware mounted ahead of `/api`.

## Frontend Pages

Seven pages under `/dashboard/website`: the Website Hub, the Variation
Picker (with a full per-variation preview page — now a real device-toggle
iframe, not only a structured data view), a constrained draft Editor, the
Score Panel (with re-score and one-click auto-fix), Publish & Domains
(releases list, rollback, a DNS verification wizard), and the contact-form
Messages inbox.

## Tests Added

**366 tests across 58 files** (up from 64/12 after Sprint 05) — golden
theme-matching tests against fixture brand profiles, color/contrast math
including adversarial seed colors, `SiteDefinition`/Brand Profile schema
validation, the full generator orchestrator (mocked LLM, verified
non-throwing on failure), all five scorers against known-defect fixtures,
auto-fix-resolves-its-own-triggering-check tests, the entire renderer
module (HTML-escaping/XSS, Layout Engine graceful degradation, JSON-LD
validity, sitemap/robots content, static-file writes on publish,
preview-token validation, live-menu-data rendering vs. a stale snapshot,
custom-domain Host-header routing, the menu/profile revalidation hooks),
and tenant-isolation checks throughout.

## Known Limitations

- **No live LLM, database, or network egress in this sandbox** — every AI
  call, DNS lookup, and rendering path is unit-tested via mocks or direct
  fixture invocation, not exercised against live infrastructure end-to-end.
  A full generate → publish → serve round trip against a real domain has
  not been run.
- **Performance score is a documented heuristic proxy, not real
  Lighthouse** — there's no live hosting in this sandbox to audit against.
  `performance-score.ts` states this explicitly; swapping in a real
  Lighthouse runner later requires no change to its callers.
- **No real image processing** — no WebP/AVIF renditions, no LQIP
  placeholders, no EXIF/GPS stripping. Site assets are stored through the
  existing local-disk `fileStorage`, sharing a directory with Import
  Engine uploads rather than a dedicated site-asset path.
- **No real ACME/TLS issuance** — custom-domain DNS ownership verification
  is real (an actual CNAME lookup against the expected edge target) and
  tested; TLS status remains `PENDING` indefinitely since there's no ACME
  account or edge server here to issue a certificate.
- **The OG share image is a generated SVG template**, not a
  headless-browser screenshot — valid as an `og:image` on most platforms
  that render link previews, but not pixel-identical to what a real page
  screenshot would produce.
- **No live email delivery** for contact-form notifications — submissions
  are fully persisted and visible in the dashboard inbox; emailing the
  owner would need a configured email provider this environment doesn't
  have.
- **Social links are not rendered** — the `Restaurant` model has no
  social-profile fields yet; `SiteFooter` omits that section entirely
  rather than rendering empty links.
- **No structured hours model** — `SiteFacts.hours` exists in the schema
  but nothing currently populates it, so an "open now" indicator (from the
  original spec's Contact page description) isn't shown.
- **DoorDash, Uber Eats, and Grubhub import sources are unaffected** —
  still stubs, still `501`, untouched this sprint (carried over from
  Sprint 04/05).

## Verification Results

- `pnpm install`, `pnpm --filter api exec prisma generate`, and
  `pnpm --filter api exec prisma validate` all pass on `main` after the
  merge.
- `pnpm run lint` and `pnpm run typecheck` pass cleanly at the repo root.
- `pnpm run test` — **366/366 tests passing** across 58 files in
  `apps/api`.
- `pnpm run build` — both `apps/api` (`tsc`) and `apps/web` (`next build`,
  Turbopack) compile successfully, including every new
  `/dashboard/website/*` route.
- Manually rendered a fixture `SiteDefinition` through the real
  `renderPage()` pipeline (not mocks) and confirmed genuine output: correct
  SEO tags, valid JSON-LD reflecting live menu data, a complete OKLCH
  color-token stylesheet, and working navigation/hero/footer/mobile-
  action-bar markup with real `tel:`/Google Maps links.
- Not verified in this environment (requires live Postgres, a real
  `ANTHROPIC_API_KEY`, a resolvable custom domain, and live hosting): an
  end-to-end generate → select → publish → serve round trip against a
  real browser, a real Lighthouse audit, and real ACME certificate
  issuance.

## Sprint 07 Summary

Sprint 07 is what makes `SiteFacts.hasOnlineOrdering` true and the "Order
Now" CTA real: a full Commerce & Fulfillment Engine, implemented exactly
against the approved (Revision 2) `SPRINT_07_MASTER_SPECIFICATION.md`.
It adds guest/customer cart and checkout, multi-provider BYOP payment
orchestration with transparent failover, BYO-delivery fulfillment with
driver tracking, a rule-based Smart Delivery Routing engine, kitchen
capacity management, coupons, QR dine-in ordering, a stub-only POS
adapter architecture, schema-only loyalty/gift-cards, and customer-,
owner-, and staff-facing frontends for the whole flow.

`apps/api/src/modules/commerce/` follows the existing per-module layering
(`routes → controller → service`, `validation.ts`/`errors.ts` per module,
`getOwnRestaurantId` + explicit row-level ownership re-check for tenant
isolation, cross-tenant access always 404 never 403) and reuses the
adapter/registry pattern proven in Sprint 04's import engine for four
separate provider families: payments, fulfillment, POS, and notifications.

## Commerce Engine Architecture

- 14 sub-modules under `commerce/`: `cart`, `checkout`, `orders`,
  `payments`, `fulfillment`, `delivery-rules`, `menu-commerce`, `coupons`,
  `customers`, `pos`, `qr-ordering`, `loyalty` (schema-only), `events`,
  `notifications` — dependency direction is strictly one-way and acyclic:
  `checkout` depends on `cart`/`menu-commerce`/`delivery-rules`/`payments`;
  `orders` depends only on `checkout`'s output; `fulfillment` depends on
  `orders`/`delivery-rules`; `pos` and `qr-ordering` are alternate
  order-source entry points that funnel into the same `checkout`/`orders`
  core rather than duplicating it; `events`/`notifications`/`loyalty` are
  pure subscribers nothing in the core flow imports back.
- **In-process event bus** (`commerce/events/`), typed on the Prisma
  `OrderEventType` enum itself, with wildcard `"*"` subscription support.
  A real bug was found and fixed here during testing: the bus only caught
  *asynchronous* handler rejections, not synchronous throws, which would
  have broken `emit()` for every sibling handler — fixed with an explicit
  synchronous `try/catch` alongside the async one.
- **`writeOrderEvent`/`emitOrderEvent` are deliberately separate calls**:
  the DB write happens inside a `$transaction`, the event-bus emission
  happens only after that transaction commits — an event is never emitted
  for a write that could still roll back.
- **Envelope encryption** (`lib/encryption.ts`, AES-256-GCM) protects
  every stored payment/fulfillment/POS provider credential and webhook
  secret; plaintext never touches the database.
- **Postgres-backed idempotency** (`lib/idempotency.ts`): every mutating
  endpoint that can plausibly be double-submitted (place-order, refund,
  coupon-redeem) requires an `Idempotency-Key` header, reserved via a
  `create()`-then-catch-P2002 race against a dedicated table — deliberately
  not an in-memory check-then-write, which would double-charge a customer
  under multiple server instances.

## Full Multi-Provider BYOP Payments

- A restaurant can hold several simultaneously-`CONNECTED`
  `PaymentProvider` rows (e.g. Stripe **and** Square **and** Clover at
  once) — never a platform-wide payment account. Stripe ships as a real
  adapter (`capture_method: "manual"`, separate authorize/capture/void/
  refund); Clover, Square, Authorize.net, Adyen, and Fiserv are registered
  stub adapters (`implemented: false`), visible but unavailable in the
  dashboard, exactly like Sprint 04/05's DoorDash/Uber Eats/Grubhub import
  stubs.
- **Orchestrator failover**: `authorizeOrderPayment` builds a
  priority-ordered candidate list of `CONNECTED` providers, tries each via
  the adapter interface, writes one `PaymentAttempt` per try, and returns
  on first success — the customer never sees which provider was used, and
  a disconnected/erroring primary transparently fails over to the next.
- **Webhook handling** is signature-verified per-connected-provider
  (BYOP means each restaurant's webhook secret differs, so the specific
  `PaymentProvider` row is identified via `?providerId=`), writes a
  `WebhookEvent` row first to dedupe retried deliveries (P2002 →
  `{status: "duplicate"}`), and requires `express.json({ verify })` in
  `app.ts` to preserve the raw request bytes the signature was computed
  over.
- Cash payment methods (`CASH_ON_DELIVERY`/`CASH_AT_PICKUP`) bypass the
  provider entirely but still produce a `Transaction` row when marked
  paid, so the accounting trail is uniform regardless of payment rail.

## Checkout, Cart & Order Lifecycle

- **Price-drift protection**: `CartItem.unitPriceCents` freezes the price
  (base + variant delta + selected modifier deltas) at add-time;
  `placeOrder` re-validates against the current `MenuItem.priceCents` +
  `MenuItemVariant.priceDeltaCents` before charging — a documented known
  limitation is that modifier-*option*-level drift isn't re-checked, only
  base-price drift.
- **Checkout quotes are computed fresh on every call, never cached** — a
  deliberate simplification over a "quote lock with expiry" scheme: there
  is no stale quote to accidentally honor, since `placeOrder` recomputes
  the identical function immediately before charging.
- **Order creation happens in one atomic transaction before any payment
  provider network call** (Order/OrderItem/Fulfillment/CouponRedemption
  rows, since `PaymentAttempt.orderId` is a real FK requiring the Order to
  exist first), but the transaction boundary stops there — the external
  payment call happens outside it.
- **Centralized state machine** (`orders/order-state-machine.ts`): one
  `TRANSITIONS` table is the only place in the codebase permitted to
  decide whether an `Order.status` change is legal. There is no separate
  manual "confirm" staff action — `placeOrder` already transitions
  `PENDING_PAYMENT → CONFIRMED` automatically at payment success (or
  immediately for cash); staff's first manual action is `startPreparing`.
- **Cancellation never auto-refunds** — a captured payment stays captured
  until staff explicitly issues a refund; refunding transitions the order
  to `REFUNDED` only on a full refund, a partial refund only updates
  `paymentStatus`.
- **Guest checkout** uses an anonymous `guestSessionId` in an httpOnly
  cookie, entirely separate from both staff and customer auth cookies;
  `GuestCustomer` rows are created only at order-placement time, never at
  cart-creation time.
- **Customer auth** is a fully separate identity from staff `User`/`Role`
  — JWT-based with `kind: "customer"`/`"customer-refresh"` discriminators
  reusing `JWT_ACCESS_SECRET`, since the approved schema has no
  `CustomerRefreshToken` table (a documented, deliberate divergence from
  staff auth's opaque-hashed-token-in-DB pattern).

## Delivery Rules & Smart Routing Engine

- `commerce/delivery-rules/` adds radius/max-distance/min-order
  configuration, delivery-fee and service-fee rules (flat/per-mile/
  percentage), delivery zones (radius or polygon) with fallback chains,
  and kitchen capacity (manual pause + auto-pause at a configured
  concurrent-order threshold).
- **`evaluateRouting()`** (`smart-routing.ts`) is a pure, deterministic,
  rule-based function — no DB access, no AI — implementing the spec's
  exact check order: restaurant closed → kitchen unavailable →
  fulfillment-type branch → for delivery: max-distance ceiling → min-order
  → radius-mode-or-zone/rule-mode resolution with busy-driver fallback
  chains. A design bug was caught and fixed before shipping: the function
  originally tried to compute a delivery fee itself (always resolving to
  0, silently wrong) — fee computation was removed entirely and is now
  exclusively the caller's (`quote.service.ts`'s) responsibility, keeping
  eligibility and pricing as separate concerns.

## Fulfillment & Driver Tracking

- `FulfillmentProviderAdapter` interface + registry, same BYO pattern as
  payments: Uber Direct, DoorDash Drive, and Local Courier are registered
  stub adapters; pickup and restaurant-driver fulfillment need no external
  provider connection at all.
- `DriverAssignment`/`DriverLocationPing` track a driver's current
  position (denormalized "latest" fields plus an append-only ping
  history) via a driver-facing location-ping endpoint, authorization-
  checked so a staff member can only post pings for their own assigned
  delivery (a 403, not a 404 — the fulfillment visibly exists to other
  staff, it just isn't this staffer's delivery).
- A driver's own delivery queue (`GET .../fulfillment/my-assignments`)
  and accept/decline action (`POST .../assignments/:id/respond`) were
  added during frontend integration — `respondToAssignment` already
  existed in the service layer from the original build but had no
  controller/route exposing it; this closed that gap rather than leaving
  the driver frontend without a way to list or answer its own offers.

## QR Dine-In Ordering & POS

- `commerce/qr-ordering/`: `Table` rows carry a high-entropy, regenerable
  `qrToken` — the sole authorization for "which restaurant and table this
  order is attributed to," resolved server-side from a scanned token,
  never trusted from a client-supplied table id. A scanned QR bootstraps a
  `DINE_IN` cart pre-associated with the table before the diner ever sees
  the menu.
- `commerce/pos/`: `POSProviderAdapter` interface + registry for Square,
  Clover, Toast, Lightspeed, and a generic adapter — all stubs this
  sprint, shown as "coming soon" in the dashboard exactly like the
  payment/fulfillment stub providers.

## Customer-, Owner-, and Staff-Facing Frontend

- **Customer-facing** (`apps/web/src/app/order/*`, `/account/*`): menu
  browsing with variant/modifier selection, a cart with fulfillment-type
  and coupon controls, a checkout page surfacing tax/delivery-fee/
  service-fee/discount/tip as separate line items, order confirmation,
  order tracking (curated milestone timeline), customer registration/
  login, and an account page for addresses and favorites. A QR landing
  page (`/order/qr/[qrToken]`) resolves a scanned table token and
  bootstraps the dine-in cart before redirecting to the menu.
- **Owner-facing** (`apps/web/src/app/dashboard/*`, extended): orders
  inbox and detail with state-machine-aware action buttons and refund
  issuance, multi-provider payment connection/priority management,
  delivery/fee/minimum-order configuration, kitchen capacity pause/resume,
  a POS "coming soon" list, table/QR management with per-table scan
  links, and coupon CRUD.
- **Staff-facing**: a kitchen queue view (active orders across
  confirmed/preparing/ready/out-for-delivery, one-tap status advances) and
  a driver view (assigned deliveries, accept/decline, mark picked up/
  delivered, and a periodic browser-geolocation-based location ping while
  a delivery is en route).
- A public menu-browsing endpoint (`GET /api/public/restaurants/:id/menu`)
  was added during frontend integration — the approved API design listed
  every cart/checkout/order endpoint the customer frontend needs but not
  a way to actually browse a restaurant's live orderable menu (with
  variants, modifier groups, and inventory-derived availability) before
  adding to a cart; this was a genuine gap in the endpoint list, not a
  scope addition.

## Known Limitations

- **Modifier-option-level price drift isn't re-validated at checkout** —
  only base menu-item price drift is; documented in `checkout.service.ts`.
- **`GET /api/public/checkout/:cartId/fulfillment-options`**, listed in
  the approved API design as a convenience endpoint, was not built — its
  functionality is subsumed by the quote endpoint's `eligible`/`reason`
  fields, which already communicate fulfillment ineligibility with a
  specific reason.
- **No live payment credentials, delivery-provider API keys, or POS
  credentials in this environment** — Stripe's real adapter, and every
  stub provider, is exercised only against mocks in the test suite; a
  live authorize → capture → webhook round trip has not been run.
- **The customer-facing ordering frontend is a separate Next.js surface
  from the AI-generated static marketing site** (Sprint 06's renderer),
  not embedded into the statically-rendered Menu page — the static
  renderer produces SEO-optimized HTML, not an interactive ordering SPA;
  wiring the generated site's "Order Now" CTA to link out to
  `/order/:restaurantId` was not done in this sprint.
- **Owner-facing controller test coverage is uneven by design** — the
  highest-stakes sequential modules (cart, checkout, orders) all have both
  service- and controller-level tests; most remaining commerce controllers
  are thin `requireOwnRestaurantId → service call → instanceof error
  mapping` wrappers whose correctness is already proven by five other
  controller test files exercising the identical pattern, so dedicated
  controller tests were not duplicated for every module.
- **Loyalty and gift cards are schema-only**, exactly as specified —
  `GiftCard`/`GiftCardTransaction`/`LoyaltyProgram`/`LoyaltyAccount`/
  `LoyaltyTransaction` exist and pass migration/validation, with zero UI
  surfaces or checkout steps referencing them.
- **DoorDash, Uber Eats, and Grubhub import sources are unaffected** —
  still stubs, still `501`, untouched this sprint.

## Verification Results

- `pnpm install`, `pnpm --filter api exec prisma generate`, and
  `pnpm --filter api exec prisma validate` all pass.
- `pnpm run lint` and `pnpm run typecheck` pass cleanly at the repo root
  across both `apps/api` and `apps/web`.
- `pnpm run test` — **663/663 tests passing** across 108 files in
  `apps/api` (payments orchestration/failover, webhook signature
  verification and dedup, Smart Routing Engine across all documented
  branches, delivery/service fee resolution across flat/per-mile/
  percentage types, kitchen capacity pause thresholds, cart/checkout/
  order-lifecycle tenant isolation and state-machine enforcement, refund
  full/partial handling, QR token resolution, POS/payment/fulfillment
  adapter-registry conformance).
- `pnpm run build` — both `apps/api` (`tsc`) and `apps/web` (`next build`,
  Turbopack, 28 routes) compile successfully.
- Not verified in this environment (requires live Postgres, real payment/
  delivery/POS provider credentials, and a browser): an end-to-end guest
  checkout → payment capture → kitchen → driver → delivery round trip
  against a running server.

# Release Notes — Sprint 10: Universal Import Engine

## Sprint 10 Summary

Sprint 10 broadens the Import Engine built in Sprints 04–05 (PDF, Image,
Website, Google Maps) into a genuinely universal restaurant-migration
tool, while deliberately keeping DoorDash/Uber Eats/Grubhub as stubs —
scraping those platforms' consumer sites carries real Terms-of-Service
risk with no official partner API, and that trade-off wasn't reopened
this sprint. Everything added here is either the owner's own first-party
data (CSV/spreadsheet upload) or an extension of sources that already had
explicit permission to be fetched (Website, Google Maps).

## Features Completed

- **CSV/spreadsheet import** (`CSV` source, real, `apps/api/src/modules/
  imports/adapters/csv.adapter.ts`): parses a `.csv`/`.xlsx` file (via
  `xlsx`) with a header-alias column mapper
  (`adapters/spreadsheet/column-mapper.ts`) that recognizes plain
  spreadsheet exports as well as common Square/Toast/Clover menu-export
  header conventions — no manual "which POS" selection, no AI call, no
  network access. A row with a missing/unparseable price is still
  imported (priced at 0) but flagged with a low confidence score rather
  than silently dropped.
- **Per-item confidence scores**: `ExtractedMenuData` items now carry an
  optional `confidence` (0–1); the CSV adapter sets it deterministically,
  and the review screen renders a green/yellow/red badge per item.
- **Website menu-link crawl + social-link discovery**
  (`adapters/website/find-menu-link.ts`,
  `adapters/website/find-social-links.ts`): the Website adapter now
  follows exactly one bounded extra hop to a discovered "Menu" nav link
  (not general recursive crawling) and surfaces any on-page social-media
  links into `businessProfile.socialLinks` — free to compute since the
  page's HTML is already fetched and parsed for menu extraction. The
  adapter's core is now exported as `extractWebsiteData()`, reused
  directly by the Google Maps adapter (see below).
- **Richer Google Maps import**: the Places API field mask now requests
  `websiteUri`/`regularOpeningHours`; the listing's first photo is
  persisted (via the existing `fileStorage`/`assetUrl` pattern) as a
  `businessProfile.logoUrl` instead of being run through menu extraction;
  and when the listing has a website, the adapter automatically calls
  `extractWebsiteData()` on it and merges the result — surfacing menu
  items, additional social links, and richer profile data from the same
  single Google Maps URL a user pastes in.
- **Import job rerun**: `POST /api/imports/:id/rerun` re-reads a job's
  already-stored file (or reuses its `sourceUrl`) and re-enqueues
  extraction — lets an owner retry a `FAILED` job, or simply refresh a
  Website/Google Maps import against a source that's changed, without
  re-uploading or re-pasting anything. Requires a new `sourceMimeType`
  column on `ImportJob` (persisted at creation time) so a re-read file
  buffer still carries the MIME type adapters like `ImageImportAdapter`
  validate against.
- **Bulk-edit review screen** (`apps/web/.../import/[id]/review-editor.tsx`):
  reviewers can now inline-edit an item's name/price, multi-select items
  via checkboxes, bulk-move the selection to a different category, and
  bulk-delete bad rows — all client-side, persisted via a new
  `PATCH /api/imports/:id` endpoint before Approve commits the edited
  data into the live menu. The businessProfile preview (name/address/
  phone/website/hours/logo/social links) is now shown above the
  categories so a reviewer sees everything a single Approve click will
  apply, not just the menu items.
- **Import history rerun button**: the import list page can now rerun a
  `FAILED`, `APPROVED`, or `REJECTED` job directly from the history list.

## Architecture Decisions

- **One shared CSV/XLSX adapter, not one per POS.** A single alias-based
  column mapper recognizes multiple POS export conventions automatically;
  adding a new POS's header spelling is a one-line addition to an alias
  list, not a new adapter file — matching the registry's "adding a source
  is one file" design without multiplying near-duplicate adapters.
- **Menu-link crawl is capped at exactly one extra hop**, not general
  crawling — the same cost/complexity trade-off Sprint 05 made explicit
  for image processing, now applied to page-following.
- **Social-link discovery has zero extra network cost** — it reads the
  same fetched HTML the adapter already parses for text/image extraction.
- **`extractWebsiteData()` is the single reuse point** between the
  Website and Google Maps adapters, so a discovered listing website gets
  identical treatment (text/image extraction, menu-link crawl, social
  links) to a directly-submitted Website import — one code path, two
  callers, per the merge-function precedent set in Sprint 05.
- **Bulk edits persist through the existing `extractedData` column** via
  a new `PATCH`, re-validated with the same `extractedMenuDataSchema`
  Approve already uses — no parallel "draft" storage was introduced.

## Known Limitations

- **DoorDash, Uber Eats, and Grubhub remain untouched stubs** — still
  `501`, by deliberate scope decision this sprint (ToS risk, no partner
  API), not an oversight.
- **CSV price parsing assumes a dollar-amount cell** (`"12.99"`,
  `"$12.99"`) — a spreadsheet that stores prices as raw cents would be
  misparsed; documented in `column-mapper.ts`, not auto-detected.
- **Google Maps' "logo" is a best-effort stand-in** — Places API has no
  dedicated logo field; the listing's first photo is used, which may be
  a food photo or storefront shot rather than an actual logo.
- **The website menu-link crawl only looks for one link candidate on the
  original page** — a menu buried two clicks deep, or linked only from a
  page the crawl didn't follow, still won't be found.
- **No live Anthropic/Google Maps API key exercised in this environment**
  for the AI-dependent sources (Website text/image extraction, Google
  Maps) — the CSV adapter has no such dependency and was verified fully
  end-to-end (upload → parse → review → bulk-edit → approve → live menu)
  against a real local Postgres instance in this sandbox.

## Verification Results

- `pnpm run lint`, `pnpm run typecheck`, and `pnpm run build` all pass at
  the repo root across `apps/api` and `apps/web`.
- `pnpm run test` — all suites pass except one pre-existing, unrelated
  flake (`app.test.ts`'s X-Request-Id integration test, which times out
  only under full-suite parallel load and passes cleanly in isolation;
  confirmed not a regression from this sprint's changes).
- `pnpm --filter api exec prisma validate` passes; the new migration
  (`sprint10_import_csv_source`) was applied against a real local
  Postgres instance started in this sandbox.
- **Full live smoke test against a running API + Postgres + web dev
  server**: registered an owner, created a restaurant, uploaded a real
  CSV file end-to-end through `POST /api/imports`, confirmed the
  extracted categories/items/confidence scores, edited the data via
  `PATCH`, approved it and confirmed the edited (not original) items
  landed in the live menu via `GET /api/menu/categories`, and exercised
  `POST /api/imports/:id/rerun` to confirm it re-extracts from the
  original stored file. The rendered `/dashboard/import` and
  `/dashboard/import/:id` pages were fetched with an authenticated
  session and inspected directly, confirming the CSV source option, the
  confidence badges, and the bulk-edit controls all render as designed.

# Release Notes — Sprint 11: The AI Restaurant Builder Experience

## Sprint 11 Summary

Sprint 11 is a product-experience sprint, not a new-capability sprint: it
fuses two features that already existed separately — the Import Engine
(Sprints 04/05/10) and the AI Website Builder (Sprint 06) — into one
continuous, cinematic "AI is building your restaurant" experience.
Previously, approving an imported menu dropped the owner back on a plain
list; building a website required navigating to a separate hub, clicking
Generate, waiting on a small pulsing bar, picking one of three variations,
then separately visiting Editor/Score/Publish pages, then separately
creating a QR code from Tables. That's five disconnected manual steps.
This sprint compresses all of it into one unbroken flow with zero extra
clicks required for the happy path.

A Product Experience Plan was written and shared before implementation
(see conversation history) covering user journey, screen-by-screen
experience, AI interactions, and error recovery — implementation followed
it directly.

## Features Completed

- **Fused build pipeline**: approving an import now redirects into
  `/dashboard/builder`, which auto-creates the site, starts generation,
  auto-selects the highest-scoring variation once generation completes,
  auto-publishes it, and auto-provisions one starter QR-ordering code —
  all client-orchestrated over the *existing* site-generation/publish/
  tables endpoints (no new backend capability was invented; see
  Architecture Decisions).
- **Live Build Screen**: a full-screen, staged timeline (grouped as
  "Understanding your restaurant" / "Designing your website" /
  "Publishing your business") with rotating AI-activity captions and a
  live-growing website mockup — a schematic browser frame whose
  header/hero/menu/gallery/footer blocks solidify from skeleton
  placeholders into filled blocks as each *real* backend stage completes.
  Every visible step maps to genuine work (the existing `GenerationJob`
  stages, then the new client-orchestrated select/publish/QR steps) —
  nothing is a fake timer.
- **Finale Reveal**: a confetti burst, a live device preview of the
  actually-published site (reusing the existing preview-token mechanism),
  a real scannable/downloadable QR code encoding the customer ordering
  URL, and next-step CTAs (view website, manage QR codes, go to
  dashboard).
- **Resumable by design**: reopening `/dashboard/builder` re-derives
  state from the server (site/job status) — already-published sites go
  straight to the reveal; an in-progress or previously-failed generation
  resumes or offers retry instead of restarting the animation.
- **Error recovery**: generation failures and post-generation
  select/publish/QR failures surface inline on the same screen with a
  human-readable message and a retry action — no dead-end pages. QR
  provisioning failure specifically is non-fatal (the reveal still shows;
  the owner can create a QR code later from Tables).
- **Accessibility**: respects `prefers-reduced-motion` (via
  `useSyncExternalStore`, not a state-setting effect) — falls back to a
  plain stepped checklist with no heavy animation.

## Maintenance Fixes

- **`GenerationJob.status` was never set to `RUNNING`** despite the enum
  having that value and the frontend explicitly checking for it — the
  job runner only ever wrote `PENDING` (at creation) or `COMPLETED`/
  `FAILED` (at the end), leaving `RUNNING` permanently dead code. Fixed
  by setting `status: "RUNNING"` at the start of the job runner, before
  any stage work begins. Low-risk, localized, fixed immediately per the
  standing engineering policy.

## Architecture Decisions

- **No new backend capability, no schema changes.** Every stage in the
  fused pipeline is either an existing `GenerationJob` stage or an
  existing endpoint (`selectVariation`, `publishSite`,
  `POST /me/tables`) called automatically by a new frontend orchestrator
  hook (`useRestaurantBuilder`) instead of by a human clicking through
  five separate pages. This keeps the blast radius small and fully
  backward-compatible — the original manual Website hub, Editor, Score,
  and Publish pages are untouched and still work exactly as before for
  later edits/regeneration.
- **Auto-select picks the highest `SiteScore.overall`** among the three
  generated variations, ties broken by keeping the first-encountered
  (highest `versionNo`) candidate — an explicit, testable, deterministic
  rule rather than an opaque "AI choice."
- **The "growing website" mockup is a structural skeleton reveal, not a
  claim about real content** — colors/copy don't exist client-side until
  generation finishes, so each block solidifies generically as its stage
  completes rather than fabricating a preview of specific brand colors
  or copy prematurely. Honest by construction.
- **QR code encodes the existing customer ordering surface**
  (`/order/qr/:qrToken`, from Sprint 07's QR ordering module) — no new
  public route was added; only the auto-provisioning of one default
  `Table` row is new (the customer-facing resolution flow already
  existed).

## Known Limitations

- **No real browser automation available in this sandbox** — the client
  orchestrator hook and every screen have thorough component/hook-level
  test coverage (jsdom + mocked network), and the *entire real backend
  pipeline* (site creation → generation with real menu data → auto-select
  → publish → QR provisioning → the actual rendered preview showing the
  real menu item) was verified end-to-end via direct HTTP calls against a
  live local Postgres instance in this sandbox — but the client-side
  hydration/rendering path itself (confetti firing, timeline animating,
  the mockup filling in) was not observed in an actual browser.
- **Tie-breaking among equally-scored variations** always keeps the same
  one (highest `versionNo`) — deterministic, but not randomized or
  owner-configurable.
- **QR auto-provisioning always labels the table "Scan to Order"** and
  isn't currently deduplicated against an existing table of the same
  name if the owner re-runs the builder flow after already having one.

## Sprint 11.1 Summary

A WWDC-style Product Experience Review of the shipped Sprint 11 flow
identified ten small, no-new-feature polish opportunities to raise the
experience's emotional register — all ten were approved and implemented,
alongside two additional product decisions: the primary CTA is now the
emotional payoff of the whole journey, and the finale's voice was warmed
from technical-completion framing to business-success framing.

## Features Completed

- **The Reveal Beat**: a ~700ms cinematic pause on the fully-complete
  build screen (100%, `PROVISIONING`) before cutting to the Finale,
  replacing the previous instant hard-cut (`builder-experience.tsx`).
- **Personalized captions**: build-step captions are now a function of
  context (`BuildCaptionContext`) instead of static strings — they
  reference the restaurant by name throughout, and once a design is
  picked (`SELECTING` onward) reference its real cuisine/tagline
  (`"Choosing the design that says \"…\""`) instead of generic copy.
- **Real color, sooner**: the website mockup reskins with the actual
  winning design's `colorSeed` as soon as it's known (`SELECTING`
  onward) instead of staying a generic gradient all the way to the
  Finale.
- **Dramatize the choice**: a new `DesignChoiceReveal` component shows
  the generated candidate designs as color-swatch cards during
  `SELECTING`; after a short beat the winner scales up and glows while
  the others fade — visualizing the auto-select the hook already
  performs by score, not a new decision.
- **Shimmer, not pulse**: the mockup's skeleton blocks now sweep with a
  moving shimmer gradient (`shimmer-sweep` keyframe) instead of a flat
  `animate-pulse`.
- **Weighted progress**: `overallProgressPercent` now weights each stage
  by its realistic relative duration (AI content generation and design
  assembly count for more of the bar; theme selection and QR
  provisioning are near-instant) instead of one uniform increment per
  step.
- **Reassurance line for slow moments**: a quiet secondary line
  ("Still working — great restaurants take an extra moment.") fades in
  if the active stage has been running for more than 7 seconds.
- **Value-pitch checklist**: a secondary ticking checklist (Website ·
  Mobile-ready · SEO · QR ordering) runs alongside the main timeline,
  ticking off each deliverable as its gating stage completes.
- **Micro-interaction pass**: timeline checkmarks and checklist items
  pop in (`pop-in` keyframe) on completion instead of appearing flatly.
- **Warmed-up Finale voice**: the headline, subhead, and QR section copy
  were all rewritten from technical-completion framing ("_website is
  live_", "_your QR ordering code_") to business-success framing — the
  owner reads that they've launched a real business, not that a process
  finished. An optional, muted-by-default success chime (synthesized
  via Web Audio, no new audio asset) is available via a visible toggle
  and, once turned on, is remembered for future reveals.
- **"Open My Restaurant" as the primary payoff**: the Finale's primary
  CTA is now a large, prominent "Open My Restaurant" button (repurposing
  the existing `/dashboard/website` hub, the only real functional
  destination this can honestly point to — the `slug.sites.ordervora.example`
  string shown elsewhere on the page is illustrative, not a resolvable
  live domain in this environment). "Manage QR codes" remains a normal
  secondary action; "Go to dashboard" is now a small, muted tertiary
  text link rather than a co-equal button.

## Architecture Decisions

- **No new backend capability, no schema changes, no new endpoints** —
  every item above is a frontend presentation change over data already
  returned by existing endpoints (`listVariations`'s `definition`/
  `scores`, already fetched by `useRestaurantBuilder`, is simply now also
  surfaced to the UI instead of only used internally to pick a winner).
- **`useRestaurantBuilder` now exposes `candidates`, `winnerId`, and
  `winningDesign`** (tagline/cuisine/colorSeed), captured once at the
  start of the existing `runFinishSequence` — before this sprint that
  data was fetched and immediately discarded after picking the best
  score.
- **The reassurance line and the design-choice reveal's delay both use
  the same "remount via `key`" or "effect fires once on mount" pattern**
  already established for `RotatingCaption` in Sprint 11 — no imperative
  state resets inside effects, keeping the codebase's existing
  `react-hooks/set-state-in-effect` discipline intact.
- **The chime is synthesized with the Web Audio API**, not a bundled
  audio file — three sine-wave notes shaped with a gain envelope. Kept
  behind a try/catch since Web Audio availability is never guaranteed
  and the chime is explicitly a nice-to-have.

## Testing Strategy

All ten items and both CTA/copy decisions are covered by updated/new
tests in `build-steps.test.ts`, `live-build-screen.test.tsx`,
`builder-experience.test.tsx`, `finale-reveal.test.tsx`, and
`use-restaurant-builder.test.ts` — fake timers verify the reveal beat,
the reassurance line's delay, and the design-choice reveal's delay
deterministically rather than waiting on real time in CI.

## Known Limitations (additional, this sub-sprint)

- **"Open My Restaurant" opens the dashboard's website hub, not a real
  external live URL** — this sandbox has no resolvable public domain for
  published sites (`*.sites.ordervora.example` is illustrative), so the
  primary CTA points at the most functional existing destination rather
  than a URL that would 404 in production today. Revisit once real site
  hosting/domains exist.
- **The chime preference is stored in `localStorage`**, so it's
  per-browser, not per-account — a fresh browser or incognito session
  defaults back to muted, by design.

# Release Notes — RC-1 Milestone 2: Deploy apps/api to Vercel

## Summary

`apps/api` is live in production on Vercel, replacing the Render/Railway
path that had blocked deployment entirely. The existing Express app is
unchanged in structure — this milestone is a serverless wrapper and
platform migration, not a rewrite: `api/index.ts` exports `createApp()`'s
result directly as the Vercel Function handler, and the two in-process
background workers (outbox processing, stale-offer expiry) became
Vercel Cron-triggered HTTP endpoints calling the exact same underlying
functions the old `setInterval` schedulers called.

## Infrastructure

- **Database**: `OrderVora-SaaS` Supabase Postgres project, migrated via
  Supabase's SQL execution tooling (no direct Postgres TCP egress from
  this environment) and connected in production via Supavisor's
  **Transaction pooler** (port 6543), not the direct connection —
  Supabase's direct connection is IPv6-only by default, and Vercel's
  serverless functions are IPv4-only. The pooled connection string also
  needs `sslmode=require&uselibpqcompat=true`: without
  `uselibpqcompat`, `pg`'s connection-string parser currently treats
  `require` as an alias for `verify-full` (full certificate-chain
  validation), which fails against Supavisor's cert chain; with it,
  `require` gets standard libpq semantics (encrypted, not
  certificate-verified) instead.
- **Deployment platform**: Vercel, via GitHub integration (auto-deploys
  on push to `main`). Root Directory is `apps/api`; the project's
  **Framework Preset must stay set to "Express"** — switching it to
  "Other" was tried mid-milestone to chase an unrelated routing bug and
  broke the build outright (`STATIC_BUILD_NO_OUT_DIR`, Vercel falling
  back to expecting a static `public/` output instead of building
  `api/*.ts` as Node.js Functions). Reverted; see Known Limitations.
- **Cron jobs**: `/api/cron/outbox` and `/api/cron/stale-offers`, both
  scheduled every minute via `vercel.json#crons`, gated by a
  `CRON_SECRET` bearer token that Vercel sends automatically on its own
  scheduled invocations.

## Verification

- `/health` — 200, confirms the process is up and reports background
  worker status.
- `/ready` — 200, confirms live database connectivity through the
  pooled connection.
- Existing test suite (983 tests) and lint/typecheck/build all pass
  unchanged — no application code was altered beyond the serverless
  entrypoint files and the two fixes below.

## Post-Launch Follow-up

- **Database password rotated**: the original password was pasted in
  plaintext into an assistant chat transcript during setup; rotated via
  Supabase's dashboard (`Settings → Database → Reset database password`)
  as a precaution, and `DATABASE_URL` updated in Vercel to match. No
  application code changes — deploy-only.
- **TLS verification moved from connection-string flags into code**:
  `/ready` kept failing with `self-signed certificate in certificate
  chain` even after the password rotation and a correctly-pasted
  `?sslmode=require&uselibpqcompat=true`. Root cause: `pg`'s
  `ConnectionParameters` re-parses `connectionString` and merges it
  *over* any explicit sibling config (including an explicit `ssl`
  override), so passing `{ connectionString, ssl }` together silently
  drops the explicit `ssl` in favor of whatever the URL's query string
  produces — meaning correctness depended entirely on typing that query
  string exactly right in a dashboard text field, repeatedly, on a
  phone. Fixed in `lib/prisma.ts` by parsing `DATABASE_URL` into its
  discrete fields (host/port/user/password/database) ourselves and
  passing `ssl: { rejectUnauthorized: false }` as its own top-level
  config property (encrypted, not certificate-verified — Supabase's own
  guidance for Supavisor), with no `connectionString` key present to
  override it. `DATABASE_URL` no longer needs `sslmode`/`uselibpqcompat`
  query params at all for this to work correctly.
- **`apps/web`'s own `pnpm install` on Vercel failed via an unrelated
  workspace package**: pnpm's recursive install runs every workspace
  package's `postinstall`, so provisioning a separate Vercel project for
  `apps/web` (Root Directory `apps/web`) still ran `apps/api`'s
  `postinstall: prisma generate` — which needs `DATABASE_URL` resolvable
  even just to run — in a project that has no reason to carry that var.
  Replaced `apps/api`'s `postinstall` with
  `scripts/postinstall-generate.cjs`, which skips `prisma generate`
  gracefully (exit 0, log line) when `DATABASE_URL` is absent, and runs
  it normally otherwise — no change to `apps/api`'s own deploy, which
  always has it set.

## Fixes Along the Way

- **`safe-fetch.ts` / `places-client.ts` build failures on Vercel only**:
  `@types/node`'s ambient `Response`/`Headers` types resolve to an empty
  interface in Vercel's build environment specifically (a DOM-lib-
  conflict-avoidance check in `@types/node`'s `web-globals/*.d.ts` files
  evaluates differently there than locally, even with an identical
  pinned `@types/node` version). Fixed with a small project-wide
  ambient-type augmentation (`src/types/fetch-globals.d.ts`) restoring
  the real members via declaration merging, independent of which branch
  of that check fires in a given environment.
- **`/ready` DB check silently swallowed its error**: added structured
  logging of the underlying Prisma/driver error in the `catch` block —
  the only way to diagnose the pooled-connection SSL issue above via
  Vercel's runtime logs rather than reproducing it locally.

## Known Limitations

- **The literal `/` path returns `FUNCTION_INVOCATION_FAILED`.** Vercel's
  Express zero-config detection independently invokes `src/app.js`
  directly for that one path (separate from `api/index.ts`, which
  correctly serves every other path including `/health`, `/ready`, and
  `/api/*`), and crashes because `app.ts` exports `createApp` as a named
  export only, not a default export. An attempted fix (giving `app.ts` a
  default export, matching Vercel's documented Express convention)
  turned out to break the *entire* deployment in a much worse way when
  combined with the Framework Preset being set to "Other" — reverted in
  favor of leaving this one narrow, low-traffic path broken. Nothing in
  production ever requests the bare `/` — the frontend only calls
  `/api/*`, `/health`, `/ready` — so this is deferred rather than
  actively harmful. Revisit once Vercel's Express zero-config behavior
  around this is better understood.
- **Framework Preset is load-bearing and must stay "Express".** This is
  an unusual, easy-to-miss coupling for a project that otherwise
  configures everything explicitly via `vercel.json` — worth a project
  settings audit note if this project is ever handed off or reconfigured.

# Release Notes — RC-1 Milestone 3: Multi-Provider AI Abstraction

## Summary

Every AI-backed feature (menu import extraction, Brand Analysis, website
content generation, the Brand Consistency score's LLM judge) now goes
through one provider-agnostic interface (`apps/api/src/lib/ai`) instead
of calling `@anthropic-ai/sdk` directly. Adding OpenAI and Gemini as
alternative providers, selectable purely by which API key is present, so
launch is never blocked on a single vendor's account being available.

## What Changed

- **`lib/ai/types.ts`** — `AIProvider` interface (`complete({ text,
  images?, maxTokens }): Promise<string>`), plus a provider-agnostic
  `AIMediaType`/`AIImageInput` (previously `Base64ImageSource` was
  imported directly from `@anthropic-ai/sdk` in three files, coupling
  even non-Anthropic code paths to that one vendor's SDK).
- **`lib/ai/providers/{openai,anthropic,gemini}.ts`** — one adapter per
  vendor, each translating the shared request shape into that SDK's own
  call (OpenAI: `chat.completions.create` with `image_url` data-URL
  parts; Anthropic: `messages.create` with base64 image blocks; Gemini:
  `generateContent` with `inlineData` parts).
- **`lib/ai/index.ts`** — `getAIProvider()`, the single selection point
  every call site uses. Priority order: `OPENAI_API_KEY`, then
  `ANTHROPIC_API_KEY`, then `GEMINI_API_KEY` — first one present wins.
  Throws only if none are set. Re-evaluated on every call (not memoized),
  matching the codebase's existing lazy-env-read convention, so tests
  never need a real key.
- **Four call sites migrated**: `vision-extractor.ts`
  (`extractMenuFromImages`/`extractMenuFromText`), `content-generator.ts`,
  `brand-analysis.ts`, `scoring/brand-consistency-score.ts` — each now
  calls `getAIProvider().complete(...)` instead of instantiating
  `Anthropic` directly. No behavior change: same prompts, same
  `maxTokens` budgets per call site, same JSON-parse-and-validate
  handling, same fallback-on-failure guarantees.
- Model choice per provider is overridable via `OPENAI_MODEL` /
  `ANTHROPIC_MODEL` / `GEMINI_MODEL` (sensible defaults if unset) —
  switching providers, or pinning a specific model, is an environment
  variable change only, never an application-code change.

## Testing

- `lib/ai/index.test.ts` — priority-order selection (all 3-key
  combinations), and the "none set" error.
- `lib/ai/providers/{openai,anthropic,gemini}.test.ts` — each provider's
  request shaping (text + image parts, `maxTokens` mapping) and response
  extraction, with the vendor SDK mocked.
- All four migrated call sites' existing test suites updated to mock
  `getAIProvider()` directly (returning the raw response text) rather
  than faking each vendor SDK's full response envelope — a net
  simplification, and vendor-agnostic going forward.
- Full suite: 996 passing (up from 983 pre-refactor), lint/typecheck/build
  clean across both apps.

## Known Limitations

- Not yet exercised against a live OpenAI or Gemini account in this
  environment (no network egress) — provider selection, request shaping,
  and response parsing are covered by mocked unit tests; the Anthropic
  path was already proven live in earlier sprints and is structurally
  unchanged.

# Release Notes — RC-1: Import Uploads Fail on Vercel Without Object Storage

## Summary

Live-testing the first real menu import against production (with a real
`OPENAI_API_KEY` in place) surfaced a bug: uploading any file (PDF/image)
crashed with `ENOENT: no such file or directory, mkdir '/var/task/uploads'`.
Vercel's serverless functions have a read-only filesystem outside `/tmp`,
and no object storage (`OBJECT_STORAGE_BUCKET`, Phase 7) has been
configured for this deployment yet, so `fileStorage` fell back to
`LocalDiskFileStorage`, which fails immediately.

## Root Cause and Fix

`import.service.ts`'s `createImportJob` called `fileStorage.save()`
unconditionally and let any failure crash the whole request — but that
saved copy is used **only** by `rerunJob` (to re-read the original file
later); the actual extraction pipeline (`importJobRunner.enqueue`) always
runs off the in-memory upload buffer, never off the saved copy. Wrapped
the save call in a try/catch: on failure, it logs a warning and leaves
`sourceFilePath`/`sourceMimeType` unset, but the job is still created and
extraction still proceeds normally.

**Trade-off, stated plainly**: without object storage configured,
`rerunJob` isn't available for file-based imports (there's no persisted
copy to re-read) — it still works for URL-based imports (website/Google
Maps), which never depended on file storage. This is the correct
near-term trade-off: it unblocks the core upload → extract → review →
approve flow immediately, without requiring an S3-compatible storage
account to be provisioned before the first pilot restaurant can use
Import at all. Configuring `OBJECT_STORAGE_BUCKET` (see
`docs/runbooks/object-storage.md`) later restores file-based rerun with
no further code changes — the factory in `file-storage.ts` already
handles that switch.

## Testing

- `import.service.test.ts` — new case: `fileStorage.save()` rejecting
  still results in the job being created (with `sourceFilePath`/
  `sourceMimeType` left `undefined`) and the runner being enqueued with
  the in-memory buffer, exactly as before.
- Full suite: 998 passing, lint/typecheck/build clean across both apps.

## Verification

Found via a real, live test against production (not simulated): logged
into the deployed `apps/web`, attempted a real image upload through
Import with the newly-configured `OPENAI_API_KEY`, and got the exact
runtime error from Vercel's logs. Root-caused directly from the stack
trace rather than guessed.

# Release Notes — RC-1: Background Jobs Stuck Forever on Vercel

## Summary

Immediately after the previous fix unblocked uploads, a real live import
(a menu image) got stuck at `PROCESSING` forever — direct inspection of
the `ImportJob` row via Supabase showed `updatedAt` never advanced past
`createdAt`, proving the extraction work never progressed at all, rather
than just running slowly.

## Root Cause

`job-runner.ts`'s `enqueue()` fired its async extraction work
fire-and-forget (`void this.run(...)`) so the `POST /api/imports` request
could return `202` immediately without waiting for extraction. That
pattern is safe on a long-running process (Docker/Render/local), where
the event loop keeps executing detached promises regardless of whether
an HTTP response was already sent. It is **not** safe on Vercel:
serverless functions can freeze shortly after the response is flushed,
pausing a detached promise mid-run and never resuming it — so the job
was silently abandoned partway through, permanently stuck at
`PROCESSING`. The exact same fire-and-forget pattern existed in
`generator.ts` (the AI Website Builder's batch-generation orchestrator),
so both flagship AI features shared this bug.

## Fix

Replaced `void this.run(...)` with `@vercel/functions`'s
`waitUntil(this.run(...))` in both `job-runner.ts` and `generator.ts`.
`waitUntil` extends a Vercel invocation's lifetime until the given
promise settles; off Vercel (Docker/Render/local/tests) it's a
documented no-op passthrough, and since the promise argument is already
an in-flight, eagerly-executing async call, behavior off-Vercel is
unchanged from before.

While auditing for the same pattern elsewhere, found three more
fire-and-forget call sites sharing the identical root cause — all
calling `revalidatePublishedSite` after a menu/restaurant-profile edit,
in `menu.controller.ts`, `menu-commerce.controller-helpers.ts`, and
`restaurant.controller.ts`. Applied the same `waitUntil` fix to all
three for consistency, since a killed revalidation means a published
site silently never picks up a price/profile change until the next edit
triggers it again.

A fourth instance, `event-bus.ts`'s generic subscriber-dispatch
fire-and-forget, was deliberately left unchanged — it has no real
production subscribers yet (only a debug logger), and adding real
subscribers is already gated on separate durability work (H-11,
outbox-backed event delivery) documented in-file.

## Testing

- Full suite: 998 passing, 5 skipped, lint/typecheck/build clean across
  both apps — no test changes were needed since `waitUntil`'s behavior
  off-Vercel is identical to the previous `void` pattern.

## Verification

Found via a real, live test against production: a real image import
got stuck at `PROCESSING`, confirmed via a direct Supabase query showing
zero progress on the job row. Deploying this fix and re-running the same
upload is the live verification step.

# Release Notes — RC-1: Login Broken Across Cross-Site Vercel Domains

## Summary

A live test right after the `waitUntil` deploy surfaced a more severe
bug: the dashboard showed "Not authenticated" and an empty import
history for an already-logged-in session, on an iOS Safari client.

## Root Cause

RC-1 M3 deployed `apps/web` and `apps/api` as two separate Vercel
projects, on two separate `*.vercel.app` domains. Because `vercel.app`
is on the public suffix list, those two domains are **cross-site** to
each other for cookie purposes — not just cross-origin. The auth
cookies (`cookies.ts`) were set with `sameSite: "lax"`, which browsers
attach only to same-site requests and top-level cross-site navigations
(plain link clicks) — never to a cross-site `fetch`/XHR call. Every API
request the frontend makes is a cross-site `fetch`, so the login cookie
was never sent back to the API after being set: the app looked logged
out immediately, not intermittently.

## Fix

Changed `baseOptions.sameSite` in `cookies.ts` from a hardcoded `"lax"`
to `isProduction ? "none" : "lax"`. `SameSite=None` is what actually
allows a cookie to ride along on a cross-site request, and it requires
`Secure` — already true in production. CORS was already correctly
scoped for this (verified via response headers: a specific
`Access-Control-Allow-Origin` plus `Access-Control-Allow-Credentials:
true`, not a wildcard), so no other change was needed.

## Testing

- Full suite: 998 passing, lint/typecheck/build clean across both apps.
  No existing test asserted a specific `sameSite` value, so nothing had
  to change to accommodate the fix.

## Verification

Found via a real, live test against production (iOS Safari, the
dedicated `apps/web` deployment). Root-caused directly from the
project topology (two separate Vercel domains) and the auth cookie
configuration, then confirmed the CORS side was already correct via the
live `/health` response headers before deploying the cookie fix.

# Release Notes — RC-1 M4: Custom Domain (ordervora.com)

## Summary

Connected the production deployment to the real domain: `ordervora.com`
(redirecting to `www.ordervora.com`) for the frontend, and
`api.ordervora.com` for the backend. Both are Vercel custom domains on
top of the existing Vercel-managed TLS certificates (issued
automatically on verification, no manual cert work required).

## What Changed

- Added `ordervora.com` / `www.ordervora.com` as custom domains on the
  frontend Vercel project, and `api.ordervora.com` on the backend
  project (`ordervoravip`), each via a DNS record at the registrar
  (Namecheap): an `A` record for the apex and two `CNAME` records for
  the `www` and `api` subdomains, per Vercel's per-domain instructions.
- `app.ts`'s CORS configuration now treats the apex and `www` host as
  interchangeable (`corsOriginValidator`): setting `FRONTEND_URL` to
  either `https://ordervora.com` or `https://www.ordervora.com` allows
  both, since Vercel's "redirect apex to www" option means real traffic
  legitimately arrives from either host — an exact string match would
  have silently broken whichever one wasn't configured as the env var's
  value.

## Testing

- `app.test.ts` — new cases: an apex-origin request and a www-origin
  request are both allowed when `FRONTEND_URL` is set to the www host;
  an unrelated origin is still rejected.
- Full suite: 1000 passing, lint/typecheck/build clean across both apps.

## Verification

DNS propagation and domain verification confirmed live: `ordervora.com`
loads the real OrderVora landing page (confirmed via a live screenshot
from the user's phone), and `api.ordervora.com`'s DNS record was
verified present at Namecheap immediately after being added.

## Remaining for M4

- ~~Update the `FRONTEND_URL` environment variable on the backend Vercel
  project to `https://www.ordervora.com`~~ — done. Verified live: logged
  into `ordervora.com` directly and confirmed the session persists
  (dashboard shows the authenticated user and role).
- Email deliverability DNS (SPF/DKIM/DMARC) — deferred until an SMTP
  provider is chosen (RC-1 M5), since those records depend on which
  provider is sending mail. This is the only remaining M4 item, and it's
  blocked on the M5 provider decision rather than anything domain-side.

# Release Notes — RC-1 M5: Resend Email + Pre-Launch Platform Audit

## Summary

Configured Resend as the production SMTP provider (domain verified,
DKIM/SPF/DMARC DNS live), then ran a full platform audit ahead of
Version 1.0 launch — covering tenant isolation, auth/authz, race
conditions in money-handling code, rate limiting, webhook signature
verification, and secret-placeholder detection. Google Maps import
(`GOOGLE_MAPS_API_KEY`) is deliberately deferred post-launch per
explicit instruction — not a blocker for the first pilot restaurant.

## Resend Configuration

No code changes were needed for the email transport itself —
`EmailNotificationProviderAdapter` already used generic SMTP via
`nodemailer`, and Resend supports standard SMTP directly
(`smtp.resend.com:587`). `ordervora.com` is verified on Resend with
DKIM (`resend._domainkey` TXT), SPF (`send` MX + TXT), and DMARC
(`_dmarc` TXT) all live at Namecheap. `SMTP_HOST`/`SMTP_PORT`/
`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM_ADDRESS` are set on the backend
Vercel project.

## Audit Findings and Fixes

**High — refund double-processing race (real money could be refunded
twice at the provider).** `payments/orchestrator.ts`'s `refundOrderPayment`
read `payment.refundedAmountCents` once into a JS variable and wrote
back `refundedAmountCents + amountCents` later, using that stale value —
two concurrent refund calls for the same payment (two staff double-
clicking, or two legitimately different idempotency-key retries) could
both pass the remaining-balance check before either write landed, both
call Stripe for real money, and the last DB write would silently
under-record that a double-refund happened. Fixed with the same
atomic-UPDATE pattern already used for the DeliveryConfig/KitchenCapacity
races: `reserveRefundAmount()` runs a single `UPDATE ... WHERE
refundedAmountCents + $amount <= capturedAmountCents RETURNING *`
*before* ever calling the provider — Postgres's own row-level locking
serializes concurrent calls, and an empty result means the balance was
already consumed. If the provider call subsequently fails,
`releaseRefundAmount()` reverses the reservation so the balance isn't
permanently under-refundable.

**High — `ADMIN_PASSWORD` had no placeholder-value validation, unlike
the app's other core secrets.** `.env.example`'s committed
`ADMIN_PASSWORD="replace-with-a-strong-password"` is already in
`KNOWN_PLACEHOLDER_VALUES`, but that list was only checked for
`JWT_ACCESS_SECRET`/`COMMERCE_ENCRYPTION_KEY` (the core Zod schema);
`ADMIN_PASSWORD` is read ad hoc via `requireEnv` from `prisma/seed.ts`
and was never checked at all. If the seed script ever ran against
production without the hosting platform's env var actually overriding
this, it would silently create a live `Role.ADMIN` account with a
password taken straight from the publicly-committed example file.
Fixed by moving the placeholder check into `requireEnv` itself (in
production only), so it now protects every requireEnv-based secret
uniformly, not just the two in the core schema.

**Medium — three public cart endpoints were missing the rate limiter
every sibling route has.** `GET /cart/:cartId`, `DELETE /cart/:cartId/
items/:itemId`, and `DELETE /cart/:cartId/coupon` in `cart.routes.ts`
now carry `publicCommerceRateLimiter` like every other route in that
file.

**Low — public order-tracking endpoints had no rate limiter.**
`GET /api/public/orders/:id` and `/timeline` now carry
`publicCommerceRateLimiter`, matching the rest of the public commerce
surface's defense-in-depth posture (the ID being an unguessable UUID
was the only existing protection).

**Low — `markPaidCash`'s check-then-act wasn't inside an atomic
operation.** Two concurrent calls (different idempotency keys) could
both observe `paymentStatus !== "PAID"` and both write a `Transaction`
ledger row for the same cash order — a reporting/double-counting bug,
not an actual double payment (no provider is involved for cash orders).
Fixed with `prisma.order.updateMany({ where: { paymentStatus: { not:
"PAID" } }, ... })`: the atomic `WHERE` + `UPDATE` means only the call
that actually flips the status (`count === 1`) writes the Transaction
row.

**Verified holding, no new issues found:** Stripe webhook signature
verification (`Stripe.webhooks.constructEvent` against the real raw
body); H-3's payment-error-message redaction on every payment code
path; tenant-ownership checks (`findOwn*`) on every newer module's
routes (imports, sites, QR ordering); zero TODO/FIXME/HACK comments
anywhere in either app.

**Known limitation, not fixed this pass:** tracked inventory
(`quantityAvailable`) is never decremented on real order placement —
only a manual staff toggle currently prevents overselling a
limited-quantity item. Deferred: this is a product-shape decision
(how oversell tolerance should behave), not a pure bug, and doesn't
block a pilot restaurant that isn't using per-item inventory limits.

## Testing

- `orchestrator.test.ts` — new case proving the refund race is closed:
  a second concurrent refund whose reservation observes the balance
  already consumed is rejected, and the provider's refund API is only
  ever called once.
- `orders.service.test.ts` — new case proving the `markPaidCash` race
  is closed: a second concurrent call whose atomic `updateMany` matches
  zero rows never double-writes a Transaction row.
- `env.test.ts` — new cases: a placeholder value is rejected via
  `requireEnv` in production, allowed outside production, and a genuine
  value is always allowed.
- `app.test.ts` — new case proving `express.urlencoded()` is not
  mounted (see the SameSite=None CSRF note below), verified against a
  minimal standalone Express instance mirroring `app.ts`'s real parser
  config, since every other route sits behind `siteEdgeMiddleware`'s
  live DB lookup and can't be exercised in this sandbox without one.
- Full suite: 1006 passing, lint/typecheck/build clean across both apps.

## A UX Fix Found During the Audit

`/dashboard/*` pages each assumed an authenticated session but enforced
it ad hoc (or not at all) — `/dashboard/menu`, for one, treated a 401
from `GET /api/menu/categories` identically to "no restaurant yet" and
showed "Set up your restaurant first before adding a menu" instead of
sending an expired/missing session back to `/login`. Added
`apps/web/src/app/dashboard/layout.tsx`, which checks `/api/auth/me`
once and redirects unauthenticated requests to `/login` — Next.js
wraps every nested route under a layout automatically, so this closes
the gap platform-wide in one file rather than requiring a per-page fix,
and it makes every existing "not found" fallback message accurate again
(it can now only fire for a genuine empty state, never a stale session).

## A Second Security Fix Found During the Audit (Not From the Agent)

While investigating the audit findings, re-examined the earlier
`SameSite=None` cookie fix (RC-1 M4) in light of `requireAuth` being
purely cookie-based with no bearer-token/custom-header alternative:
`SameSite=None` (required for the cross-site custom-domain
architecture) removes the CSRF protection `SameSite=Lax` used to
provide, since it now allows cookies on cross-site requests. Confirmed
`express.urlencoded()` was mounted globally in `app.ts` with no real
client ever sending non-JSON bodies — meaning a bare HTML `<form>`
(which can only send `application/x-www-form-urlencoded`,
`multipart/form-data`, or `text/plain`, never `application/json`, and
isn't subject to CORS preflight at all) could have populated `req.body`
on any cookie-authenticated route from a malicious page. Removed the
unused `express.urlencoded()` middleware entirely: the API now only
ever parses `application/json`, which a bare form can't produce and a
cross-origin script-driven `fetch` can't get past the CORS origin
allowlist for.

## Sprint 12: Post-Audit Feature Backlog (In Progress)

Following the full-platform product audit (documented separately),
started systematically closing the gaps it identified, in priority
order, starting with items with zero external-account dependency:

- **Customer favorites bug fixed**: the account page rendered each
  favorite as a raw `Item {menuItemId}` string instead of the dish
  name. `favorites.service.ts`'s `listFavorites` now includes the
  related `MenuItem`'s name/price/availability, and the frontend
  renders it properly.
- **Customer order history added**: no past-orders view existed
  anywhere in the customer account UI. Added
  `GET /api/customer/orders` plus an account-page section listing each
  past order (restaurant, order number, status, total, date) linking to
  the existing public tracking page.
- **Saved payment methods UI added**: the backend
  (`payment-methods.service.ts`) already supported listing/deleting a
  customer's saved cards, but there was no frontend for it. Added an
  account-page section, and tightened the list endpoint to return only
  display-safe fields (brand/last4/expiry) — it previously returned the
  raw `providerToken` to the frontend unnecessarily.
- **Restaurant operating-hours editor added**: `RestaurantHours` and
  `GET/PUT /api/restaurants/me/hours` already existed and were already
  enforced at checkout (`isRestaurantOpenAt`), but had zero dashboard
  UI — an owner had no way to actually set their hours. Added a weekly
  hours editor to `/dashboard/restaurant`.

Remaining backlog (loyalty program, customer reviews,
analytics/reporting, staff permissions, kitchen display upgrades, a
real admin console, and OrderVora's own billing/subscription model) is
tracked and being worked through continuously; items requiring a
third-party account (additional payment/delivery/POS providers, SMS)
are deferred until those credentials exist.

**Marketing website (done):** the root page was previously a bare
login/dashboard splash with no hero, feature sections, SEO metadata,
sitemap, or robots.txt. Replaced with a real marketing page and added
Next.js `sitemap.ts`/`robots.ts` routes; fixed the page metadata, which
had never been updated from the Next.js starter template's default
"Create Next App" title/description.

**Menu variant/modifier dashboard UI (done):** the menu-commerce
backend already fully supported item variants and modifier groups/
options, but the dashboard could only edit an item's name/price/86
toggle — variants and modifiers could previously only reach the menu
via AI import, never manual entry. Added a per-item "Variants &
modifiers" panel plus a page-level modifier-groups manager.

**Coupon rules UI (done):** the coupon backend already enforced a
minimum order amount, an expiry date, and total/per-customer redemption
limits, but the dashboard's coupon-creation form only exposed the
discount type and value. All four fields are now settable from the
dashboard.

**Loyalty program (done):** `LoyaltyProgram`/`LoyaltyAccount`/
`LoyaltyTransaction` existed since Sprint 07 with zero application code
— the product audit's clearest example of a fully dead feature. Built
end to end: an owner dashboard page to configure points-per-dollar and
the redemption rate; automatic, idempotent point accrual on order
completion; and customer redemption at checkout, applied as an
independent atomic step inside `placeOrder`'s existing transaction (a
WHERE-guarded balance UPDATE, the same compare-and-swap pattern already
used for this session's refund/cash-payment race fixes — deliberately
not layered onto the coupon path's Serializable isolation, since it
doesn't need it). Requires one new `Cart` column in production — see
the note above the deployment log for the one-line SQL to run.

**Customer reviews/ratings (done):** one review per completed order,
enforced by a real unique constraint on `Review.orderId` (not just an
application-level check, so a concurrent double-submit can't create
two). The order-tracking page prompts for a star rating + optional
comment once an order is completed; the public storefront menu page
shows the restaurant's average rating and review count. Public review
listings expose only the reviewing customer's first name. Also
requires the new `Review` table — same SQL note applies.

**A note on schema changes and this deployment**: `apps/api` deploys to
Vercel as a serverless function, which — unlike the Docker/container
path documented in `docs/runbooks/deployment-architecture.md` — does
not run `prisma migrate deploy` on boot. Every schema change from this
point in the session (the loyalty program's `Cart.loyaltyPointsToRedeem`
column and the reviews feature's `Review` table) needs to be applied to
the live Supabase database by hand, the same way the original schema
was: via Supabase's SQL editor. The exact `ALTER TABLE`/`CREATE TABLE`
statements are in `apps/api/prisma/migrations/20260706090000_sprint14_loyalty_redemption/migration.sql`
and `apps/api/prisma/migrations/20260706093000_sprint14_reviews/migration.sql`.

## Sprint 15, Part 1 — Restaurant Analytics Dashboard

**Revenue, order, and top-item reporting (done):** a new owner-only
`analytics` module reports, over an adjustable 7/30/90-day window:
total revenue, order count, average order value, and a per-status order
breakdown (`GET /me/analytics/summary`); a day-by-day revenue/order-
count series for charting (`GET /me/analytics/revenue-by-day`); and the
restaurant's best-selling menu items by quantity, with revenue
attributed per item (`GET /me/analytics/top-items`). "Revenue" is
defined as every order that proceeded past payment — everything except
`CANCELLED` (never charged) and `FAILED` (payment never captured) —
which intentionally includes partially/fully refunded orders; a
net-of-refunds figure is left for a future iteration. The two grouped
queries (by day, by item) use parameterized raw SQL for the
`GROUP BY`/date-truncation work Prisma's type-safe query builder can't
express, with explicit `::int` casts so Postgres's `bigint` aggregates
don't surface as non-JSON-serializable `BigInt`s.

New dashboard page at `/dashboard/analytics`: three headline stat
cards, a status breakdown strip, a simple bar chart of revenue by day,
and a ranked top-10-items list, all following the same 7/30/90-day
toggle. No new database tables or columns — this reads entirely from
the existing `Order`/`OrderItem` tables, so no manual SQL step is
needed for this part of Sprint 15.

## Sprint 15, Part 2 — Staff Management UI

**Staff list + deactivation (done):** the owner-only `POST /auth/staff`
invite endpoint has existed since Sprint 01, but there was never a way
to see who'd been invited, or to revoke a staff account — once created,
a staff login was permanent. Added a real owner-only staff management
surface: `GET /auth/staff` lists everyone invited into the restaurant
(name, email, phone, active/deactivated, invited-on date), and
`PATCH /auth/staff/:id` lets the owner toggle a staff member's `isActive`
flag (new `User.isActive` column, default `true`, one more manual SQL
step in production — see below).

Deactivation is enforced in two places, not just at the next login:
`validateCredentials` rejects a deactivated account's password check
outright, and `rotateRefreshToken` checks the same flag on every
refresh-token exchange and revokes all of that user's remaining
sessions on the spot if it's off — so a deactivated staff member is
logged out within one access-token lifetime, not just blocked from
logging back in. This mirrors the existing token-theft-reuse detection
path (`revokeAllRefreshTokensForUser`), the same mechanism, a different
trigger. Deactivating/reactivating only ever targets a `RESTAURANT_STAFF`
account already tied to the calling owner's own restaurant — never
another restaurant's staff, and never the owner's own account.

New dashboard page at `/dashboard/staff`: an invite form (name/email/
temporary password) plus a list of existing staff with an Active/
Deactivated badge and a toggle button.

Requires one new `User` column in production:
`apps/api/prisma/migrations/20260706100000_sprint15_staff_isactive/migration.sql`
(`ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;`)
— same manual-SQL-editor step as every schema change this session, since
Vercel's serverless deploy doesn't run `prisma migrate deploy`.

**Sprint 15 is now complete.** Next: Sprint 16 (kitchen display upgrades,
admin platform).

## Sprint 16, Part 1 — Kitchen Display Upgrades

**Per-order elapsed timers, colour escalation, sound alert, and
auto-refresh (done):** the kitchen queue previously required a manual
"Refresh" click and gave no sense of how long an order had been
sitting. Each order card now shows a live `M:SS` timer since the order
was placed, ticking every second, colour-coded normal/amber/red at the
10- and 20-minute marks so an aging order is visible at a glance across
a busy kitchen. The queue also polls automatically every 15 seconds, and
plays a short tone (generated client-side via the Web Audio API — no
audio asset file) the moment a new order lands in the queue, with a
sound on/off toggle persisted per-browser. The timer/colour/new-order
logic is pure and unit-tested (`lib/kitchen-display.ts`); the sound
itself isn't (thin browser API wrapper) but fails silently rather than
breaking the page if audio is unavailable (e.g. autoplay-restricted
browsers). No backend or schema changes — this is entirely a frontend
upgrade to the existing `/dashboard/kitchen` page.

**Next in Sprint 16:** admin platform (restaurant management actions +
audit log).

## Sprint 16, Part 2 — Admin Platform (Restaurant Actions + Audit Log)

**Platform-admin suspend/unsuspend + audit trail (done):** the ADMIN
role previously had a read-only list of every restaurant on the
platform and no way to act on one. Added a real management action:
`PATCH /api/admin/restaurants/:id/suspend` (with an optional reason)
and `.../unsuspend`, backed by a new `Restaurant.isSuspended` /
`suspendedReason` pair of columns. This is deliberately a separate
switch from the owner-controlled `isPublished` — a restaurant an admin
suspends (e.g. for a ToS violation) stays suspended even if its own
owner tries to re-publish it, since the enforcement point is
`computeCheckoutQuote` (`quote.service.ts`), which now rejects a
suspended restaurant's checkout before any hours/capacity/delivery
checks run, the same way it already blocks checkout for a permanently
closed or over-capacity kitchen.

Every suspend/unsuspend action is written to a new `AdminAuditLog`
table (admin, action, target type/id, optional metadata, timestamp),
exposed read-only at `GET /api/admin/audit-log`. This is the platform's
first real audit trail — before this, no admin action anywhere left a
record of who did what and when.

The existing admin platform-overview screen (on `/dashboard` for the
ADMIN role) is upgraded from a static read-only table into an
interactive panel: each restaurant row gets a Suspend/Unsuspend button
(prompting for an optional reason on suspend), and a new audit log
list underneath shows the running history, refreshing after every
action.

Requires two new columns and one new table in production:
`apps/api/prisma/migrations/20260706110000_sprint16_admin_platform/migration.sql`
(`Restaurant.isSuspended`/`suspendedReason`, and the `AdminAuditLog`
table) — same manual Supabase SQL-editor step as every other schema
change this session.

**Sprint 16 is now complete.** Next: Sprint 17 (billing/subscription
model — blocked on the user's own Stripe Connect setup for pieces of
it; website builder editor + referral program are not blocked).

## Sprint 17, Part 1 — Full Website Builder Editor

**Section text editing + reordering (done):** the `/dashboard/website/editor`
page previously only let an owner tweak the tagline and brand color —
the rest of the generated site (hero copy, about-page story, section
order) required regenerating a whole new variation to change. The
backend's `PATCH /api/sites/:id/draft` has accepted a full partial
`SiteDefinition` (including `pages`, with all their sections) since
Sprint 06, but nothing in the frontend used that beyond the two design
fields — this closes that gap without any backend change. The editor
now lists every section on the homepage, lets the owner edit each
section's free-text props (headline/subhead/button label for the hero,
the about page's excerpt/story text, the CTA banner's label) inline
with autosave-on-blur, and reorder sections with up/down buttons.
Sections with no freeform text of their own (hours/location, gallery,
menu, contact info/form, footer — driven by live restaurant data, not
generated copy) still show in the list and are still reorderable, just
without a text editor. The reorder/field-mapping logic is pure and
unit-tested (`lib/site-editor.ts`); saves always send the *entire*
`pages` array back (not just the one field touched), since the
backend's patch is a shallow merge on top-level keys.

## Sprint 17, Part 2 — Referral Program

**Restaurant-to-restaurant referral tracking (done):** every restaurant
now gets its own shareable referral code the moment it's created,
visible on a new `/dashboard/referrals` page as a copyable link
(`/register?ref=CODE`). A prospective owner who registers via that link
has the code captured client-side (`localStorage`, since the referring
restaurant doesn't exist as an entity to link to until the *next* step,
restaurant creation) and, when they create their own restaurant, the
code is resolved to the referring restaurant's id and stored on the new
row (`Restaurant.referredById`) — an unrecognized or missing code is
silently ignored rather than blocking signup, the same
don't-let-a-secondary-feature-break-the-primary-action convention used
for coupons. The referrals page lists everyone referred so far (name,
published status, joined date).

This is **tracking only for now** — there's no reward to grant yet
since OrderVora's own billing/subscription system (the other half of
Sprint 17) hasn't shipped. Every referral relationship recorded today
is already in place to attach a reward to once billing exists; nothing
here needs to be rebuilt later, just wired up.

Requires two new nullable `Restaurant` columns in production:
`apps/api/prisma/migrations/20260706120000_sprint17_referral_program/migration.sql`
(`referralCode` unique, `referredById`) — same manual Supabase
SQL-editor step as every other schema change this session.

**Next in Sprint 17:** OrderVora's own billing/subscription model —
this is the one piece of the full roadmap that needs the user to set up
their own Stripe Connect (or equivalent) account before it can be
built; will be surfaced as a discrete step when reached rather than
assumed.

## Sprint 18, Part 1 — Owner Auth Foundation

**Rebuilt owner/staff authentication (done):** the `User` table gains a
full password-reset, email-verification, and session-management story,
mirroring the Sprint 07.7 customer-auth pattern:

- **Forgot / reset password**: `POST /api/auth/forgot-password` always
  resolves regardless of whether the email matches an account
  (enumeration prevention), emailing a single-use, hashed, 1-hour token
  when it does. `POST /api/auth/reset-password` consumes the token,
  updates the password, and revokes every existing refresh token for
  that account.
- **Change password**: `POST /api/auth/change-password` (authenticated)
  re-verifies the current password before accepting a new one, and also
  revokes every other session.
- **Email verification**: registering now fires a verification email
  (`EmailVerificationToken`, same hashed/single-use/TTL shape as the
  reset token, 24h). `emailVerified` is **not** enforced at login — it
  only gates a dashboard banner ("Please verify your email") with a
  resend button, the same soft-nag pattern most SaaS products use rather
  than blocking sign-in.
- **Remember Me / persistent sessions**: `RefreshToken` gains a
  `rememberMe` column, set at login and carried forward through every
  subsequent rotation (not just the first refresh) — so a session-only
  login doesn't silently become persistent, or vice versa, just because
  a silent token refresh happened while the tab stayed open. When
  `rememberMe` is false, the refresh cookie is set without an `expires`
  attribute, making it a true browser session cookie.
- **Logout of all devices**: `POST /api/auth/logout-all` revokes every
  active refresh token for the account and clears cookies — exposed as
  a "Log out of all devices" button on the new `/dashboard/profile` page.
- **Owner profile**: `PATCH /api/auth/profile` updates name/phone;
  `/dashboard/profile` is the single page for profile edits, password
  changes, resend-verification, and logout-all-devices.

**Frontend**: new `/forgot-password`, `/reset-password`, and
`/verify-email` pages (styled to match the existing login/register
pages); the login page gained a Remember Me checkbox (defaults checked)
and a Forgot Password link; the dashboard shows a verification banner
when `emailVerified` is false.

**Explicitly deferred (needs the user's own account setup):** Google
Sign-In and Apple Sign-In require registering OAuth apps with each
provider and supplying client ID/secret — not built this sprint since
there's no working credential to wire up yet. Will be surfaced as a
discrete step once the user is ready to register those apps.

Requires one new migration in production:
`apps/api/prisma/migrations/20260709000000_sprint18_owner_auth/migration.sql`
— adds `User.emailVerified`, `RefreshToken.rememberMe`, two new tables
(`PasswordResetToken`, `EmailVerificationToken`), and one new
`NotificationType` enum value (`EMAIL_VERIFICATION_REQUESTED`) — same
manual Supabase SQL-editor step as every other schema change this
session.

## Sprint 18, Part 2 — Business Setup Wizard

**Replaces the old "No restaurant found" flow (done):** an owner with no
business (or one who closed the tab mid-setup) is now automatically sent
to `/setup` — a 7-step wizard — by `dashboard/layout.tsx`, instead of
ever landing on a dashboard page that assumes a business already exists,
or having to manually visit `/dashboard/restaurant` from the "More" menu
to create one.

- **Business Type** (new step): pick from Restaurant, Coffee Shop, Deli,
  Vape Shop, Convenience Store, Bakery, Pizza, Retail, or Other —
  `Restaurant.businessType`, a new enum column. Picking a type creates
  the business record immediately (name defaults to "My Business" until
  step 2), so the wizard has something to attach progress to from the
  very first step.
- **Business Info**: name, phone, description.
- **Location**: address (skippable).
- **Payment Provider**: connect Stripe inline (reuses the existing
  `connectPaymentProvider` endpoint) or skip and connect later from
  Dashboard → Payments.
- **Menu Import**: upload a photo/PDF (reuses the existing import
  pipeline) or skip and add items manually later.
- **Website Theme**: reuses the existing AI site generator
  (`createSite` + `startGeneration`) to build a website immediately, or
  skip for later.
- **Finish**: hands off to the new Launch Center (`/dashboard/launch`,
  Sprint 18 Part 3) instead of the plain dashboard.

**Resumable across logins/devices (done):** progress is tracked
server-side via `Restaurant.setupStep` (`BUSINESS_TYPE` →
`BUSINESS_INFO` → `LOCATION` → `PAYMENT_PROVIDER` → `MENU_IMPORT` →
`WEBSITE_THEME` → `DONE`), not client-side storage — closing the tab and
logging back in on any device resumes exactly where the owner left off.
Existing restaurants (created before this wizard existed) are
backfilled to `DONE` in the migration so they're never redirected into
it.

**New/changed API:** `POST /api/restaurants` now accepts `businessType`
alone (name optional, defaulting server-side); `PATCH
/api/restaurants/me` accepts `businessType`/`lat`/`lng`; new `PATCH
/api/restaurants/me/setup-step` advances the resume point.

Requires one new migration in production:
`apps/api/prisma/migrations/20260709221300_sprint18_business_setup_wizard/migration.sql`
— adds `Restaurant.businessType` and `Restaurant.setupStep` (with a
data-backfill marking every existing restaurant `DONE`) — same manual
Supabase SQL-editor step as every other schema change this session.

**Explicitly out of scope this part** (per instruction — functionality
over visual redesign): the wizard reuses the existing warm/mobile-first
design tokens already shipped elsewhere in the app rather than
introducing new visual design; it does not yet rename "Restaurant" to
"Business" anywhere outside its own new screens.

**Next in Sprint 18:** Launch Center, Test Order
Flow, import-processing UX fix, website-preview UX fix, and a mobile
responsive pass — the remaining six pieces of the Sprint 18 "Owner
Experience Foundation" spec.

## Sprint 18, Part 3 — Launch Center

A new `/dashboard/launch` page is now the landing point right after setup
finishes, replacing the plain dashboard as the wizard's `DONE` handoff.
It gives a newly-onboarded owner everything needed to actually go live
in one place:

- A scannable QR code (`qrcode.react`) encoding the real customer
  ordering link (`/order/{restaurantId}` — the functional storefront,
  not the placeholder AI-generated "Site" module).
- Copy/open rows for the customer ordering link, kitchen display (KDS),
  and dashboard, so an owner can hand off the right link to the right
  person (front counter, kitchen, themselves) without hunting for it.
- A "Test order flow" action that hands off to the guided Test Order
  Flow (Sprint 18 Part 4, below).
- A "Go to dashboard" fallback for owners who just want to skip ahead.

Added a "Launch" entry to the desktop dashboard nav pointing at the new
page. No schema or API changes — this part is presentation-only, built
entirely on data the Business Setup Wizard (Part 2) already collects.

**Explicitly out of scope this part:** any visual redesign beyond the existing warm
mobile-first design tokens.

**Next in Sprint 18:** Test Order Flow, import-processing UX fix,
website-preview UX fix, and a mobile responsive pass.

## Sprint 18, Part 4 — Test Order Flow

A guided `/dashboard/launch/test-order` page, reached from the Launch
Center's "Test order flow" button, walks a newly-onboarded owner through
placing one real order on their own storefront before sharing the link
with actual customers:

- A numbered 3-step checklist (open the live ordering page, complete a
  real checkout, confirm it landed on Orders/Kitchen).
- An "Open my ordering page" action that opens the real `/order/{id}`
  storefront in a new tab.
- A lightweight self-confirmation ("Did your test order go through?" →
  "Yes, it worked") that surfaces a success message and a way back to
  the Launch Center — no new database state; this is a one-time UX
  nudge, not a gating requirement before an owner can share their link.

No schema or API changes. **Explicitly out of scope:** persisting
whether a test order was completed, and any visual redesign beyond the
existing warm mobile-first design tokens.

**Next in Sprint 18:** import-processing UX fix, website-preview UX
fix, and a mobile responsive pass.

## Sprint 18, Part 5 — Import Processing UX

Finishes and polishes the `/dashboard/import` review workflow:

- **Bulk review actions (done):** the per-item selection checkboxes in
  `ReviewEditor` existed since Sprint 10 but had no action wired to them
  (dead UI). They now drive a real bulk-action bar: **Move to category**
  (moves every selected item into a typed/existing category, creating a
  new category on the fly if it doesn't exist yet) and **Delete
  selected**, plus a per-category "select all" checkbox in each section
  header. All of this is local editor state — nothing is persisted until
  Save/Approve, same as existing inline edits.
- **Removed a dead "Edit" button** that only focused the row's checkbox
  and did nothing else — confusing UI with no real function.
- **Fixed a status-indicator bug** on the review page (`/dashboard/import/[id]`):
  the colored status dot next to the job status label was hardcoded to
  amber regardless of the job's actual status; it now reflects
  FAILED/REJECTED (red), AWAITING_REVIEW (blue), APPROVED (green), or
  PENDING/PROCESSING (amber).
- **Retheme:** `BusinessProfilePreview` (the "profile update applied on
  approve" card shown above the review editor for Website/Google Maps
  imports) was still on the old dark/zinc design language; it now
  matches the warm cream/gold system used everywhere else in the import
  flow.
- **Test fixes:** `upload-form.test.tsx` and `review-editor.test.tsx`
  had gone stale against earlier UI copy/structure changes (radio-button
  source picker → button grid, "Import"/"Reject" → "Start
  import"/"Reject import"/"Approve & continue") and were failing before
  this part; updated to match current UI, plus new coverage for the
  bulk-action bar.

**Explicitly out of scope this part:** the AI import progress bar
(`ImportProgress` in `/dashboard/import`) intentionally stays a
synthetic 7-stage breakdown derived from the coarse `PENDING →
PROCESSING → AWAITING_REVIEW` status — `ImportJob` has no real
per-stage granularity on the backend (unlike site generation's
`GenerationStage` enum), so building a "more real" version would either
require a schema change (out of scope for a UX-only part) or would be
equally synthetic; left as-is rather than reworked for cosmetic churn.

**Next in Sprint 18:** website-preview UX fix, and a mobile responsive
pass.

## Sprint 18, Part 6 — Website Preview UX

Retheme + real progress for the "choose a design → preview → publish"
chain — the manual `/dashboard/website/*` Website Hub, which had never
been migrated off the original dark/zinc styling used before the warm
cream/gold system landed (the newer AI Builder flow at
`/dashboard/builder/*` was already warm-themed, with one exception —
see below):

- **`FinaleReveal`** (`dashboard/builder/finale-reveal.tsx`) — the "your
  business is officially open" screen right after auto-publish, the
  single most-seen moment in this area — rethemed from dark/zinc to the
  warm system, matching the screen immediately before it
  (`LiveBuildScreen`) which was already on-brand.
- **`DevicePreview`** (`variations/[id]/device-preview.tsx`, shared by
  `FinaleReveal` and the variation preview page) — rethemed device-toggle
  buttons and frame; loading state changed from plain "Loading preview…"
  text to a pulsing skeleton block (better loading state, per this
  part's goal); preview iframe height is now responsive (300px on
  mobile, 600px at `sm:` and up) instead of a fixed 600px that forced
  scrolling on small screens.
- **`GenerationProgress`** (`variations/generation-progress.tsx`) — was a
  single generic `w-1/2 animate-pulse` bar with a one-line stage label;
  rewritten to a real weighted stage checklist (done/active/upcoming),
  mirroring the same `GenerationStage` sequence and relative-duration
  weighting the AI Builder's `LiveBuildScreen` already uses, scoped to
  just this flow's 8 generation stages so 100% lands exactly at
  `FINALIZE` (not diluted by the Builder's later select/publish/QR
  steps, which don't apply here).
- **`variations/page.tsx`, `variations/[id]/page.tsx`, `select-button.tsx`**
  — rethemed to match (the `GenerationProgress`/`DevicePreview` cards
  above now live inside these pages; leaving the page shells on the old
  theme would have looked broken next to them).
- **Publish flow** (`publish/page.tsx`, `publish-actions.tsx`,
  `domain-form.tsx`) — rethemed for a cleaner, on-brand publishing
  screen; domain rows and the add-domain form now stack vertically on
  mobile instead of a cramped fixed-row layout; status badge, publish
  warning, and "(live)" release tag now use the same badge language as
  the rest of the app instead of raw `<span>` colors.

**Explicitly out of scope this part:** the Website Hub landing page
(`dashboard/website/page.tsx`), Score, and Messages pages — outside
this part's "preview/publish" scope; whether `/dashboard/website/*`
(manual, secondary path) and `/dashboard/builder/*` (orchestrated,
primary path) should eventually be consolidated into one flow is a
product decision, not resolved here — this part brings both onto one
consistent visual language without changing which one owners are
routed through.

**Next in Sprint 18:** final mobile UX review.

## Sprint 18, Part 7 — Final Mobile UX Review

A sweep for the "improve navigation," "fix spacing," "fix overflow," and
"improve responsive behavior" goals across the owner dashboard,
targeting the two concrete, verified-in-browser bugs below rather than
a full page-by-page redesign (out of scope — see Part 6's note on
`/dashboard/website/*` vs `/dashboard/builder/*`):

- **Fixed: five owner sections were completely unreachable on mobile.**
  The mobile bottom tab bar's "More" tab was a plain link straight to
  `/dashboard/restaurant`, which has no links onward — so Launch,
  Import, Website (from most pages), Analytics, and Profile had no
  mobile navigation path at all. `DashboardNav` (used by 25+ pages) and
  the Overview page's separate, hand-rolled mobile nav (`dashboard-overview.tsx`,
  which duplicates `DashboardNav`'s bottom bar with different tabs and
  the same dead "More" link — a pre-existing duplication, not introduced
  here) both now open a real sheet listing the missing sections when
  "More" is tapped. Verified end-to-end in a real mobile-viewport
  browser session (login → dashboard → open More → navigate).
  `DashboardNav` gets its first test file (`dashboard-nav.test.tsx`,
  4 tests) covering open/close/navigate; `dashboard-overview.tsx` has no
  test file (pre-existing) and none was added — it's a single dense,
  minified-style component that doesn't match this codebase's test
  patterns for straightforward extraction.
- **Fixed: content hidden behind the fixed mobile nav bar, and hidden
  horizontal overflow.** 20 dashboard pages shared one identical shell
  className with no bottom padding reserved for the fixed mobile tab bar
  (content's last ~60px was tucked underneath it) and no
  `overflow-x-hidden` guard. Mechanically corrected to the same
  `pb-28`/`overflow-x-hidden` shell already used by every Sprint 18 page
  (`import`, `launch`, `setup`, `builder/*`) — a structural fix only,
  not a retheme (these pages' internal cards/colors are untouched and
  still on the pre-warm-palette dark/zinc styling; the visual redesign
  of these pages is separate, larger work).
- **Fixed: `/dashboard/orders` mobile bugs**, found auditing every owner
  screen for this class of bug (horizontal overflow, unwrapped tables,
  missing loading states) after the shell fix above:
  - The 9-item status-filter row had no wrap or scroll handling — on a
    narrow viewport `READY`/`OUT_FOR_DELIVERY`/`CANCELLED`/`REFUNDED`
    were pushed off-screen with no way to reach them (previously masked
    by the whole *page* scrolling sideways to reveal them — itself a
    bug, and one the `overflow-x-hidden` shell fix above would have
    turned into "permanently unreachable" without this). Fixed with an
    edge-to-edge horizontally-scrollable strip on mobile that becomes a
    normal wrapping row at `sm:` and up.
  - The orders `<table>` itself had no scroll wrapper, so its five
    columns either squeezed illegibly or forced page-level horizontal
    scroll on a narrow screen. Wrapped in its own `overflow-x-auto` with
    a `min-w` floor — the same pattern `admin-panel.tsx` already uses.
  - The list showed "No orders yet." during the initial fetch, not just
    when a fetch actually returned zero orders — indistinguishable from
    a real empty state. Added a genuine loading row.
  
  Other owner screens were checked for the same bug classes and found
  already handled correctly — list/grid screens already use
  `grid-cols-1 sm:grid-cols-N` responsive breakpoints, and no other
  audited page had a multi-item horizontal row without wrap or scroll of
  its own.
- **Fixed:** `orders/[id]/page.test.tsx` — one of three known-stale
  frontend tests flagged during environment setup, failing because its
  `next/navigation` mock didn't include `usePathname` (needed by
  `DashboardNav`, which the page renders). Directly relevant to this
  part's navigation work, so fixed here; two-line mock fix, now passing.

**Explicitly out of scope:** retheming the 20 structurally-fixed pages'
internal cards/colors off dark/zinc onto the warm cream/gold system —
a full visual pass, not a mobile-structure fix, and a much larger unit
of work than this part's stated goals; `live-build-screen.test.tsx`'s
3 pre-existing failing tests (a caption-timing assertion issue in the
AI Builder flow, unrelated to navigation/spacing/overflow — confirmed
pre-existing by diffing against the branch state before this part).

## Sprint 18 — Complete

All 7 parts of the "Owner Experience Foundation" are now done: owner
auth foundation, Business Setup Wizard, Launch Center, Test Order Flow,
Import Processing UX, Website Preview UX, and this mobile UX review.
See `PROJECT_MEMORY.md` and `ROADMAP.md` for the updated current-state
summary and what comes after Sprint 18.

# Release Notes — Sprint 19: Premium Mobile Dashboard Redesign

Sprint 19 goal: not a recolor — rebuild spacing, typography, hierarchy,
cards, navigation, animations, loading states, empty states, and
interactions across every remaining owner dashboard page still on the
pre-Sprint-18 dark/zinc styling, mobile-first, on top of a shared,
reusable component library instead of continuing the one-off-per-page
approach.

## Sprint 19, Part 1 — Design System Foundation

New `apps/web/src/components/ui/` — a shared component library
extracted from the warm cream/gold patterns Sprint 18 already proved
out in `import`/`launch`/`setup`/`builder`, not invented from scratch:

- **`PageShell`** — the standard page wrapper (`DashboardNav` + warm
  background + `overflow-x-hidden` + `pb-28` mobile-nav clearance),
  parameterized by max-width instead of every page hand-rolling the
  same shell string.
- **`PageHeader`** — eyebrow label + title + description + optional
  trailing action, the `AI IMPORT HUB` / `BUSINESS OVERVIEW` header
  pattern generalized.
- **`Card`** — the white rounded-3xl bordered surface used everywhere,
  with `default`/`compact`/`none` padding.
- **`Badge`** — status pill with 5 semantic tones (success/warning/
  danger/info/neutral) replacing every page's own ad hoc `statusTone()`/
  `statusClass()` function.
- **`Button`** — primary/secondary/danger/ghost variants, `md`/`sm`
  sizes, consistent touch targets and tap feedback.
- **`EmptyState`** — a real designed empty state (title + description +
  optional action) instead of a bare "No X yet." string.
- **`Skeleton`/`SkeletonRows`** — this codebase's first shared loading
  primitive; previously every screen hand-rolled its own loading text
  or pulse block.
- **`FilterPills`** — the scrollable-on-mobile/wrapping-on-desktop
  status-filter row pattern, generalized from the Orders page fix in
  Sprint 18 Part 7.
- **`ResponsiveTable`** — a `<table>` wrapper with its own horizontal
  scroll and `min-width` floor, so a data table never forces the whole
  page to scroll sideways.

10 unit tests (`ui.test.tsx`) cover `Button`, `Badge`, `EmptyState`, and
`FilterPills`'s interactive/branching behavior.

## Sprint 19, Part 2 — Orders Module

First page group rebuilt on the Part 1 foundation, chosen because it's
the highest-traffic owner screen and already had its mobile structure
(not visuals) fixed in Sprint 18 Part 7:

- **`/dashboard/orders`**: real card-based list on mobile (tap target
  per order: number, total, status badge, timestamp) instead of a
  cramped 5-column table squeezed onto a phone screen; the table is
  kept for `sm:` and up. Real `Skeleton` loading rows replace the
  "Loading…" table cell; a real `EmptyState` replaces the bare "No
  orders yet." text. Status text now renders as color-coded `Badge`s
  instead of raw uppercase strings.
- **`/dashboard/orders/[id]`**: status/payment/fulfillment now render
  as `Badge`s in a summary card with the total prominently displayed;
  items list, actions, refund, and driver-assignment sections rebuilt
  on `Card`/`Button`; loading state is now `Skeleton` blocks instead of
  plain "Loading…" text. All existing driver-assignment behavior and
  test-covered text (`Order #{n}`, `Driver` heading, `No driver
  assigned yet.`, `Currently assigned to… status: X`, `Assign driver`/
  `Reassign driver`) preserved exactly — `orders/[id]/page.test.tsx`'s
  3 tests still pass unmodified.

Verified: typecheck, lint, full test suite (94 passed, only the 3
pre-existing unrelated `live-build-screen.test.tsx` failures remain),
full production build, and a live mobile-viewport (390×844) browser
session against the dev server (screenshot delivered separately).

**Next in Sprint 19:** Menu module, then Kitchen/Ops, Staff/Payments/
Settings, Marketing/Analytics, and the remaining Website Hub pages —
delivered as further verified parts.

## Sprint 19 — Scope Change

The broader page-by-page dashboard redesign above (Parts 1-2 shipped;
Menu/Kitchen/Staff/etc. were next) was paused mid-flight per updated
direction: finish the product to production quality first, in small,
individually-approved milestones, rather than a continuous sweep.
Sprint 19 now proceeds as **Sprint 19A, 19B, …** — each a scoped,
explicitly-approved unit of work. The Part 1 design system foundation
and Part 2 Orders module already shipped remain in place and in use.

## Sprint 19A — AI Import Experience

Full redesign of the AI Menu Import experience, approved and delivered
exactly to spec (see approval decisions below):

- **One unified import hub** — removed the old separated "AI import" /
  "POS connections" / "delivery platforms" sections entirely. All 13
  sources (Photo, PDF, Spreadsheet, Website, Google Maps, DoorDash,
  Uber Eats, Grubhub, Toast, Clover, Square, SpotOn, Revel) now live
  together in one compact 3-column grid.
- **Real branded icons** (`source-icons.tsx`) — each source is a
  colored tile + glyph evoking that brand's actual color and shape
  language (DoorDash red, Uber Eats green bag, Grubhub red bite mark,
  Toast orange, Clover green four-leaf, Square black, Google Maps'
  red/blue pin, SpotOn teal pin, Revel blue), replacing the generic
  beige placeholder icons. These are original marks, not reproductions
  of trademarked logo files — no internet access in this environment
  to source official brand assets.
- **JSON merged into Spreadsheet** — no separate, unbacked JSON card;
  the existing Spreadsheet source already covers CSV/Excel/JSON-shaped
  data via the `xlsx`-based CSV adapter.
- **Honest "Coming soon" / "Enterprise" labels, never a fake workflow**
  — DoorDash/Uber Eats/Grubhub have stub backend adapters only
  (`implemented: false`); Toast/Clover/Square are a separate, existing
  POS-sync feature (`/dashboard/pos`), not import sources; SpotOn/Revel
  don't exist in the backend at all. Tapping any of these shows an
  inline note and does nothing else — no backend changes were made in
  this milestone, per explicit instruction.
- **No "Start Import" button** — selecting a file or submitting a URL
  (Enter key, or the inline arrow button) starts the import
  immediately.
- **The upload card transforms in place** through picking → live AI
  progress → completion — no separate progress section, no scrolling
  required to find it. Live progress shows a real stage name (Uploading
  / OCR Reading / AI Understanding / Building Categories / Building
  Products / Generating Descriptions / Saving Database / Completed), a
  percentage, an 8-dot stage stepper, and an "About Xs left" estimate —
  all driven by a smooth interval-animated percentage that climbs
  toward a ceiling set by the job's real status (PENDING/PROCESSING/
  AWAITING_REVIEW), an honest "still working, getting closer" indicator
  rather than a fake precise countdown (same accepted tradeoff pattern
  as Sprint 18 Part 5, since the backend has no finer-grained stage
  data than those three values).
- **Completion state** — "✅ Menu Ready", product/category counts, and
  a prominent Review Menu action, auto-navigating to the review page
  after a short pause.
- **Import History is strictly historical** — the job currently live in
  the hub card is excluded from the history list below it; history
  never duplicates or becomes the primary workflow.
- **Bug found and fixed during live mobile verification**: a job that
  failed before ever appearing in a server poll as active would leave
  the card stuck showing fake "still processing" progress forever,
  since `displayJob = activeJob ?? localJob` couldn't distinguish
  "hasn't polled yet" from "polled and it's genuinely gone." Fixed with
  a 7-second grace period (past the 6s poll interval) after which the
  optimistic local job state is dropped if the server hasn't confirmed
  it — verified against a real failing import in a live browser
  session, with a regression test added.

**Verified:** typecheck, lint, full test suite (103 passed — the
previously-known pre-existing `live-build-screen.test.tsx` failures
were independently fixed elsewhere on this branch and are now green
too), full production build, and multiple live mobile-viewport
(390×844) browser sessions covering the picker grid, coming-soon
handling, URL/file auto-start, live progress, and the failure-fallback
fix. 10 new tests in `import-hub.test.tsx`.

**Explicitly out of scope this milestone** (per instruction): no
backend changes, no new import adapters or POS integrations — the 8
platforms without real backend support remain "Coming soon"/
"Enterprise" until a future milestone adds real integration work.

## Sprint 19A — UX Validation Pass

A full manual review of the entire Import experience (first tap through
final Review Menu) against a 20-point production-quality checklist,
covering code review, live mobile-viewport (390×844) browser sessions,
and edge-case testing (simulated upload failures, network interruptions,
rapid double-submission, browser Back navigation). Found and fixed four
real bugs; everything else on the checklist passed as-is.

**Bugs found and fixed:**

- **Layout shift on every transition.** The picker card (~730px on a
  731px-tall grid of 13 sources) collapsed to the progress card (~150px)
  instantly — measured live: a 580px snap with zero animation, the
  single worst offender against "premium." Added `AnimatedHeightSwap`,
  a small wrapper that measures content height via `ResizeObserver` and
  animates the container's height across all three states (picker →
  progress → completion) instead of an abrupt jump. Verified live: the
  580px collapse now animates smoothly over ~380ms instead of snapping
  instantly.
- **Forced-redirect loop.** Landing on `/dashboard/import` with an
  already-`AWAITING_REVIEW` job (e.g. the owner pressed Back after
  reviewing, without approving or rejecting yet) force-navigated them
  straight back to the review page ~2.2s later — confirmed live via a
  simulated completed job, reproduced on the first fresh page load every
  time. The auto-redirect now only fires on a genuine
  PENDING/PROCESSING → AWAITING_REVIEW transition witnessed while the
  component is mounted (tracked via a previous-status ref), not merely
  "the active job happens to already be complete when this page loads."
  Verified live: landing on an already-complete job now stays put; a
  live completion still auto-redirects as designed.
- **Silent partial failures in multi-photo batches.** Forcing 2 of 4
  photo uploads to fail (via request interception) showed zero
  in-the-moment feedback — the card just moved on to showing progress
  for whichever photo succeeded first, with the failures visible only
  by scrolling into Import History and noticing them. Restored a
  batch-result summary (dropped during the original rewrite), now shown
  inline on the progress card: "N photos started importing — M failed
  to upload and won't appear below."
- **No re-entrancy guard on submit.** `submitUrl`/`submitFiles` had no
  guard against being invoked again while already in flight — a
  real risk since the URL field's Enter-key handler had no debounce.
  Added an `uploading` guard to both.

**Also found and fixed while verifying the above live** (not on the
original checklist, but real): three JSX text templates
(`{count} label{count === 1 ? "" : "s"} more text`) rendered with a
missing space in the actual Chromium/Turbopack production build —
`"1failed"` instead of `"1 failed"` — despite passing in jsdom/vitest,
which uses a different JSX transform than Next's Turbopack dev/build
pipeline. Converted all three (plus one more of the same shape in
`review-editor.tsx`'s per-category item count, which also lacked
singular/plural handling entirely — "1 items" — found reviewing the
full flow through to Review Menu as instructed) to explicit template
literals, which are unambiguous regardless of JSX whitespace handling.
Verified via real DOM `textContent` reads in the live browser, not just
visual screenshot inspection, since this class of bug is easy to
eyeball past.

**Checklist items verified without changes needed:** no horizontal
overflow at 390px or 375px (iPhone SE) widths; safe-area-inset CSS
correct in `DashboardNav` (already covered by Sprint 18, unaffected
here — real device notch behavior can't be simulated in Chromium
automation, so this is a code-level check, not a rendered one); brand
icon colors match each platform's real identity; spacing/typography
consistent throughout; Import History correctly excludes the active
job at every step, including through the redirect-loop fix; invalid
files and network interruptions surface through the existing generic
error path (already exercised live via real DNS/HTTP failures during
Sprint 19A's original build).

**Environment note:** `api.openai.com` is blocked by this sandbox's
network egress policy, so real AI-processed completions (photo/PDF)
could not be exercised end-to-end here — verified the completion state
via a database-simulated `AWAITING_REVIEW` job instead, and the
underlying AI call path is unchanged from Sprint 18 (already
production-verified there). Not an application bug.

**Verified:** typecheck, lint, full test suite (107 passed — 5 new
regression tests for the redirect-loop, re-entrancy, and partial-failure
fixes), full production build, and repeated live mobile-viewport browser
sessions re-confirming each fix after implementation.

## Sprint 19B-1 — Premium Header & Navigation

UI-only sprint: replaced the absence of a mobile top nav with a premium
slide-in-from-left drawer (Apple/Linear/Arc-Browser-inspired), triggered by
a new ☰ hamburger button. No routing or backend changes; the existing
bottom tab bar and "More" bottom sheet are untouched.

**What was built:**

- `DashboardDrawer` (`apps/web/src/components/dashboard-drawer.tsx`) — a
  mobile-only (`lg:hidden`) header row (hamburger + "OrderVora" wordmark)
  plus a slide-in drawer panel. The drawer stays mounted at all times and
  is class-toggled (`translate-x-0` / `-translate-x-full`, backdrop
  `opacity-100` / `opacity-0`) rather than conditionally rendered, so both
  the open and close transitions animate smoothly (300ms ease-out) instead
  of only the open direction.
- Backdrop: `bg-black/40 backdrop-blur-sm`, dismisses the drawer on tap.
- 9 menu items with `lucide-react` icons (Dashboard, Orders, Menu,
  Customers, AI, Website, Marketing, Settings, Help). Dashboard, Orders,
  Menu, AI, Website, and Settings map to existing routes (Settings →
  `/dashboard/restaurant`, the closest existing settings surface).
  Customers, Marketing, and Help have no corresponding page yet, so they
  render as non-navigating rows with a "Soon" badge rather than linking
  to a 404.
- Active-page highlighting reuses the same `pathname === href ||
  startsWith(href)` logic already used by `DashboardNav`'s desktop and
  bottom-tab links.
- `pt-[max(20px,env(safe-area-inset-top))]` on the drawer panel for iPhone
  notch clearance.
- Wired into `DashboardNav` (automatic coverage across every page that
  renders it — ~25 owner dashboard routes) and separately into
  `dashboard-overview.tsx`, which has its own hand-rolled header/nav
  instead of using `DashboardNav`.

**Bug found and fixed during implementation:** the new drawer's "Close
menu" buttons (backdrop + explicit X) collided with the existing "More"
bottom-sheet's "Close menu" button on accessible name, breaking an
existing `dashboard-nav.test.tsx` test once both were mounted together.
Renamed the drawer's close controls to "Close navigation menu" to keep
both controls independently addressable.

**Verified:** typecheck, lint, full test suite (107 passed), production
build (all ~40 routes compiled clean), and live Playwright sessions at
390×844 and 375×812 covering: drawer open/close animation, backdrop tap
outside the panel, zero horizontal overflow before/after opening the
drawer, active-page highlighting on both a `DashboardNav` page (Orders)
and `dashboard-overview.tsx`, "Soon" items not navigating, and the
existing bottom tab bar still present and unaffected. No console or page
errors in any run.

Stopping here per instruction — no further Sprint 19B parts started.

## Sprint 19B-2 — Unified Mobile Layout Foundation

UI-only sprint: unified the container/padding/background foundation
across the owner dashboard and the surrounding auth screens. No new
features, no backend changes, no visual-language redesign — every page's
inner content (cards, forms, colors) is untouched; only the outer shell
each page sits in was consolidated onto the shared `PageShell` component.

**Audit findings:**

- Only 2 of ~30 dashboard pages (Orders, Orders detail) used the shared
  `PageShell`. Everything else hand-rolled its own copy of the wrapper.
- 19 pages (menu, restaurant, profile, staff, analytics, coupons,
  payments, pos, kitchen, kitchen-capacity, delivery, driver, referrals,
  tables, loyalty, website + 3 website subpages) were still on a
  pre-Sprint-19 `bg-zinc-50 ... dark:bg-black` shell — the "legacy
  dark/zinc UI" CLAUDE.md calls out. In OS dark mode these pages rendered
  with a black background while every other page stayed warm cream: a
  real page-to-page jump, not just a stale color choice.
- 4 pages (website/publish, website/variations, import, import/[id]) had
  already moved to the cream palette but hand-copied the wrapper markup
  instead of using `PageShell` — four independent copies free to drift.
- `dashboard-overview.tsx` didn't use `PageShell`/`DashboardNav` at all;
  its desktop padding (`lg:px-10 lg:pb-10 lg:pt-9`) was a near-miss of
  `PageShell`'s `lg:p-10`.
- `reset-password` and `verify-email` were never migrated off the
  original Next.js starter template (no cream background, leftover
  `dark:bg-black` scaffold classes) despite sitting in the same auth
  journey as the already-correct `login`/`register`/`forgot-password`.
- `dashboard/page.tsx`'s plain-user error fallback ("Could not load your
  account") had different padding, no `overflow-x-hidden`, and no nav —
  a layout jump and a dead end if it ever rendered.
- The "More" bottom sheet was already pixel-consistent between
  `DashboardNav` and `dashboard-overview.tsx`'s duplicate — verified, no
  fix needed.

**What was changed:**

- Added `xl` to `PageShell`'s `maxWidth` map (several legacy pages used
  `max-w-xl`, which the shared component didn't support yet) — additive,
  no visual change to existing `PageShell` users.
- Migrated all 23 pages onto `<PageShell maxWidth="...">`, preserving
  each page's exact current max-width, deleting duplicated wrapper markup
  and each page's individual `DashboardNav` import/usage. Three of these
  (kitchen-capacity, delivery, loyalty) used a `<form>` element as their
  own inner wrapper; restructured so the form sits inside `PageShell`'s
  children instead of doubling as the shell, and gave their previously
  bare, nav-less "Loading…" early-return states a `PageShell` wrapper too
  (was a second, more severe layout jump on first paint).
- Aligned `dashboard-overview.tsx`'s desktop padding to `lg:p-10`,
  matching `PageShell` exactly. Its intentional desktop two-column
  sidebar layout — a genuine structural difference from other pages, not
  a foundation bug — was left as-is.
- Rebuilt `reset-password` and `verify-email` on the established
  `login`/`register`/`forgot-password` shell (branded header, cream
  card), preserving all existing logic and copy.
- Wrapped `dashboard/page.tsx`'s plain-user error fallback in `PageShell`
  so a failed load still has navigation instead of stranding the user.

**Deliberately left untouched** (flagged, not fixed, to respect "no
redesign" and "no new features"): the AI Builder's full-screen cinematic
flow, the Launch/test-order wizard, the Setup wizard (uses `max-w-lg` vs.
the auth pages' `max-w-md` — different content, not a bug), and the
customer-facing `/account/*` + `/order/*` checkout pages — none of these
are part of the owner dashboard/onboarding surface this sprint targeted,
and touching them risked exactly the redesign/feature creep ruled out.
The bottom-tab item-set difference between `DashboardNav`
(Overview/Orders/Menu/AI) and `dashboard-overview.tsx`'s own tabs
(Home/Orders/Menu/Website) is a product/IA decision, not a layout-width
bug — flagged, not changed.

**Verified:** typecheck, lint, full test suite (111 passed, unchanged),
production build (all 53 routes compiled clean), and live Playwright
sessions at 375×812, 390×844, and 430×932 (iPhone Pro Max) across 22
representative pages spanning every migrated family — zero horizontal
overflow anywhere, zero console/page errors, and the shared container's
left edge measured at an identical 16px on every single page checked
(including `dashboard-overview.tsx`), confirming one shared horizontal
padding system end to end.

## Sprint 19B-3 — Production Readiness

Full production-readiness pass: closed the last drawer-coverage gaps,
found and fixed a real silent-failure bug in the email verification
flow, and re-verified every primary action and dashboard/onboarding
screen live. No new features, no backend architecture changes, no
redesign.

**1. Drawer coverage — 4 pages were still missing it:**

- `builder/page.tsx` (the AI Restaurant Builder's cinematic full-screen
  flow — loading, bootstrap-failed, live-build, and finale-reveal
  phases) had no nav at all, by original design ("distraction-free").
  Given every dashboard page must now have it, added `DashboardDrawer`
  to all five phases without touching any of the existing
  confetti/chime/rotating-caption cinematic behavior — verified live
  that the hamburger is present and clickable through the confetti
  overlay on the finale screen.
- `dashboard/launch/page.tsx` and `launch/test-order/page.tsx`
  (`LaunchCenter`/`TestOrderFlow`) had their own bespoke "OrderVora"
  header with no hamburger/drawer and no bottom tab bar — a real
  navigation dead end reachable only by browser Back. Migrated both onto
  `PageShell`, moving their existing "Business Ready" badge and "Back"
  link inline into the card header rather than dropping them.
- `website/variations/[id]/page.tsx` had `DashboardNav` (so the drawer
  technically worked) but was still hand-rolling the container markup
  missed in Sprint 19B-2's audit — migrated onto `PageShell` for
  consistency.
- Also fixed three more bare, nav-less "Loading…" early-return states
  (`launch/page.tsx`, `launch/test-order/page.tsx`, plus the two
  `bg-zinc-50`/`dark:bg-black` loading/error states inside
  `builder-experience.tsx`, recolored to the cream palette) — the same
  jump-inducing gap class of bug fixed for other pages in 19B-2.
- Confirmed via a scripted check across every `page.tsx` under
  `/dashboard` that all now reference `PageShell`/`DashboardDrawer`/
  `DashboardNav`, directly or through a component they render.

**2. Email Verification / Resend Email — root cause found and fixed:**

The resend flow was not a UI bug — it was a completely silent backend
failure. `sendNotification()` (the shared notification dispatcher) never
threw and never returned its result; it wrote a `NotificationLog` row
and returned `void`. `resendVerificationHandler` always responded
`{ ok: true }` regardless of whether the email actually sent, and the
frontend's `VerifyEmailBanner` always showed "Verification email sent —
check your inbox." — even when the SMTP send failed outright. Nothing
surfaced the failure anywhere: no error to the user, no server log, only
a `FAILED` row in a database table nobody was watching.

Reproduced live end-to-end in this environment (this sandbox's
`SMTP_HOST` is the placeholder `smtp.example.com`, which is expected for
local dev but happens to reproduce the exact failure class this bug
hides): before the fix, clicking "Resend email" against a dead SMTP host
returned HTTP 200 and showed the false success message. After the fix,
it correctly returns HTTP 502 with `Could not send the verification
email. Please try again in a few minutes.`, and the server log now shows
the real underlying error (`getaddrinfo ENOTFOUND smtp.example.com`).

Fix, threaded end to end:
- `sendNotification()` now returns the real `SendNotificationResult`
  (`{success, errorMessage}`) instead of `void`, and logs a `warn` on
  failure — existing fire-and-forget callers (order confirmations, etc.)
  are unaffected since they already ignored the return value.
- `sendEmailVerificationEmail`/`sendOwnerPasswordResetEmail`/
  `sendPasswordResetEmail` forward that result instead of swallowing it.
- `sendEmailVerification()` (auth service) now returns
  `{ sent: boolean; errorMessage?: string }`; `register()` still ignores
  it (a failed welcome email must never block account creation — the
  banner is the recovery path), but `resendVerificationHandler` checks
  it and returns a real 502 with a real message when the send fails.
- `VerifyEmailBanner` now catches that error and displays it (with a
  "Try again" retry button) instead of the try/finally previously
  discarding it as an unhandled rejection.
- Deliberately left `requestPasswordReset`/`forgotPassword` untouched:
  it's intentionally enumeration-safe (always resolves identically
  whether or not the email exists, per its own doc comment), and
  surfacing SMTP failures there would open a timing/response oracle for
  distinguishing valid from invalid emails during an SMTP outage — a
  real security regression this sprint's "no production regressions"
  requirement rules out. That flow's silence is by design, not a bug.

**Note on scope:** this fixes the code-level bug — the flow now tells
the truth about whether an email went out, in every environment. Verifying
the *actual* production `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` values
requires access to the real deployment's environment configuration, which
this sandbox does not have. If production email still doesn't arrive
after this deploys, the fix guarantees it will now fail loudly (server
log + 502 + a real on-screen error) instead of silently — that's the
signal to check the production SMTP credentials next.

**3–5. Full review pass:** live Playwright sweep across 21 dashboard
pages at iPhone SE (375×667), iPhone 14/15 (390×844), and iPhone Pro Max
(430×932) — zero horizontal overflow, zero missing hamburger buttons,
zero console/page errors on any page at any width. Verified every listed
primary action live: Login, Navigation Drawer (open + navigate), Logout,
Forgot Password, and Verify Email/Resend (above) all work correctly
end-to-end. Re-confirmed Import Hub, Launch Center, and Test Order Flow
render correctly with no regressions from today's changes.

**Verified:** typecheck, lint, full test suite (both apps — 113 web
tests incl. 3 new, 1073 API tests incl. 2 new, all passing), production
build (both apps, all routes clean), and the live verification described
above.

## Sprint 20A Task 1 — AI Website Studio Foundation

UI-foundation-only sprint: renamed "Website Builder"/"Website" to "AI
Website Studio" across every nav surface, and replaced the Website hub
page with a new premium, placeholder-driven layout. No AI generation, no
publishing, no domain logic, no backend or database changes — this is
scaffolding for Task 2 to wire real logic into.

**Renamed** ("Website" → "AI Website Studio"): the desktop pill nav and
"More" sheet in `DashboardNav`, the slide-in `DashboardDrawer`, the
Dashboard Overview's own desktop sidebar, and the public marketing
landing page's AI-modules feature list. The Dashboard Overview's
5-column bottom tab bar uses "Studio" instead of the full label — live-
verified the full string doesn't fit that column width without visual
crowding; every other nav surface (sidebar, drawer, "More" sheet) shows
the complete "AI Website Studio" name. Confirmed via grep: zero
remaining "Website Builder" references anywhere in the frontend.

**Replaced** `apps/web/src/app/dashboard/website/page.tsx` entirely — the
previous version (a single zinc/dark-styled card wired to real site-
generation status) is gone from this route; its underlying real
sub-pages (`/website/editor`, `/publish`, `/score`, `/messages`,
`/variations`) are untouched and still fully functional, just not all
individually linked from this specific redesigned hub in this task.

**New page, 7 sections, all placeholder data:**
1. **Website Status** — a status card introducing the Studio.
2. **Current Website** — a domain card showing
   `https://{slugified-restaurant-name}.ordervora.app` with working
   Open Website, Copy Link (clipboard), Share (native share sheet with
   a clipboard fallback), and QR Code (real `qrcode.react` code of the
   placeholder URL) — all pure client-side UI, no backend calls.
3. **Website Health** — 6 score-ring cards (Overall, SEO, Performance,
   Mobile, Accessibility, Conversion) with static placeholder scores.
4. **AI Brand Concepts** — 3 concept cards (Modern Minimal / Warm Craft
   / Bold Contemporary), each with a phone-frame preview mockup and
   Preview/Select/Regenerate controls. Select toggles a local visual
   selection state only — no generation, no persistence.
5. **Quick Actions** — 6 cards (Preview Website, Customize Website,
   Publish Website, Connect Domain, Analytics, SEO). Customize/Publish/
   SEO link to the real, already-working editor/publish/score pages
   (preserving existing functionality); Connect Domain also routes to
   the existing publish page (domains live there already); Analytics
   scroll-links to this same page's Analytics section; Preview Website
   opens the placeholder domain.
6. **AI Suggestions** — 5 static suggestions (Improve Hero/SEO, Enable
   Loyalty, Optimize Menu, Improve Images), each with a styled but
   inert "Fix Now" button.
7. **Website Analytics** — placeholder stat tiles (Visitors, Orders,
   Conversion, Returning Customers), a single-hue 7-day visitor bar
   chart, and a Top Products ranked list — reusing the same accent
   color already used for Dashboard Overview's revenue chart, per this
   codebase's existing single-series chart convention.

**Verified:** typecheck, lint, full test suite (113 passed, 2 nav tests
updated for the rename), production build (all 53 routes clean), and
live Playwright verification at iPhone SE (375×667), iPhone 14/15
(390×844), and iPhone Pro Max (430×932) plus a 1440px desktop pass —
zero horizontal overflow, zero console/page errors, all interactive
elements (Copy Link, QR Code toggle, brand-concept Select, Quick
Action navigation) confirmed working live.

**TODOs for Task 2** (explicitly not started here): wire AI Brand
Concepts to real theme generation; wire Website Health/Analytics to
real scoring and traffic data; wire AI Suggestions' "Fix Now" to real
actions; wire the domain card to a real assigned domain once one
exists; decide whether Website Messages needs a dedicated entry point
on the new hub (currently reachable only by direct URL).

## Sprint 20A Task 2 — AI Brand Concepts Experience

UI-only sprint, built on Task 1's foundation: turned the 3 static
placeholder concept cards into a complete, simulated brand-generation
workflow. No real AI, no OpenAI calls, no backend/database changes —
still entirely placeholder data, now with real interaction depth.

**New:** a `brand-concepts/` module (`concept-data.ts`,
`generate-concepts-button.tsx`, `concept-phone-preview.tsx`,
`concept-details.tsx`, `brand-concept-card.tsx`, `compare-concepts.tsx`)
replacing the single-file Task 1 version of `ai-brand-concepts.tsx`,
which is now a thin orchestrator over these pieces.

- **Generate New Brand Concepts** — a primary button that runs a
  simulated 5-stage loading sequence (Analyzing your business… →
  Building your brand identity… → Creating layouts… → Designing mobile
  experience… → Preparing storefront…) in a modal, each stage
  transitioning through pending/active/done states, then advances all
  3 concepts to their next placeholder variation.
- **Richer concept cards** — each now shows Business Style, Best For,
  three labeled color swatches, and 5 style tags (Typography/Button/
  Navigation/Product Card/Animation Style), on top of the name and
  description from Task 1.
- **Interactive iPhone Preview** — each concept's phone mockup now has
  a real 5-screen tab switcher (Home/Menu/Product/Cart/Checkout), each
  screen a distinct placeholder layout using that concept's own colors.
- **Compare Concepts** — a toggleable, horizontally-scrollable
  comparison table showing all 3 concepts' key attributes side by side,
  in place, without navigating away.
- **Selection Experience** — selecting a concept immediately shows a
  "Selected Brand · Current Active Concept" confirmation banner above
  the cards and a "Selected" badge + ring highlight on the chosen card.
- **Regenerate** — per-card, cycles that concept to its next placeholder
  variation with a brief spinner; each of the 3 concept families now has
  3 variations (added a third to each during this task, after live
  testing showed a 2-variation cycle felt repetitive against this
  sprint's "Apple-quality" bar).
- **Concept Details** — a smooth-animated accordion per card revealing
  Brand Philosophy, Color Palette, Typography, Experience, Target
  Audience, Conversion Focus, and Business Personality.

**Verified:** typecheck, lint, production build (all clean, as
requested), plus the full test suite as an extra regression check (113
passed, unchanged) and live Playwright verification at iPhone SE
(375×667), iPhone 14/15 (390×844), iPhone Pro Max via the existing
studio page, tablet (768×1024), and desktop (1440×1000) — zero
horizontal overflow, zero console errors at any width, and every
interaction (Generate flow, Select, Compare, Regenerate, Concept
Details expand, phone-preview screen switching) confirmed working live.

**TODOs for Task 3** (explicitly not started here): connect Generate/
Regenerate to real AI brand generation; persist the selected concept;
wire the phone preview to real generated content instead of static
placeholder blocks; connect Concept Details' copy to real generated
brand reasoning instead of the fixed placeholder pool.

## Sprint 20A Task 3 — Website Publishing Engine

Production sprint, not a placeholder: extended OrderVora's existing
site-generation/publishing backend (renderer, sitemap/robots/OG
generation, release storage, rollback, domains — all pre-existing and
production-grade from earlier sprints) with real status tracking,
structured pre-publish validation, and publisher attribution, then wired
the Studio hub's Publish Website action to a real staged flow that calls
the real API — no fake timers gating the final "Completed" state.

**Database (migration
`20260711003736_sprint20a_publishing_engine`):**
- `SiteStatus` enum gained `PUBLISHING`, `REPUBLISHING`, `FAILED`
  (alongside the existing `DRAFT`, `PUBLISHED`, `UNPUBLISHED`) — a site's
  status is now a real, persisted signal for the duration of a publish
  call, not just before/after.
- `SiteVersion.publishedById` (nullable FK to `User`) — records who
  published each release, surfaced through `listReleases`.

**Backend (`apps/api/src/modules/sites/site.service.ts` +
`site.controller.ts` + `site.routes.ts`):**
- New `validatePublishReadiness(restaurantId, siteId)` — checks business
  name, an active draft/theme, schema-valid content, a home page,
  2+ pages (navigation), at least one menu item, and unprocessed photo
  assets, returning `{ ready, issues }` with a friendly message per
  issue. Exposed read-only via `GET /:id/publish-check`.
- `publishSite` now requires the publishing user's id, runs the same
  readiness check as a hard gate (never trusts the client skipped it),
  sets the site's status to `PUBLISHING`/`REPUBLISHING` immediately, and
  flips it to `FAILED` if anything in the publish transaction throws —
  so a crashed publish never silently leaves a stale status.
- `listReleases` now includes each release's publisher name.

**Frontend:**
- New `studio/publish-flow.tsx` (`PublishFlowButton`) — a real staged
  publish modal (Preparing Website → Optimizing Assets → Generating
  Metadata → Generating SEO → Creating Sitemap → Creating Robots.txt →
  Assigning Temporary Domain → Final Validation → Publishing →
  Completed). The first 8 stages are a cosmetic checklist animation; the
  "Publishing" stage is the real `publishSite` network call, and
  "Completed" only renders once that call actually resolves. If
  `checkPublishReadiness` reports issues first, the modal shows those
  messages instead of starting the animation, with a "Got it" dismiss —
  no staged flow ever starts against a site that isn't actually ready.
  Relabels to "Republish Website" once the site is already published.
- New `studio/publishing-history.tsx` — Version / Published By / Date /
  Status list off the enhanced `listReleases`, with a "Current version"
  badge on the live release.
- `studio/quick-actions.tsx` — the Publish Website tile is now the real
  `PublishFlowButton` (a `variant="tile"` rendering) instead of a link to
  the older `/dashboard/website/publish` page.
- `studio/website-status-card.tsx` / `studio/current-website-card.tsx` —
  now reflect the site's real status (Draft/Publishing/Republishing/
  Live/Failed/Unpublished) and the real resolved domain (verified custom
  domain if one exists, otherwise the platform subdomain from
  `resolveSiteUrl`) via a new `url` field added to `GET /api/sites/me`,
  replacing Task 1's hardcoded "Setting up" placeholder and guessed
  `.ordervora.app` domain.
- `lib/api.ts` — `SiteStatus` extended with the 3 new states,
  `SiteVersion` gained `publishedById`/`publishedBy`, new
  `PublishIssue`/`PublishReadiness` types and `checkPublishReadiness()`.

**Verified:** typecheck, lint, full backend test suite (1073 passed —
27 in `site.service.test.ts` covering the new validation gate, status
transitions, and publisher attribution), full frontend test suite (113
passed), production build for both apps (all routes clean), and a live
end-to-end run against a real local Postgres database and a real test
account: registered a user, created a restaurant/site/menu item,
confirmed the readiness check correctly blocks publishing with
human-readable guidance before a draft/theme exists, then created a
valid draft and menu item, ran the real staged Publish Website flow to
completion through the browser, and confirmed the Studio hub
immediately reflected the live status, live domain badge, and a real
Publishing History entry with the correct publisher name and timestamp.

**Known limitation carried over from the pre-existing renderer**
(unchanged by this task): `releaseStorage` writes rendered pages to
local disk (this environment's stand-in for object storage + CDN
invalidation) — swapping in real object storage is an infrastructure
choice for deployment, not a Task 3 gap.

## Sprint 20A Task 4 — Temporary Domain & Custom Domain Engine

Production sprint: extended the existing domain infrastructure
(`Domain` model, real CNAME DNS verification, primary-domain resolution
— all pre-existing from earlier sprints) with proof-of-control TXT
verification, a real SSL certificate state machine, durable domain
history, and a premium Domain Management UI on the Studio hub.

**Database (migration `20260711013000_sprint20a_domain_engine`):**
- `DomainTlsStatus` enum: `PENDING, ISSUED, FAILED` → `PENDING,
  GENERATING, ACTIVE, EXPIRED, FAILED` (any pre-existing `ISSUED` rows
  are backfilled to `PENDING` before the type swap, since `ISSUED` has
  no equivalent in the new enum).
- `Domain` gained `verificationToken` (random per-domain proof-of-
  control token, default-backfilled for existing rows), `lastCheckedAt`,
  `tlsExpiresAt`.
- New `DomainEvent` model + `DomainEventType` enum (`CREATED, VERIFIED,
  VERIFICATION_FAILED, SSL_GENERATING, SSL_ACTIVE, SSL_FAILED,
  PRIMARY_CHANGED, DISCONNECTED`) — deliberately not only reachable
  through `Domain`: `hostname`/`siteId` are denormalized and `domainId`
  is nullable (`SetNull` on delete), so a domain's full history —
  including its own "disconnected" event — survives the `Domain` row
  being hard-deleted by `removeDomain`. Verified live: after removing a
  test domain, its full timeline (Connected → DNS failed → Disconnected)
  remained visible in the history section.

**Backend (`apps/api/src/modules/sites/domain.service.ts` — extended,
not rebuilt):**
- DNS verification now requires BOTH a CNAME pointing at the platform
  edge (pre-existing check) AND a TXT record at
  `_ordervora-challenge.<hostname>` matching a random per-domain token
  (new) — proves the caller actually controls DNS for that exact
  hostname, not just that some CNAME happens to point at the shared
  edge. A failed check returns a specific, actionable reason (missing
  CNAME vs. missing/wrong TXT vs. both) via `DomainEvent`, surfaced
  live in the wizard.
- `addDomain` rejects hostnames that are (or are a subdomain of) the
  platform's own domain — hijack/reserved-domain prevention — and
  every mutation now logs a `DomainEvent`.
- New `runSslIssuanceSweep()` + `ssl-issuance-scheduler.ts` (mirrors
  the existing `stale-offer-scheduler.ts`/`outbox-scheduler.ts`
  process-local interval pattern, wired into `index.ts`'s startup/
  graceful-shutdown alongside them, tracked via `worker-health.ts`'s
  new `sslIssuanceSweep` key): sweeps domains in `GENERATING` and
  issues a certificate via a stubbed `issueCertificate()` call — see
  "Known limitation" below — then separately sweeps `ACTIVE` domains
  past their 90-day `tlsExpiresAt` and flips them to `EXPIRED`, a real
  renewal-window check even though the certificate itself is simulated.
- `site.service.ts`: `updateSite`'s slug (the temporary domain) is now
  auto-conflict-resolving (reuses `createSite`'s numeric-suffix
  strategy instead of throwing a raw Prisma unique-constraint error)
  and rejects edits once the site is no longer `DRAFT` (new
  `SlugNotEditableError`) — "editable before publishing," literally.
  New `temporaryDomainFor()` helper shared by `resolveSiteUrl` and the
  controller, so `GET /api/sites/me` now also returns a `temporaryDomain`
  field (real, DB-backed — `Site.slug` + the platform domain — not a
  guessed string).

**API routes:** `GET /:id/domain-history` (new). `verify`/`setPrimary`
domain responses now include `dnsRecords` (fixed live — see below).

**Frontend (`apps/web/src/app/dashboard/website/studio/domain/`):**
- `domain-dashboard.tsx` — Primary Domain / Temporary Domain cards
  (Visit/Copy/Change), Connect Domain entry point, and an Additional
  Domains list (DNS/SSL/Last Checked badges, Check DNS / Make Primary /
  Remove).
- `connect-domain-wizard.tsx` — the 6-step flow (Enter Domain → Validate
  format → Generate DNS Records → Verify DNS → Issue SSL → Activate) as
  a real modal calling the real `addDomain`/`verifyDomain` APIs; a
  failed verification shows the backend's specific DNS guidance and
  lets the owner retry without losing the records already shown.
- `edit-temporary-domain.tsx` — inline slug editor, only rendered while
  the site is still a draft.
- `domain-history.tsx` — the full lifecycle timeline.
- `lib/api.ts` — `DomainTlsStatus`/`DomainVerificationStatus`/
  `DomainEventType`/`DnsRecordInstruction`/`DomainEvent` types,
  `SiteDomain` extended with the new fields, `updateSite()` and
  `listDomainHistory()` client functions.

**Bug caught and fixed by live verification** (not by the test suite —
worth naming explicitly): the `verify` and `setPrimary` domain
controller endpoints returned the raw `Domain` row without the
`dnsRecords` field that `add`/`list` already included, which crashed
the wizard's "records" step (`Cannot read properties of undefined
(reading 'find')`) the moment a verification attempt failed and the UI
tried to keep showing the CNAME/TXT records for a retry. Caught via a
real browser run against the real API, fixed by wrapping both
endpoints' responses the same way `add`/`list` already did, then
re-verified live that a failed verification correctly re-shows the
records with the specific failure reason instead of crashing.

**Verified:** typecheck, lint, full backend test suite (1091 passed,
including 27 new/updated domain tests covering TXT verification, DNS
record generation, event logging, the SSL sweep, and slug conflict
auto-resolution), full frontend test suite (113 passed, unchanged),
production build for both apps (all routes clean), and a live
end-to-end run against a real local Postgres database and a real test
account covering: Domain Dashboard rendering with the real temporary
domain, editing the temporary domain slug live, connecting a real
external hostname through the full wizard (DNS records genuinely did
not resolve for a fabricated test domain, so the failure-guidance path
is what's live-verified end-to-end; the success path — a CNAME/TXT
that actually matches — is covered by `domain.service.test.ts`'s
mocked-DNS unit tests, since this sandbox has no external domain it
can point real DNS at), the Additional Domains list showing live
DNS/SSL badges, Remove, and Domain History surviving the domain's
deletion.

**Known limitation (explicitly scoped, not a placeholder left by
choice):** `issueCertificate()` in `domain.service.ts` is a stubbed ACME
call — this sandbox has no publicly reachable edge server for a real
Certificate Authority's HTTP-01/DNS-01 challenge to reach, so a genuine
Let's Encrypt handshake cannot succeed here regardless of implementation
effort. Everything around that one call — the persisted state machine
(`PENDING → GENERATING → ACTIVE → EXPIRED/FAILED`), the background
sweep, the 90-day renewal window, and the history/event logging — is
real and already wired for a real ACME client to be dropped in behind
`issueCertificate()` without touching any other code.

## Sprint 20A Task 5 — Website Customization Studio

Production sprint: built the full owner-facing Website Customization
Studio on top of the existing storefront renderer, site drafts, brand
concepts, publishing engine, and domain engine — zero second rendering
system, zero disconnected controls.

**Architecture:** live preview is powered by a new, purely-additive
`POST /api/sites/:id/draft/render` endpoint that takes an **unsaved**
candidate `SiteDefinition` straight from the request body and calls the
exact same `renderSitePage()` the real publish path and `/preview/:token`
already use — what the owner sees while editing is provably what
production would render for that definition. Live-preview rendering
(350ms debounce) is decoupled from persistence (`patchDraft`, 1200ms
autosave debounce), so every keystroke never has to hit the database.

**Database:**
- `AssetKind` gained `FAVICON`, `HERO_BACKGROUND` (migration
  `20260711030000_sprint20a_customization_asset_kinds`).
- New `NewsletterSubscriber` model (migration
  `20260711033000_sprint20a_newsletter_subscriber`), unique on
  `[siteId, email]` so repeat signups are harmless no-ops.

**Backend (`apps/api/src/modules/sites/`):**
- `types.ts`: `SiteDefinition` extended with `brandSettings`, `header`,
  `footer`, `productPresentation` (all optional, so existing definitions
  keep validating unchanged), plus 9 new section types
  (`featuredCategories`, `featuredProducts`, `bestSellers`, `offers`,
  `reviews`, `loyalty`, `appPromotion`, `newsletter`, `customTextImage`)
  and a `hidden` flag on section blocks (Hide keeps a block's props
  intact but skips it at render time — distinct from Remove).
- 9 new renderer components, each backed by a real data source where one
  exists in this codebase: `featured-categories`/`featured-products` read
  the live menu, `best-sellers` reads real order history (`getTopItems`),
  `offers` reads real active coupons (new `listActiveCoupons`), `loyalty`
  reads the real loyalty program (`getProgram`), `newsletter` posts to a
  real subscribe endpoint. `reviews`, `appPromotion`, and
  `customTextImage` have no automated data source in this codebase (same
  as the pre-existing `testimonials`), so they render clearly
  owner-authored content instead of fabricating data.
- `chrome.ts`, `hero.ts`, `footer.ts`, `menu-section.ts` rewritten to
  read the new settings surfaces (header layout/sticky/search/cart/
  account/announcement bar; hero alignment/height/overlay/CTAs; footer
  description/social/legal/newsletter — "Powered by OrderVora" stays
  unconditional, since there's no plan/entitlement system yet to gate it
  on; product card layout/density/price style/out-of-stock handling).
  Cart/Order/Account links resolve to the separate ordering app via a new
  `RenderContext.orderingBaseUrl`, resolved once from `FRONTEND_URL` at
  the `render-site.ts` orchestration layer — never inside a leaf
  component, preserving the renderer's "pure function of `RenderContext`"
  contract.
- `theme-css.ts` applies Brand Settings overrides (color scale
  regeneration via the existing OKLCH `deriveColorScale`, button style,
  border radius, shadow, page width, content spacing) on top of the
  theme's own tokens.
- Explicitly omitted rather than shipped as dead controls: `logoAssetId`/
  `faviconAssetId` on `brandSettings` (the one-asset-per-kind upload
  convention already solves this without an ID reference), and "image
  ratio"/"dietary badges" in Product Presentation (`MenuItem` has neither
  field).
- `site.controller.ts`/`site.validation.ts`/`site.routes.ts`: new
  `POST /:id/draft/render`, `GET /:id/newsletter-subscribers`,
  `POST /public/sites/:id/newsletter` (honeypot-protected, rate limited).
- `asset.controller.ts`: every asset response now includes a computed
  `url` field.

**Critical bug found and fixed during live verification (pre-existing,
not introduced by this task — surfaced by it):** `publishSite` flipped
the DRAFT `SiteVersion` it published to `PUBLISHED` without leaving any
version behind with `status: "DRAFT"`. Every consumer that looks up "the
draft" via `status: "DRAFT"` — `patchDraft`'s `getActiveDraft`, and the
Studio's own page load — had nothing to find immediately after a
publish, so reloading the editor after a successful publish showed the
"no draft yet" empty state instead of the Studio, and further edits
would have thrown `SiteVersionNotFoundError`. Root-caused by inspecting
`site.service.ts` directly and confirmed live (published a real site via
the staged publish flow, reloaded the editor, saw the literal empty-state
text). Fixed by having `publishSite` leave behind a fresh `DRAFT` copy of
the just-published definition, in the same transaction, as the new
highest `versionNo` — zero changes needed anywhere else that already
assumed "the draft" exists. Re-verified live: republishing now correctly
leaves "Republish Website" / "Last published" / "View live" intact on
reload, and the DB shows a new `DRAFT` row immediately after each
publish.

**Second bug found and fixed during live verification:** on mobile, the
Studio's floating "Preview" trigger button (`fixed bottom-4`) sat behind
the app's global bottom tab bar (`fixed inset-x-0 bottom-0 z-50`),
making it unclickable — confirmed via a real click that timed out
because the tab bar's `<nav>` intercepted the pointer event. Fixed by
moving the button to `bottom-20`, matching the offset convention already
used elsewhere in the dashboard (`dashboard-overview.tsx`) for floating
elements that must clear the same tab bar. Re-verified live: the button
is now clickable and opens the mobile preview sheet correctly.

**Frontend (`apps/web/src/app/dashboard/website/editor/studio/`):**
new Customization Studio — live preview (mobile/tablet/desktop viewports,
fullscreen mode), Section Manager (add/remove/hide/duplicate/reorder),
per-section dynamic field editor, Brand/Header/Footer/Product Presentation
panels, Media panel (logo/favicon/hero/hero-background upload, gallery),
undo/redo (derived from a single history stack — no desync possible),
autosave with a saving/saved/error indicator and a `beforeunload` guard,
and the existing `PublishFlowButton` from Task 3 reused directly, not
duplicated. Old `draft-form.tsx`/`section-editor.tsx` deleted, fully
superseded.

**Verified:** typecheck and lint clean on both apps; full backend suite
(1113 passed, 5 skipped — one pre-existing, unrelated flaky test);
full frontend suite (132 passed); production build clean for both apps
(42 web routes, all successful); live end-to-end run against a real
local Postgres database and a real test account covering: publish → the
post-publish draft-continuity fix (verified both the empty-state bug and
its fix, and confirmed a fresh DRAFT row is created after every publish),
Section Manager add/hide driven live in the browser, Brand Settings color
change reflected instantly in the live preview, Header Settings toggle
reflected live, Footer panel's "Powered by OrderVora" note, Media panel's
four single-slot upload controls, desktop viewport switching, and the
mobile floating-Preview-button fix (open the mobile preview sheet and
confirm the real live storefront content renders inside it).

**Remaining limitations / TODOs:** gallery multi-upload and the
Header/Footer/Product-Presentation panels' full field surface were
exercised live at a spot-check level (panel renders, one field changed
and confirmed in the live preview) rather than every individual field;
accessibility was verified via existing aria-label-driven test coverage
and one live pass, not a full axe/keyboard-navigation audit; `newsletter`
section's subscribe form posts to a real endpoint but has no admin UI yet
for viewing collected subscribers beyond the raw `GET
:id/newsletter-subscribers` API.

Sprint 20A stops here per instruction — Task 6 not started.
