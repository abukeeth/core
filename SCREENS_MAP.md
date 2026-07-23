# SCREENS MAP — OrderVora

> Complete inventory of every screen/page in the web app (`apps/web/src/app`,
> Next.js App Router). Verified against the filesystem. Design-system column:
> **Warm** = cream/ink/gold token system (`globals.css`); **Legacy** =
> pre-redesign zinc/dark styling; **n/a** = thin server wrapper or utility.
>
> The published customer storefront (the generated site at the platform
> subdomain / `/store/*`) is **not** a Next page — it is server-rendered by the
> API renderer and proxied through `next.config.ts` rewrites.

## Public — storefront & ordering

| Route | Purpose | Design |
|---|---|---|
| `/` | Marketing landing page (scroll-animation home) | Warm |
| `/order/[restaurantId]` | Storefront menu / ordering home | Warm |
| `/order/[restaurantId]/cart` | Cart review, fulfillment-type toggle | Warm |
| `/order/[restaurantId]/checkout` | Checkout & payment | Warm |
| `/order/confirmation/[orderId]` | Post-order confirmation | Warm |
| `/order/track/[orderId]` | Live order tracking (polling) | Warm |
| `/order/qr/[qrToken]` | QR/table entry → resolves a table into an ordering session | Warm |

## Customer account

| Route | Purpose | Design |
|---|---|---|
| `/account` | Customer account home (addresses, logout) | Warm |
| `/account/login` | Customer login | Warm |
| `/account/register` | Customer registration | Warm |

## Owner / staff auth

| Route | Purpose | Design |
|---|---|---|
| `/login` | Owner/staff login | Warm |
| `/register` | Owner registration | Warm |
| `/forgot-password` | Request password reset | Warm |
| `/reset-password` | Reset via token | Warm |
| `/verify-email` | Email verification landing | Warm |

## Owner onboarding

| Route | Purpose | Design |
|---|---|---|
| `/setup` | 7-step Business Setup Wizard (type → info → location → payment → menu import → theme → done) | Warm |

## Owner dashboard (`/dashboard/*`)

| Route | Purpose | Design |
|---|---|---|
| `/dashboard` | Overview; shows Admin panel for ADMIN role; email-verify banner | Warm |
| `/dashboard/orders` | Order list (search/filter) | Warm |
| `/dashboard/orders/[id]` | Order detail + status transitions + driver assign (delivery) | Warm |
| `/dashboard/menu` | Products view | Warm |
| `/dashboard/menu/new` | Create menu item | Warm |
| `/dashboard/menu/[id]` | Edit menu item | Warm |
| `/dashboard/menu/categories` | Manage categories | Warm |
| `/dashboard/menu/modifiers` | Manage modifier groups/options | Warm |
| `/dashboard/kitchen` | Kitchen Display System (KDS, polling auto-refresh) | Partial (mixed) |
| `/dashboard/kitchen-capacity` | Kitchen capacity settings | Legacy |
| `/dashboard/staff` | Staff management / invites | Legacy |
| `/dashboard/payments` | Payment provider connections (Stripe real; others "coming soon") | Legacy |
| `/dashboard/coupons` | Coupon management | Warm |
| `/dashboard/loyalty` | Loyalty program | Warm |
| `/dashboard/referrals` | Referral tracking | Legacy |
| `/dashboard/tables` | Table management + QR tokens | Legacy |
| `/dashboard/delivery` | Delivery config (enable delivery/pickup/dine-in, radius, min order) | Legacy |
| `/dashboard/driver` | Driver view (accept/decline, picked-up/delivered, geolocation ping) | Legacy |
| `/dashboard/pos` | POS integrations (all "coming soon") | Legacy |
| `/dashboard/restaurant` | Restaurant settings + hours ("Settings" in nav) | Legacy |
| `/dashboard/profile` | User profile / change password | Legacy |
| `/dashboard/analytics` | Analytics dashboard (sales/revenue/top items) | Warm |
| `/dashboard/reports` | Reports | Warm |
| `/dashboard/reviews` | Reviews moderation | Warm |
| `/dashboard/customers` | Customer list | Warm |
| `/dashboard/customers/[id]` | Customer detail (real tel:/mailto: links) | Warm |
| `/dashboard/notifications` | Notifications feed (real NotificationLog) | Warm |
| `/dashboard/import` | AI menu import hub | Warm |
| `/dashboard/import/[id]` | Import job review (approve/reject extracted items) | Warm |
| `/dashboard/launch` | Launch Center | Warm |
| `/dashboard/launch/test-order` | Test-order flow | Warm |
| `/dashboard/builder` | "Storefront" AI website builder (cinematic build/reveal) | Warm |
| `/dashboard/website` | "Storefront Studio" hub | Warm |
| `/dashboard/website/editor` | Customization Studio (live preview, section manager, brand/header/footer panels) | Warm |
| `/dashboard/website/variations` | Generated storefront variations | Warm |
| `/dashboard/website/variations/[id]` | Variation detail | Warm |
| `/dashboard/website/publish` | Publish flow | Warm |
| `/dashboard/website/score` | Site score (SEO/accessibility/performance/brand/conversion) | Warm |
| `/dashboard/website/messages` | Contact-form inbox | Warm |

## Platform admin

Admin is **folded into `/dashboard`** (an admin panel/overview renders when the
logged-in user's role is `ADMIN`) — there is no separate `/admin` route tree.
Admin API surface: list restaurants, suspend/unsuspend, audit log.

## Layouts & utilities

- `/layout.tsx` (root), `/dashboard/layout.tsx` (owner shell), `/setup/layout.tsx`.
- `robots.ts`, `sitemap.ts` (SEO), plus API proxy rewrites for
  `/api/*`, `/preview/*`, `/assets/*`, `/store/*`.

## Design-system status summary

- **Re-themed (Warm):** customer-facing + recently-touched owner pages
  (orders, menu, coupons, loyalty, analytics, reports, reviews, customers,
  notifications, import, launch, builder/website studio, overview, auth,
  setup).
- **Still Legacy (zinc/dark):** operational/secondary owner pages — staff,
  payments, referrals, tables, delivery, driver, pos, profile,
  kitchen-capacity, restaurant, and partially kitchen. Structurally sound
  (mobile nav/overflow fixed), pending visual retheme. **Not a launch
  blocker** — functional, just visually inconsistent.

## Navigation components

- `dashboard-nav.tsx` — desktop pill nav + mobile bottom tab bar.
- `owner-shell.tsx` — "Owner Dashboard V3" chrome (desktop top nav + mobile
  bottom tabs + "More" sheet).
- `dashboard-drawer.tsx` — slide-out drawer nav.
- `app/dashboard/dashboard-overview.tsx` — the Overview page carries its own
  layout (a known, pre-existing duplication vs `dashboard-nav`).
