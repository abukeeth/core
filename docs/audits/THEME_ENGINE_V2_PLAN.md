# Theme Engine V2 — Audit & Implementation Plan

**Date:** 2026-07-18
**Scope:** Storefront rendering / theme engine (`apps/api/src/modules/sites`). No web-app changes; the design-review preview iframe renders whatever the API produces.

---

## 1. Audit of Theme Engine V1

### What was already good (not the problem)
- Three genuinely distinct design systems are the only ones new generations pick — `modern-editorial` (Modern), `warm-local` (Local), `bold-commerce` (Luxury). They already differed in **hero variant**, **header/nav chrome**, **menu layout**, **typography**, **radius/motion/type-scale** — not merely color. (`theme-catalog.ts`, `design-systems.test.ts`.)
- Real live data flows into the renderer (menu, categories, prices, assets), token-driven CSS, mobile-first, reduced-motion, safe-area handling.

### The real gaps (all confirmed in code)
1. **Placeholder imagery everywhere.** With no uploaded photo, hero and category tiles fell back to a flat gradient + a single initial letter (`image-fallback.ts`, `hero.ts`), and **`featured-products.ts` rendered no image at all** (text-and-price cards). A freshly-imported business (`photoCount: 0`, no assets) was entirely gradient tiles and text — the "wireframe / empty boxes" complaint.
2. **Required sections weren't in the layouts.** The three systems' `layouts.home` contained only hero / signatureDishes / aboutTeaser / hoursLocation / gallery / ctaBanner / footer. **Featured Products and Categories were never placed on the home page**, and **Gallery dropped out entirely when there were no uploaded photos** (`section-rules.ts` gated it on `hasPhotos`).
3. **Reviews can't render for a new business.** `reviews.ts` returns empty unless the owner typed quotes; there is no customer-review data source. (Intentional integrity guardrail — see `section-rules.ts`.)
4. **Differentiation was modest**, not "three professional agencies."

---

## 2. Decisions (product owner)
- **Imagery:** Hybrid — real curated stock photos selected automatically by business type / cuisine / category, with a generated fallback so there are **never empty boxes**.
- **Reviews:** **Do not generate fake reviews.** Omit the Reviews section entirely (preview and published) when there are no real reviews. (No change needed — it already self-omits and is not placed in any home layout.)

---

## 3. Implementation

### New: business-aware imagery (`renderer/imagery.ts`)
- Curated Unsplash-CDN photo pools keyed by **cuisine**, **business type** (hero), and **category-name keyword** (e.g. "Desserts" → a dessert photo), plus generic fallback pools.
- `pickStockPhoto({ slot, cuisine, businessType, key })` — deterministic on `key` (item/category name), so a card is stable across renders and a grid shows variety.
- `galleryStockPhotos({ cuisine, count })` — a distinct set for the Gallery, drawing from the cuisine pool + generic pool so it always yields the requested count.

### New primitive: `renderPhoto()` (`renderer/image-fallback.ts`)
- Renders a real photo **layered over a deterministic generated gradient** via CSS multiple backgrounds: uploaded asset wins, else curated stock, and the generated gradient always sits underneath.
- If the photo fails to load (or none exists) the gradient shows through — the **"hybrid, never empty" contract**, achieved with pure CSS (no JS, CSP-safe), plus `role="img"` + `aria-label` for accessibility.

### Wired imagery into every image slot
- **Hero** (`hero.ts`): un-uploaded full-bleed and inset heroes now use a business-matched stock photo layered over the gradient, instead of a flat gradient.
- **Featured Products** (`featured-products.ts`): now renders a real product image per card (upload → stock-by-name → generated), plus **per-family card treatment** (Luxury dense hard-edged, Local cozy rounded, Modern airy editorial).
- **Featured Categories** (`featured-categories.ts`): stock photo matched to the category name/cuisine over the gradient, per-family framing.
- **Gallery** (`gallery.ts`): renders curated cuisine-matched stock imagery when there are no uploads, so it never vanishes.

### Complete, differentiated homepages (`theme-catalog.ts`)
Added Featured Products + Featured Categories to all three systems and gave each a **distinct section order / visual hierarchy**:
- **Modern (editorial):** hero → products → about → categories → gallery → hours → CTA → footer (story-forward, alternating).
- **Local (warm):** hero → categories → products → about → gallery → hours → CTA → footer (menu-forward, community).
- **Luxury (bold-commerce):** hero → products → categories → CTA → gallery → about → hours → footer (commerce-forward, early conversion push).

### Supporting changes
- `section-rules.ts`: Gallery is always allowed (imagery guarantees content); Featured Products/Categories gate on having menu items.
- `app.ts`: storefront CSP `imgSrc` extended to allow `https://images.unsplash.com` (documented inline). Every photo is still layered over a generated fallback, so a blocked/failed load degrades gracefully.

---

## 4. Tests
- New `imagery.test.ts` — allow-listed URLs, determinism, grid variety, keyword/business-type matching, gallery count, unknown-cuisine fallback.
- New `renderPhoto` tests — upload-wins, stock-over-gradient, gradient-only-never-empty, escaping, aspect ratio, deterministic gradient.
- Updated component/rule tests to encode V2 behavior (categories/gallery imagery, gallery always kept, featured sections gated on menu).
- Strengthened `design-systems.test.ts` — every system's home renders real imagery + Featured Products + Categories + Gallery for a no-upload business, and the three section orders are all distinct.
- **API suite: 1265 passed / 5 skipped** (+16). Typecheck, lint, build clean.

## 5. Honest caveats / risks
- **Stock-photo reliability:** the curated Unsplash photo IDs are best-effort and were **not reachable to verify from the build sandbox** (outbound egress is blocked). This is exactly why every photo is layered over a generated gradient — a photo that 404s degrades to the gradient, never a broken box — but if a given ID is wrong, that card shows the (still-intentional) gradient rather than a photo. Photo IDs should be spot-checked on the staging preview.
- **No database migration** — layouts are read from the `THEME_CATALOG` code constant at generation time, not the DB `Theme` table, so the layout changes take effect on deploy with no schema/seed dependency. (Re-running `prisma/seed.ts` will sync the `Theme` rows if desired.)
- **Only new generations** are affected; already-published sites render from their frozen stored `definition`, so nothing changes for existing sites.
- **Reviews** remain omitted when there's no real review data, per decision 2.
