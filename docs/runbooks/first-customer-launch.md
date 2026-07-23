# Runbook — First Customer Launch (Pilot)

> Purpose: the shortest safe path to onboarding **one real business** on the
> current stack, without rebuilding anything. Scope decisions below were made
> for the pilot; each "off" item has a one-line note on how to turn it on later.
> For deep detail, this runbook links to the focused runbooks in this folder
> rather than repeating them.

## Pilot scope (what's on / off)

| Area | Pilot | Notes |
|---|---|---|
| Ordering | **Pickup + QR dine-in + delivery** | All work end-to-end today. |
| Delivery dispatch | **Restaurant's own driver** | Assign a staff user as driver; live tracking + stale-offer expiry work. |
| Payments | **Stripe (BYOP)** | Merchant connects their own Stripe keys; real intents/refunds. |
| Notifications | **Email (SMTP)** | Transactional order emails. SMS/Push are stubs — not promised in the UI. |
| Website | **Generated storefront on the platform subdomain** | Custom-domain TLS issuance is a stub — keep the pilot on the platform domain. |
| Billing | **Manual / free pilot** | No in-platform subscriptions yet. |

Intentionally **off** for the pilot, kept in code for later (no rebuild needed):

- **External delivery providers** (Uber Direct / DoorDash Drive / Local Courier)
  — adapters are stubs. Connecting one is already rejected, and delivery-rule
  methods are gated on `registry.isFulfillmentMethodAvailable()`. To enable
  later: implement the adapter and set its `implemented = true`; it re-enables
  automatically everywhere.
- **Non-Stripe payment providers, POS integrations, marketplace menu imports**
  — surfaced in the UI as "coming soon", never as working.
- **Custom-domain HTTPS** — needs a real ACME/Let's Encrypt client
  (`sites/domain.service.ts`). Until then, use the platform subdomain.

## 1. Backend (Railway) — environment

The API refuses to boot in production if any mandatory var is missing or is a
known placeholder (`config/env.ts`), and refuses to boot without persistent
object storage unless explicitly overridden (see §3). Set:

**Mandatory (boot-blocking):**
- `DATABASE_URL` — Postgres connection string.
- `FRONTEND_URL` — the public web origin (e.g. `https://www.example.com`); this
  is the CORS origin, apex/`www` treated interchangeably.
- `JWT_ACCESS_SECRET` — strong random secret (not the `.env.example` value).
- `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` — e.g. `15m`, `30d`.
- `COMMERCE_ENCRYPTION_KEY` — **64-char hex** (encrypts per-merchant provider
  credentials). Generate: `openssl rand -hex 32`.
- `NODE_ENV=production`.

**Admin seed** (used by `seed:if-empty` in the Railway `preDeployCommand`):
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (not a placeholder), `ADMIN_NAME`.

**Integrations:**
- AI (at least one, priority OpenAI → Anthropic → Gemini): `OPENAI_API_KEY`
  (+ optional `*_MODEL`). Needed for menu import + storefront generation.
- `GOOGLE_MAPS_API_KEY` — Google Business / Maps menu import (optional).
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_FROM_ADDRESS` — transactional order emails.
- `REDIS_URL` — optional; backs rate limiting (fails open if absent).
- `SENTRY_DSN` — optional error tracking.

`railway.json` already runs `prisma migrate deploy` + `seed:if-empty` in
`preDeployCommand` and health-checks `/health`. See `environment-configuration.md`
for the full variable reference and `database-setup.md` for the DB.

## 2. Frontend (Vercel) — environment

- `API_URL` — the Railway API origin. **A trailing slash is now tolerated**
  (the `/api` proxy strips it), but prefer entering it without one. This value
  is baked at **build time**, so a change requires a redeploy.
- `NEXT_PUBLIC_SITE_URL` — the public web origin (used by robots/sitemap).

The browser only ever calls same-origin `/api/*`; Next rewrites proxy to
`API_URL` server-side, so auth cookies stay first-party. See
`vercel-deployment.md`.

## 3. Persistent object storage (do not skip)

Local-disk storage is **ephemeral** on Railway — every uploaded menu photo /
PDF / site asset is wiped on the next redeploy or restart. The API blocks a
production boot without it. Point it at S3/R2/B2/MinIO:

- `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ENDPOINT`,
  `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`,
  `OBJECT_STORAGE_PUBLIC_URL_BASE`.

Cloudflare R2 is a good low-cost fit (S3-compatible, set the R2 endpoint). Full
detail: `object-storage.md`.

## 3a. Storefront generation quality (AI text & images)

The website generator runs fully **without any AI key** — it produces real
5-page sites with per-business color, vocabulary, and layout. AI keys upgrade
the *copy* and *photography*; they are not required to launch. To get the
premium output:

- **AI marketing copy** — set an AI key (`OPENAI_API_KEY` etc., §1). This is
  automatic: with a key, hero/about/tagline copy is AI-written in distinct
  voices; without one, copy falls back to neutral templated lines (no broken
  placeholders — the generic "eclectic" descriptor and the "[add your story]"
  placeholder are suppressed).
- **AI photography** — off by default and safe to leave off (missing photos
  degrade to palette gradients, never broken boxes). To enable, set **all
  three** together or the storefront will show broken image icons:
  `AI_IMAGE_ENABLED=true` + an image key (or `AI_IMAGE_BACKEND=local`) +
  **persistent object storage** (§3). A per-business budget cap (~12 images)
  bounds cost. **Verified:** enabling images without object storage produces
  404-ing `/assets` URLs (broken images) — configure storage first.
- **Owner-uploaded photos** always win over both and need none of the above.

## 4. Go-live steps (once deployed)

1. Confirm `/health` (liveness) and `/ready` (DB probe) are green on the API.
2. Owner **registers** at `/register` → lands in the 7-step `/setup` wizard.
3. Complete setup: business type → info → location → **connect Stripe** (BYOP)
   → **import the menu** (photo/PDF/CSV/website/Google) → pick a storefront.
4. Review the imported menu (`/dashboard/import/[id]`), approve → menu is live.
5. Generate & **publish** the storefront; verify it renders on the platform
   subdomain.
6. If offering delivery: on `/dashboard/delivery`, enable delivery and set a
   radius (or a `RESTAURANT_DRIVER` rule); add at least one **staff user** to
   act as the driver (`/dashboard/staff`).
7. Run the **test order** flow (`/dashboard/launch/test-order`): place an order,
   watch it appear in `/dashboard/orders` and the kitchen display, advance the
   status, and — for delivery — assign the driver and complete it from
   `/dashboard/driver`.
8. Confirm the customer received the transactional email.

## 5. Verification before handing to the customer

- Register/login work through the deployed proxy (the trailing-slash fix
  guarantees no `//api` 404).
- A menu photo uploaded before a redeploy is still present after it (storage is
  persistent).
- A delivery order can be placed, paid, assigned to a staff driver, and
  completed.
- No screen offers a feature that is off for the pilot (external delivery
  providers, SMS, POS, non-Stripe payments all read as unavailable/coming soon).
