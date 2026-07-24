# STORE_ARCHITECTURE_FINAL

> Final, authoritative architecture for the OrderVora customer-facing surface.
> Product-engineering decision — **one** recommended architecture, not a menu of options.
> Status: **decision doc only** — no code changed, no PR, no merge.
> Author pass: full architectural audit of `apps/web` + `apps/api/src/modules/sites`.

---

## 0. ملخّص تنفيذي (Arabic executive summary)

المشروع يملك **سطحين مختلفين للعميل** تم الخلط بينهما:

- **A — Ordering Storefront**: صفحة الطلب. الملف `apps/web/src/app/order/[restaurantId]/page.tsx`. المسار `/order/[restaurantId]`. (أُعيد تصميمها "Appetite Premium" على فرع PR #40 — **غير مدموجة بعد**.)
- **B — Marketing Website**: الموقع التعريفي. يصيّره الـ backend في `apps/api/src/modules/sites/renderer/*`. المسار `/store/[slug]` (أو subdomain / custom domain). هذا ما ينتجه تدفّق Setup → Theme → Builder.

**القرار النهائي المعتمد:** الإبقاء على الاثنين، وتوحيدهما تحت **دومين واحد لكل نشاط**:

```
https://{business-host}/            → Marketing Website (B)   ← أول ما يراه العميل
https://{business-host}/order/...   → Ordering Storefront (A)  ← زر "Order Online" ينقله هنا
```

`{business-host}` = custom domain، أو `{slug}.ordervora.com`، أو `ordervora.com/store/{slug}` كحل احتياطي (البنية الحالية تدعم الثلاثة).

**لا subdomain منفصل للطلب.** الطلب يعيش كـ **مسار (`/order`) داخل نفس دومين الموقع** — أفضل تجربة، جلسة واحدة، براند واحد، SEO أقوى.

---

## 1. FINAL ARCHITECTURE (recommended)

### 1.1 The decision, in one sentence
**Two surfaces, one host, path-split:** the Marketing Website (B) owns the root of each business's host and is the customer's first impression; the Ordering Storefront (A) lives at `/order` under the *same* host and owns the transaction. Neither is deleted; they are cross-linked and share one brand + one session.

### 1.2 Surface responsibilities (no overlap)

| Surface | Owns | Does NOT own |
|---|---|---|
| **B — Marketing Website** | Brand, discovery, SEO, trust, information: Home, About, Contact, Catering, Gallery, Reviews, Brand Story, Hours & Map, Business Info | Cart, checkout, payment, account, live order state |
| **A — Ordering Storefront** | Transaction: Menu, Categories, Product detail, Cart, Checkout, Pickup/Delivery, Coupons, Loyalty, Customer Account, Order Tracking | Long-form brand/marketing content, SEO landing pages |

### 1.3 Why same-host path-split (and not two subdomains)
- **UX:** "Order Online" feels like the same site, not a jump to a foreign domain.
- **Session/cookies:** cart + auth cookies are first-party on one host — no cross-subdomain cookie friction.
- **SEO:** all link equity accrues to one host; the website ranks and funnels into ordering.
- **Brand:** one canonical domain the owner promotes everywhere (QR, Instagram, Google).

### 1.4 Where the code already supports this
- B is already **multi-page** (`render-site.ts` renders every `definition.pages[].slug`) with SEO infra (`sitemap.ts`, `json-ld.ts`, `seo-head.ts`).
- Host resolution already exists: custom domain (`SiteDomain`), wildcard subdomain `{slug}.{PLATFORM_DOMAIN}` (`site.service.ts` `temporaryDomainFor`, gated by `SITE_WILDCARD_DNS_ACTIVE`), and `/store/{slug}` fallback (`public-render.routes.ts`).
- A already exists and is feature-complete for ordering (menu, cart, checkout, coupons, loyalty, account, tracking).
- **The one missing seam:** A is addressed by `restaurantId` on the platform host; B is addressed by `slug` on the business host. Unifying = serve A at `{business-host}/order` with a slug→restaurantId resolve.

---

## 2. USER JOURNEY

### 2.1 Discovery → Order (the golden path)
```
Google / Instagram / QR / Google Business
        │
        ▼
{business-host}/                     ← Marketing Website (B): hero, brand, reviews, map
        │  "Order Online" CTA (header + hero + sticky)
        ▼
{business-host}/order                ← Ordering Storefront (A): menu, best sellers
        │  add items → slide-over cart
        ▼
{business-host}/order/.../cart       ← Cart (A)
        ▼
{business-host}/order/.../checkout   ← Checkout (A): pickup/delivery, tip, pay
        ▼
{business-host}/order/track/{id}     ← Order tracking (A)
```

### 2.2 Return-to-website
- A's top-bar brand/logo → links back to `{business-host}/` (Website home).
- A's footer → "About · Contact · Hours" links back into B pages.

### 2.3 Owner journey (unchanged, clarified)
```
Signup → /setup (wizard) → website-theme-step → /dashboard/builder
      → live build → design review/approve → publish → finale
      → "Open My Restaurant" → /dashboard/website (manage)  ← should ALSO surface the live B + A links
```

---

## 3. URL STRUCTURE (final)

### 3.1 Customer-facing (per business host)
`{business-host}` = `www.mrealdomain.com` | `{slug}.ordervora.com` | `ordervora.com/store/{slug}`

| URL | Surface | Purpose |
|---|---|---|
| `{host}/` | B | Website home (hero, brand, order CTA) |
| `{host}/about` | B | About / Brand Story |
| `{host}/contact` | B | Contact + Google Map |
| `{host}/catering` | B | Catering (**missing — build**) |
| `{host}/gallery` | B | Gallery |
| `{host}/reviews` | B | Reviews wall |
| `{host}/menu` *(SEO)* | B→A bridge | SEO menu landing that deep-links into A |
| `{host}/order` | A | Ordering storefront home (menu) |
| `{host}/order/item/{id}` | A | Product detail page (**missing as URL — build**) |
| `{host}/order/cart` | A | Cart |
| `{host}/order/checkout` | A | Checkout |
| `{host}/order/track/{orderId}` | A | Order tracking |
| `{host}/account` | A | Customer account |

### 3.2 Platform-internal (today's real paths — kept as resolvers/fallbacks)
| Path | Meaning |
|---|---|
| `ordervora.com/order/[restaurantId]` | A, addressed by restaurantId (current) |
| `ordervora.com/store/[slug]` | B fallback render (current) |
| `{slug}.ordervora.com` | B subdomain (when `SITE_WILDCARD_DNS_ACTIVE=true`) |

> **Integration task:** map `{host}/order` → the Next.js order app with slug→restaurantId resolution, so the customer never sees a raw `restaurantId` or a host switch.

---

## 4. DASHBOARD STRUCTURE (owner — audit + target)

Current owner routes (`apps/web/src/app/dashboard/*`) — **complete, keep**:
`analytics, builder, coupons, customers[/id], delivery, driver, import[/id], kitchen, kitchen-capacity, launch[/test-order], loyalty, menu[/id,/categories,/modifiers,/new], notifications, orders[/id], payments, pos, profile, referrals, reports, restaurant, reviews, staff, tables, website[/editor,/messages,/publish,/score,/variations[/id]]`

### 4.1 Duplication to resolve
- **`dashboard/website/*` (manual Website Hub) vs `dashboard/builder/*` (AI Builder)** — two entry points that both create/manage site B.
  **Decision:** `builder` = *create / regenerate* (the cinematic generation flow); `website` = *manage / publish / domains / edit*. Make `builder` a launch action **inside** `website` (one "Website" home, a "Regenerate with AI" button opens the builder). Do **not** delete either — merge their navigation.
- **`dashboard/overview` nav vs `DashboardNav`** — pre-existing duplicated layout (noted in PROJECT_MEMORY). Consolidate onto `DashboardNav`. Low priority.

---

## 5. STOREFRONT STRUCTURE (A — audit)

Files: `apps/web/src/app/order/[restaurantId]/`

| Feature | State | Location |
|---|---|---|
| Menu + Categories | ✅ complete | `page.tsx` (V2 on PR #40) |
| Best Sellers / Trending / Staff picks | 🟡 UI done, **ranking is placeholder** | `page.tsx` (`TODO(backend)`) |
| Product detail | 🟡 **sheet/modal only — no URL** | `ItemModal` in `page.tsx` |
| Cart | ✅ complete (V2 on PR #40) | `cart/page.tsx` |
| Checkout (pickup/delivery/tip/card/wallet/3DS) | ✅ complete (V2 on PR #40) | `checkout/page.tsx` + `card-payment-form.tsx` |
| Coupons | ✅ complete | `cart/page.tsx` + API `cart.service` |
| Loyalty | ✅ complete | `cart/page.tsx` + API |
| Customer Account | ✅ exists | `app/account/*` |
| Order Tracking | ✅ exists | `order/track/[orderId]/page.tsx` |
| Reviews on storefront | 🟡 ratings/reviews shown; submit flow exists | `page.tsx` + `getRestaurantReviews` |
| Product images | 🟡 warm gradient placeholders (no photo field) | `Photo` in `page.tsx` |

**A blocker:** the whole A redesign lives on branch `claude/storefront-redesign-premium-k0dt4v` (PR #40) — **not merged to `main`**, so production still serves the old A.

---

## 6. WEBSITE STRUCTURE (B — audit)

Renderer: `apps/api/src/modules/sites/renderer/*` (server-rendered HTML). Components present:
`hero, about-teaser, contact, gallery, reviews, hours-location (map), footer, chrome (header/nav), features, offers, loyalty, menu-section, best-sellers, featured-categories, featured-products, signature-dishes, cta-banner, newsletter, service-options, age-gate, app-promotion, custom-text-image`

| Requested page/feature | State | Notes |
|---|---|---|
| Home | ✅ | `hero.ts` + sections |
| About / Brand Story | 🟡 teaser exists | `about-teaser.ts` — needs full About page content |
| Contact | ✅ | `contact.ts` |
| Google Maps | 🟡 "Get directions" link + MapEmbed comment | `hours-location.ts` — confirm embedded map, not just a link |
| Gallery | ✅ | `gallery.ts` |
| Reviews | ✅ | `reviews.ts` |
| SEO pages | ✅ infra (multi-page + sitemap + json-ld + seo-head) | `render-site.ts` iterates `definition.pages` |
| Business Information / Hours | ✅ | `hours-location.ts` |
| **Catering** | ❌ **missing** | no `catering` component/page |
| **Hero Images** | ❌ **broken (black)** | see §7 |

### 6.1 The "black images" root cause (confirmed)
- `renderer/placeholder-imagery.ts` renders **near-black** placeholders when no real image exists: hero gradient `#4a2c1a → #231610 → #0a0705`; dish/category `#31261f → #140d09`.
- `renderer/asset-resolver.ts` `resolveHeroImage()` returns `undefined` when there is no uploaded photo and no AI image → the dark placeholder is drawn.
- **AI images are not being produced** in the environment: needs `OPENAI_API_KEY` **and** object storage configured (documented in commit `c5256b2`). Until then B looks black.

### 6.2 Generation V2 (theme system) is OFF
- `apps/api/src/modules/sites/v2/rollout.ts`: `GENERATION_V2_ENABLED=false` by default, and requires a non-empty `GENERATION_V2_RESTAURANT_IDS` allowlist even when enabled. So B is generated by **V1** in production.

---

## 7. CURRENT-SYSTEM AUDIT — exists / complete / incomplete / duplicate / delete / merge

**✅ Exists & complete**
- Owner dashboard (all modules), Setup Wizard (7 steps, restyled), AI Builder flow (build → review → publish → finale), Website B renderer (rich sections, multi-page, SEO), Ordering A (menu→cart→checkout→track→account, coupons, loyalty), domain/subdomain/custom-domain resolution.

**🟡 Incomplete / placeholder**
- A premium redesign not merged (PR #40). Best-sellers ranking = placeholder. Product detail has no URL. B hero/category images black (no AI images / storage). Generation V2 off. Catering page missing. About page = teaser only. Google Map = link (verify embed). B↔A cross-linking not wired.

**♻️ Duplicate**
- `dashboard/website` (manual hub) **and** `dashboard/builder` (AI) both own site B management.
- `dashboard/overview` custom nav vs shared `DashboardNav`.

**🗑️ Delete**
- **Nothing is deleted.** (Per decision: keep both A and B.) Only *consolidate* the two dashboard entry points and the duplicated nav.

**🔀 Merge**
- Merge PR #40 (A premium) into `main`.
- Merge `builder` under `website` as the "create/regenerate" action (single Website home in the dashboard).
- Unify addressing so A is served at `{business-host}/order` (slug→restaurantId).

---

## 8. MISSING FEATURES (build list)

**Website B**
1. Real **Hero/Gallery images** → enable AI image gen (`OPENAI_API_KEY`) + object storage, or owner photo upload.
2. **Catering** page + component.
3. Full **About / Brand Story** page (beyond teaser).
4. Confirm/upgrade **Google Maps embed** (interactive map, not just directions link).
5. Decide **Generation V2** on/off for real (theme system) via rollout flags.

**Ordering A**
6. **Merge PR #40** (premium A) to `main`.
7. **Product detail pages** with real URLs (`/order/item/{id}`) for SEO + deep links (today it's a modal).
8. Real **Best Sellers / order-count ranking** + Staff-Pick flags (backend).
9. Product **image fields** in the menu model.

**Bridge (B ↔ A)**
10. "Order Online" CTA in B → `{host}/order`.
11. A brand/logo + footer → back to B pages.
12. Serve A under the **business host** at `/order` (slug resolution) so there's no host switch.

---

## 9. PRIORITY ORDER (final)

**P0 — Make what exists actually visible & correct**
1. Merge **PR #40** (A premium) to `main` → deploy. *(A becomes real in production.)*
2. Fix **black images**: set `OPENAI_API_KEY` + object storage, or ship owner photo upload → B stops being black.
3. Wire **B → A "Order Online"** and **A → B home** links (cross-surface navigation).

**P1 — Unify the two surfaces under one host**
4. Serve **A at `{business-host}/order`** with slug→restaurantId resolution (kill the raw-restaurantId host switch).
5. Make **"Open My Restaurant"** (`finale-reveal.tsx`) + `dashboard/website` surface the **live B URL and the /order URL** clearly.
6. Decide & set **Generation V2** (theme system) on/off explicitly.

**P2 — Complete each surface**
7. B: **Catering** page, full **About/Brand Story**, interactive **Google Map**.
8. A: **Product detail URLs**, real **Best-Sellers ranking** + menu **image fields**.

**P3 — Cleanup / consolidation**
9. Merge `dashboard/builder` under `dashboard/website` (one Website home).
10. Consolidate `dashboard/overview` nav onto `DashboardNav`.

---

## 10. Open decisions needing the owner's word
- **Host per business:** custom domain first, or `{slug}.ordervora.com` (flip `SITE_WILDCARD_DNS_ACTIVE`), or keep `/store/{slug}` for now? *(Recommendation: `/store/{slug}` now → subdomain next → custom domain as upsell.)*
- **Images:** enable AI image generation (cost) vs. owner photo upload vs. curated stock per vertical? *(Recommendation: owner upload + AI as assist; stock fallback per vertical, never black.)*
- **Generation V2 theme system:** turn on, or standardize on V1 for launch? *(Recommendation: V1 for launch stability; V2 behind allowlist for pilots.)*

---

*End of STORE_ARCHITECTURE_FINAL.md — analysis + decision only. No code was modified; no PR/merge performed.*
