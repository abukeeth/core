# Theme Engine V3 — Architecture

**Status:** Restaurant (`restaurant-maison`) shipped (PR #15). This document is the architecture for extending the *same* engine to the next six business types — Cafe, Deli, Bakery, Vape Shop, Convenience Store, Retail — with no parallel system and no rewrite.

---

## 1. Thesis

OrderVora already generates a **complete, data-driven storefront** from a small, composable set of primitives. Maison proved that a genuinely distinct, premium design language is expressible entirely as *data + additive variants* on top of those primitives — no bespoke page code.

V3 is therefore **not** a new engine. It is:

1. **One real engine change** — make theme *selection* business-type-aware (today it keys on style family + brand personality + cuisine).
2. **N theme entries** — one `ThemeCatalogEntry` per business type, each declaring its own tokens, variants, section order, presentation and imagery direction, exactly like Maison.
3. **A handful of shared, additive building blocks** reused across types (an age-gate section, product-catalog layouts, per-type imagery), each added once.

Everything else — tokens, section grammar, presentation, imagery fallback, real-data resolvers, conversion — already exists and is proven.

---

## 2. The engine anatomy (what every theme reuses)

| Seam | File | What it does | V3 reuse |
|---|---|---|---|
| **Theme unit** | `theme-catalog.ts` → `ThemeCatalogEntry` | key, version, style family, personality vector, cuisine affinities, constraints, **tokens**, **variants**, **layouts.home**, **presentation** | One entry per business type |
| **Selection** | `theme-matching.ts` | Scores themes by personality-cosine + cuisine affinity, one winner per family | **Extend** with business-type match (§3) |
| **Design tokens** | `theme-css.ts` + `brandSettings` | Compiles palette/type/radius/shadow/spacing to CSS variables every component reads | Per-type palette + type via `presentation.brandSettings` |
| **Structural variants** | `variants.{hero,menuLayout,chrome}` + component branches | Distinct hero / catalog / header treatments selected per theme | Add per-type variants (additive enum) |
| **Section grammar** | `layouts.home` + `renderer/registry.ts` + `layout-engine.ts` | Homepage = an ordered list of section types; registry maps type → component; empty renders are dropped | Re-order + reuse sections; add new ones additively |
| **Self-describing theme** | `ThemeCatalogEntry.presentation` → `assemble.ts` | Header/footer/product-presentation/brand-token defaults copied into the `SiteDefinition` | Every type declares its own chrome + tokens |
| **Imagery** | `placeholder-imagery.ts` | tenant photo → bundled asset → **generated** self-contained SVG (no hotlinks) | Add per-type generators (dish → pastry → bottle → packshot) |
| **Live/real data** | `render-site.ts` → `RenderContext` | Resolves live menu, assets, services, reviews, offers, loyalty at render time | Same resolvers; surface different data per type |
| **Catalog data model** | `MenuCategory` / `MenuItem` | A categorised catalog of priced, **stocked** (`MenuItemInventory`), **variant-able**, **modifiable**, image-bearing items | Generalises to products/aisles/shelves with **no schema change** |

**Key realisation:** `MenuItem` is not food-specific. It is a generic sellable unit (name, price, availability, inventory, variants, modifiers, image). `MenuCategory` is a generic grouping. The whole engine already speaks *catalog*, not *menu* — so a bakery case, a vape catalog, a convenience aisle and a retail shelf are the *same* data with different labels.

---

## 3. The one engine change: business-type-aware selection

Today `selectThemeForFamily` picks the best non-deprecated theme in a style family by personality + cuisine. V3 needs a theme to be chosen because the tenant **is a bakery**, not because its personality resembles one.

**Design (additive, low-risk, no schema change):**

```
ThemeCatalogEntry {
  …existing…
  businessTypes?: BusinessType[];   // NEW — which business types this theme serves
}
```

Selection becomes: **exact `businessType` match wins**; within matches, the existing personality + cuisine score breaks ties; if a type has no dedicated theme yet, fall back to the current family-based pick (so nothing regresses). `Restaurant.businessType` already exists (enum: RESTAURANT, COFFEE_SHOP, DELI, VAPE_SHOP, CONVENIENCE_STORE, BAKERY, PIZZA, RETAIL, OTHER) and is captured at onboarding — no new data required.

This is ~30 lines in `theme-matching.ts` + one optional field, fully covered by the existing golden-test pattern.

---

## 4. Per-type theme recipes

Each is one `ThemeCatalogEntry` (+ any *new* shared block it needs). Palette/type are illustrative; all are expressed through `presentation.brandSettings` + `tokens`.

### 4.1 Restaurant — *Maison* ✅ shipped
Style LUXURY · espresso/brass/ivory serif · hero `cinematic` · menu `editorial-menu` · chrome `editorial` · sections: hero → story → signatures → menu → gallery → service options → reviews → location · conversion: **reserve / order-ahead / dine-in** · imagery: moody low-light plated dishes. *The reference implementation.*

### 4.2 Cafe (COFFEE_SHOP) — *Daybreak*
Style MINIMAL/warm · cream/terracotta/sage, soft serif + rounded sans · hero warm inset · catalog `warm-cards` (reuse) · **loyalty/rewards band** (reuse existing `loyalty` section + `getProgram`) · conversion: **order pickup + rewards + subscription** · imagery: bright high-key coffee/pastry. New: none structural — reuses `loyalty`, `offers`, `serviceOptions`.

### 4.3 Deli — *Counter*
Style MODERN/bold · deli-green/mustard/tomato, condensed uppercase display · hero `bold-block` (reuse) · catalog `bold-grid` (reuse) · conversion: **fast pickup + catering + daily special** (reuse `offers` for the special, `serviceOptions`) · imagery: bright overhead stacked subs. New: none.

### 4.4 Bakery — *Flour & Salt*
Style MINIMAL/soft · butter/rose/warm-white, delicate serif · hero soft inset · catalog `warm-cards` (reuse) · **pre-order / custom-cake** conversion (a small new `serviceOptions`-style variant, or reuse `serviceOptions` with pre-order copy) · imagery: high-key crumb/pastry close-ups (new `pastryPlaceholder`). New: 1 imagery generator.

### 4.5 Vape Shop — *Vapor*
Style bold/dark · near-black + neon, grotesk + mono for specs · **age-gate (new blocking section + compliance)** · catalog as a **filterable product grid** with nicotine-strength chip (reuse `featuredProducts`/menu with `MenuItemVariant` for strength) · conversion: **age-verify → add-to-cart → reorder** · imagery: dark studio product-on-black (new `productDarkPlaceholder`). New: **age-gate section** (shared, also useful for any restricted category) + 1 imagery generator.

### 4.6 Convenience Store (CONVENIENCE_STORE) — *QuickMart*
Style utility · cobalt/amber/red, bold grotesk · compact hero with **ETA badge** · **dense aisle/category grid** (new `aisle-grid` catalog variant) · conversion: **ASAP delivery + reorder + deals** (reuse `offers`, `serviceOptions` with delivery ETA) · imagery: bright packshots on white (new `packshotPlaceholder`). New: 1 catalog variant + 1 imagery generator.

### 4.7 Retail — *Storefront*
Style clean commerce · brand-neutral, modern sans · hero lifestyle · **product grid + collections** (reuse `featuredCategories` as collections, product grid catalog variant) · variants + inventory drive size/colour options · conversion: **add-to-cart + collections** · imagery: product-on-neutral packshots (reuse `packshotPlaceholder`). New: reuses convenience's building blocks.

---

## 5. New shared building blocks V3 introduces (each added once, reused)

| Block | Type | Used by | Notes |
|---|---|---|---|
| **Age-gate section** | new section type + component | Vape (and any restricted item) | Blocking 21+ overlay; compliance, not styling. Real signal, not fabricated. |
| **Catalog variants** `aisle-grid`, `product-grid` | new `menuLayout`/`featuredProducts` variants | Convenience, Retail, Vape | Dense, filter-forward; drive off `MenuItemVariant` + `MenuItemInventory`. |
| **Per-type imagery** `pastry`, `productDark`, `packshot` | extend `placeholder-imagery.ts` | Bakery, Vape, Convenience, Retail | Same deterministic, self-contained SVG approach as Maison. |
| **ETA / status bar** | reuse `header.announcementBar` + real hours/delivery | Convenience, all | Already schema-supported; needs a real open/closed signal (structured hours — see §7). |
| **Loyalty / rewards** | reuse existing `loyalty` section | Cafe, Convenience | `getProgram` already resolved into the context. |

All are additive: new enum values + new registry entries + maison-style theme gating. Deprecated and existing themes are untouched.

---

## 6. Terminology mapping (no schema change)

| Concept | Restaurant | Cafe | Deli | Bakery | Vape | Convenience | Retail |
|---|---|---|---|---|---|---|---|
| `MenuCategory` | Course | Menu section | Counter | Case | Product type | Aisle | Collection |
| `MenuItem` | Dish | Drink/bake | Sub | Bake | Device/e-liquid | Item | Product |
| Primary CTA | Reserve/Order | Order pickup | Order | Pre-order | Add to cart | Start order | Add to cart |

Labels are a **presentation** concern (per-type copy in `assemble`/components), not a data change.

---

## 7. Honest gaps & risks

- **Business-type selection** must be added (§3) before any non-restaurant theme is auto-selected. Small, additive.
- **Structured hours**: a live open/closed status bar (nice for Cafe/Convenience) needs structured hours; today `facts.hours` is free text. Either add a structured-hours field (small migration) or keep the announcement bar owner-authored. Not a blocker.
- **Reservations** has no data model yet (Maison shows it only when `facts.hasReservations`, currently always false). Real reservations are a separate backend feature.
- **Imagery realism**: generated placeholders are art-directed, not photographs. The design makes *tenant* photos shine; a bundled first-party asset pack (tier 2) per type would raise the no-photo baseline. Optional.
- **Product-specific fields** (nicotine strength, size/colour) map onto `MenuItemVariant`/modifiers today; a richer attribute model is optional, not required for V3.

---

## 8. Delivery plan (incremental, each shippable alone)

1. **Selection** — `businessTypes` on `ThemeCatalogEntry` + business-type-first matching (+ golden tests). *Foundation.*
2. **Cafe, Deli, Bakery** — theme entries reusing existing variants + a bakery imagery generator. *No new engine surface beyond §1.*
3. **Shared blocks** — age-gate section + `aisle-grid`/`product-grid` catalog variants + dark/packshot imagery.
4. **Vape, Convenience, Retail** — theme entries on top of (3).

Each step: additive, no schema change (except optional structured hours), deprecated/existing themes byte-identical, covered by the established test patterns (catalog validity, selection golden tests, per-component render tests, imagery determinism/no-hotlink).

---

## 9. Scorecard — already built vs. remaining

**Already in the engine (proven by Maison):** theme unit, token compilation, section grammar + registry, self-describing `presentation`, tenant→bundled→generated imagery with no hotlinks, live-data resolvers (menu/services/reviews/offers/loyalty), generic catalog data model, additive variant mechanism, mobile-first + a11y + reduced-motion.

**Remaining for V3:** business-type-aware selection (1 change); 6 theme entries; age-gate section; 2 catalog variants; 3 imagery generators; per-type copy/labels. All additive.

The engine is ready. V3 is composition, not construction.
