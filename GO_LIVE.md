# GO LIVE — OrderVora First-Customer Readiness

> **Date:** 2026-07-23 · **Scope confirmed with owner:** pickup + QR dine-in +
> restaurant-own-driver delivery, Stripe BYOP, manual billing, platform
> subdomain. · **Evidence:** full test suites (API 1627 passed / 5 skipped, Web
> 287 passed, typecheck clean) + a live end-to-end run of all 11 first-customer
> steps + a live 5-site website-generation check. Companion docs:
> `FINAL_RELEASE_AUDIT.md`, `FEATURE_STATUS.md`, `SCREENS_MAP.md`,
> `docs/runbooks/first-customer-launch.md`.

---

## 1. Is the system ready for the first customer?

**Yes — conditionally.** The **code and product are ready** for the confirmed
pilot scope: a business can sign up, set up, load a menu, publish a storefront,
take pickup / QR / own-driver-delivery orders, get paid via Stripe, and manage
orders end-to-end. Every one of those paths was exercised live and passed.

It is **not one-click ready**: going live is blocked only on **external
configuration you control** (§2), not on missing or broken code.

## 2. Remaining external requirements

All are configuration, not development.

| Service | What's required | Blocking? |
|---|---|---|
| **Railway (API)** | Set the mandatory env: `DATABASE_URL`, `FRONTEND_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `COMMERCE_ENCRYPTION_KEY` (64-hex), `ADMIN_EMAIL/PASSWORD/NAME`. Migrations + seed run automatically on deploy. | **Yes** |
| **Object storage (S3/R2)** | `OBJECT_STORAGE_*` pointing at persistent storage. Without it the API refuses to boot in prod; if bypassed, every uploaded menu photo / site asset is wiped on redeploy. | **Yes** |
| **OpenAI (or Anthropic/Gemini)** | One AI key. Needed for **menu-photo import** and premium storefront copy. Without it: enter the menu manually/CSV, and copy is generic (no broken output). | **Partial** — not hard-blocking, but the "photo → menu in minutes" magic won't work without it. |
| **Stripe (BYOP)** | The merchant connects **their own** Stripe keys during setup. No platform key needed. | **Yes** — for card payments. Cash/manual works without. |
| **SMTP** | `SMTP_*` for order emails. | Recommended (order confirmations). |
| **Vercel (web)** | `API_URL` (trailing slash now tolerated), `NEXT_PUBLIC_SITE_URL`. Redeploy after changing `API_URL` (baked at build). | **Yes** |

## 3. Remaining critical risks

1. **Object-storage misconfiguration = data loss / broken images.** On local
   disk (Railway ephemeral), uploads vanish on redeploy; and enabling AI images
   without storage yields broken image icons. Configure persistent storage
   before any real upload. *(Verified live.)*
2. **Tenant isolation is application-layer only (no database RLS).** Correct for
   a single pilot tenant; a real cross-tenant leak risk to address before
   onboarding many independent businesses.
3. **Custom-domain HTTPS is a stub.** Keep the pilot on the platform subdomain;
   do not promise a custom domain yet.
4. **SMS/Push are stubs.** Notifications are email-only — don't advertise SMS.
5. **No MFA on the admin account** that controls all tenants — protect those
   credentials manually.

None of these block the confirmed pilot; items 2 and 5 matter as you scale.

## 4. What happens if we launch today?

- **If Railway is fully configured (secrets + persistent storage) and Stripe is
  connected:** the customer can run their business end-to-end — real orders,
  payments, own-driver delivery, order management. This works.
- **If object storage is NOT set:** the API won't boot in production (a safe
  fail), or — if the local-disk escape hatch is used — uploaded photos disappear
  on the next redeploy.
- **If no AI key:** menu-photo import fails with a clear message (enter the menu
  manually instead); the generated storefront still publishes but with generic
  copy and no photography.
- **If Stripe isn't connected:** no card payments (cash/manual only).
- **If business hours aren't set:** the storefront cleanly rejects orders as
  "closed" until hours are entered. *(Verified live.)*

Bottom line: with config done, a launch today **succeeds**; with config skipped,
failures are **safe and explicit** (clear errors / refused boot), not silent
corruption — except the object-storage local-disk trap, which is why it's #1.

## 5. Current readiness

**~90% ready to receive the first customer**, for the confirmed pilot scope.

| Dimension | Ready |
|---|---|
| Core code & features (auth, setup, menu, ordering, payments, delivery, orders) | ~95% |
| Automated quality (tests, typecheck, CI) | ~95% |
| Website builder (works; premium tier needs AI key + storage) | ~80% |
| External configuration (yours to do) | ~40% ← the gap |
| Beyond-pilot hardening (RLS, MFA, SMS, custom-domain TLS, billing) | post-launch |

The remaining ~10% to "receiving customers" is **your configuration**, not code.

## 6. The last 5 things YOU must do personally

1. **Set Railway env + persistent object storage** (S3/R2) — the mandatory
   secrets and `OBJECT_STORAGE_*`. This is the #1 blocker.
2. **Set an AI provider key** (OpenAI) on Railway — so menu-photo import and
   premium copy work.
3. **Set Vercel `API_URL` (no trailing slash) + `NEXT_PUBLIC_SITE_URL`** and
   redeploy the web app.
4. **Do a real dry run on the deployed site:** register → set business **hours**
   → import/enter menu → publish storefront → connect **Stripe** → place a test
   order → assign a staff driver → complete it. (Follow
   `docs/runbooks/first-customer-launch.md`.)
5. **Confirm the customer's plan is manual/free for the pilot** (no in-platform
   billing yet) and keep them on the **platform subdomain** (no custom domain).

Do these five and the system is ready for your first real customer.
