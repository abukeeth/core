# PRODUCTION READINESS — Verification Checklist

> **Purpose:** verification steps only — what to check in each external service
> before the first customer. No development, no code changes. Pairs with
> `GO_LIVE.md` (the go/no-go summary) and
> `docs/runbooks/first-customer-launch.md` (the operational steps).
>
> Mark each item ✅ only when you've confirmed it in the live service.

---

## 1. Railway (the API)

Verify in the Railway service → Variables + Deployments + Logs.

- [ ] **Service is deployed and healthy** — the latest deploy is "Active", and
      `GET https://<api-host>/health` returns `{"status":"ok"}` and
      `GET https://<api-host>/ready` returns `{"status":"ready"}` (DB reachable).
- [ ] **Mandatory variables are set** (the API refuses to boot without them):
      `DATABASE_URL`, `FRONTEND_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`,
      `JWT_REFRESH_TTL`, `COMMERCE_ENCRYPTION_KEY`.
- [ ] **No placeholder values remain** — `JWT_ACCESS_SECRET` and
      `COMMERCE_ENCRYPTION_KEY` are NOT the `.env.example` sample strings
      (prod boot rejects known placeholders). `COMMERCE_ENCRYPTION_KEY` is a
      real 64-character hex string.
- [ ] **`FRONTEND_URL` matches the real web origin** (e.g.
      `https://www.<domain>`) — this is the CORS origin; a mismatch blocks the
      browser from calling the API.
- [ ] **Admin seed variables are set** — `ADMIN_EMAIL`, `ADMIN_PASSWORD`
      (not a placeholder), `ADMIN_NAME`. Confirm you can log in as this admin.
- [ ] **Migrations ran on deploy** — the deploy log shows
      `prisma migrate deploy` applied all migrations with no error.
- [ ] **Boot log shows the expected keys as set** — the startup env summary
      lists the AI/SMTP/storage keys you intend to have (names only; values are
      never logged). Use this to confirm what's actually loaded.

## 2. Vercel (the web app)

Verify in the Vercel project → Settings → Environment Variables + Deployments.

- [ ] **`API_URL` points at the Railway API origin** (a trailing slash is now
      tolerated, but prefer none). This is read at **build time**.
- [ ] **`NEXT_PUBLIC_SITE_URL` is the public web origin** (used by
      robots/sitemap).
- [ ] **A redeploy happened AFTER the last `API_URL` change** — because the
      rewrite is baked at build time, an env change without a redeploy has no
      effect.
- [ ] **Register/login work on the live site** — open `/register` and
      `/login` on the deployed domain and confirm a real account can be created
      and signed in (this exercises the web → API proxy end-to-end).
- [ ] **The storefront proxy resolves** — a published store URL
      (`/store/<slug>` on the platform subdomain) renders, and `/api/...` calls
      from the browser succeed (no `//api` 404).

## 3. OpenAI (AI provider)

Verify in Railway Variables + a live action.

- [ ] **An AI key is set** — `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` /
      `GEMINI_API_KEY`). Only one is required; priority is OpenAI → Anthropic →
      Gemini.
- [ ] **The key is valid and funded** — confirm on the provider dashboard the
      key is active and the account has usage budget/credit.
- [ ] **Menu-photo import works live** — upload a real menu photo in the
      dashboard import flow and confirm the job reaches `AWAITING_REVIEW` with
      extracted items (not `FAILED: No AI provider configured`).
- [ ] **Generated storefront copy is non-generic** — after a generation with a
      key, the hero/about copy reads as written for the business (not the
      neutral fallback). *(Optional but confirms the key is actually used.)*

## 4. Object Storage (S3 / Cloudflare R2 / compatible)

Verify in Railway Variables + a live upload — **this is the #1 data-loss risk.**

- [ ] **All variables are set** — `OBJECT_STORAGE_BUCKET`,
      `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ENDPOINT`,
      `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`,
      `OBJECT_STORAGE_PUBLIC_URL_BASE`.
- [ ] **The bucket exists and credentials work** — the API booted in production
      (it refuses to boot in prod without valid object storage unless the
      local-disk escape hatch is explicitly enabled — confirm the escape hatch
      is NOT enabled).
- [ ] **Uploads are served** — upload a menu item / logo image, then open its
      public URL; it returns the image (HTTP 200), not a 404.
- [ ] **Persistence across redeploy** — upload an image, trigger a redeploy,
      then confirm the image URL still resolves. (If it 404s after redeploy,
      storage is NOT persistent — do not launch.)
- [ ] **(If AI images are enabled)** confirm `AI_IMAGE_ENABLED=true` is only on
      when storage above is verified — enabling images without served storage
      produces broken image icons.

## 5. Stripe (payments — BYOP)

Verify in the merchant's own Stripe dashboard + a live test order.

- [ ] **The merchant connected their own Stripe credentials** in the dashboard
      payment settings, and the provider shows `CONNECTED` (not
      `PENDING_CONNECTION` / `ERROR`).
- [ ] **Correct mode** — using **test** keys for the dry run, **live** keys
      before taking real money. Don't mix.
- [ ] **A test payment succeeds end-to-end** — place a real order on the live
      storefront, pay, and confirm the order moves to `PAID` and the charge
      appears in the Stripe dashboard.
- [ ] **The payment webhook is verified** — the webhook endpoint
      (`/api/webhooks/payments/stripe`) receives events and they're processed
      (order payment status updates from the webhook, not just the client).
      Confirm the webhook signing secret is configured for the connected
      account.
- [ ] **A refund works** — issue a small test refund from the dashboard and
      confirm it reflects in Stripe. *(Optional but recommended before live.)*

---

## Final gate

Do not take the first real customer until **§1, §2, §4, §5 are fully ✅** and
§3 is ✅ (or you've accepted manual menu entry without an AI key). Then run the
end-to-end dry run in `docs/runbooks/first-customer-launch.md` §4 on the
deployed environment.
