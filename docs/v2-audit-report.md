# V2 Generation Engine — Architecture Audit Report

> **Scope:** Assessment of the codebase against the proposed vision of replacing
> theme/template selection with a fully AI-driven pipeline that produces a **JSON
> configuration only**, then builds the storefront from a **component library**.
>
> **Proposed pipeline:** `Menu Photo / PDF / Website URL / Google Business URL →
> AI Catalog Extraction → AI Business Intelligence → AI Brand Generation → AI
> Layout Composition → AI Store Generation → Live Store`
>
> **Status:** Documentation only. No production code was modified.

---

## 1. Executive Summary

The proposed architecture **already exists in the codebase**, implemented as a
system named **"Generation V2"** under `apps/api/src/modules/sites/v2/`. It is not
a prototype — it is a fully plumbed production path that is currently **disabled
behind a feature flag** (`GENERATION_V2_ENABLED=false`) and scoped to an explicit
allowlist of business IDs.

The core architectural demand — *"AI emits JSON config only; a Store Generator
builds the site from a component library; no directly generated HTML/CSS/React"* —
is precisely how the system is built:

```
AI → CreativeBrief / StorefrontPlan (JSON, Zod-validated)
   → compileDefinition() → SiteDefinition (JSON, schemaVersion 2, theme-free)
   → deterministic renderer maps { type, variant } → component functions via a registry
   → HTML
```

The system's own design philosophy already **rejects fixed themes**: a hard
module boundary (enforced by `v2/module-boundary.test.ts`) forbids anything in
`v2/` from importing the legacy theme catalog, and the words
`theme / template / variation / brief` are banned from customer-facing output
(`v2/contracts.ts:24`, `INTERNAL_ONLY_TERMS`).

**Bottom line:** the work is **not** to build a new architecture. It is to
**complete V2 (~15% remaining), expand the component library, and roll it out
gradually while retiring V1.**

| Vision layer | State | Confidence |
|---|---|---|
| AI Catalog Extraction | ✅ Complete | High |
| AI Business Intelligence | ✅ Complete | High |
| AI Brand Generation | ✅ Complete | High |
| AI Layout Composition | ✅ Complete | High |
| AI Store Generation (JSON) | ✅ Complete | High |
| Component-library renderer | ✅ Complete | High |
| Scoring for V2 | ⚠️ Gap | High |
| Component library breadth | ⚠️ Thin (7 hero / 6 menu / 1 footer) | High |
| Rollout / V1 deprecation | ❌ Not started (gated off) | High |

---

## 2. Architecture Analysis

### 2.1 Monorepo & stack

- **pnpm monorepo** (`pnpm-workspace.yaml`), root `package.json` name `ordervora-mvp`.
- **`apps/api`** — Express (TypeScript), **Prisma ORM** over **PostgreSQL**. All
  AI/generation logic lives here.
- **`apps/web`** — Next.js **16** (App Router), React **19**, Tailwind CSS **v4**
  (dashboard/admin UI only).
- Deploy targets: Vercel serverless, Docker, Render, Railway. Async work uses
  `@vercel/functions` `waitUntil` (in-process; documented seam for a real queue).

### 2.2 The storefront is rendered by the API, not Next.js

A critical architectural fact: **customer-facing storefronts are server-rendered
HTML strings produced by the API**, not React pages.

- `apps/web/next.config.ts` `rewrites()` proxy `/store/:path*`, `/preview/:path*`,
  `/assets/:path*` straight to the API. There is **deliberately no Next.js store
  page** — the comment states: *"so there is only ever one storefront renderer,
  never a competing one."*
- Store resolution: `apps/api/src/modules/sites/public-render.routes.ts`
  (`siteEdgeMiddleware` resolves Host → subdomain slug / custom `Domain` → `Site`).

### 2.3 The config → component pipeline (the heart of the system)

The config object is **`SiteDefinition`** (`sites/types.ts`, `siteDefinitionSchema`):

```
SiteDefinition
  ├─ schemaVersion (1 = theme-based V1, 2 = theme-free V2)
  ├─ restaurantName, tagline, cuisine, businessType
  ├─ tokens / brandSettings / header / footer / productPresentation / vocabulary
  └─ pages[] → SitePage { slug, title, metaDescription, sections[] }
                 └─ SectionBlock { type, variant?, props{}, hidden? }
```

Deterministic render pipeline (*"same definition + theme version → identical
output"*):

```
SiteDefinition (JSON)
  → renderSitePage / renderAllPages   (render-site.ts — resolves LIVE menu/assets/offers from DB)
    → renderPage                      (render-page.ts — assembles the <!DOCTYPE html> document)
      → renderSections                (layout-engine.ts — loops sections, graceful fallback on unknown type)
        → getSectionRenderer(type)    (registry.ts — the type → render-fn map)
          → render<Component>(section, ctx) → HTML string   (branches on section.variant)
```

Menu content is **always resolved live from the DB at request time**
(`render-site.ts` `resolveLiveMenu`), never baked into the definition.

### 2.4 Why this beats theme/template selection

- **Separation of concerns:** AI owns the *decision* (JSON); the component library
  owns *rendering*. The `heroCompositionSchema` / `productLayoutSchema` enums in
  `v2/contracts.ts` are a **renderer capability inventory** — the AI physically
  **cannot** emit a variant that does not exist. This is the guarantee against a
  fabricated `hero_12`.
- **Determinism + SEO:** the HTML-string renderer yields stable, fast,
  SEO-friendly output (`seo-head.ts`, `json-ld.ts`, `sitemap.ts`).
- **Originality:** briefs are invented per business from its own data, not selected
  from a catalog.

---

## 3. V2 Findings

### 3.1 Data contracts (`v2/contracts.ts`)

| Contract | Purpose | Line |
|---|---|---|
| `businessUnderstandingSchema` | Business Intelligence — identity, price tier, catalog, services, with **evidence per inference** | `contracts.ts:47` |
| `creativeBriefSchema` | One original design direction — colorLogic, typography, shape, voice, photography, hero concept, structure | `contracts.ts:100` |
| `heroCompositionSchema` | Renderer capability enum (7 hero compositions) | `contracts.ts:87` |
| `productLayoutSchema` | Renderer capability enum (6 catalog layouts) | `contracts.ts:98` |
| `storefrontPlanSchema` | Brief resolved against real data → renderable page program + tokens + vocabulary | `contracts.ts:183` |
| `generatedAssetPlanSchema` | Per-storefront imagery program (independent hero, shared product truth) | `contracts.ts:233` |

### 3.2 Orchestration (`v2/generate-v2.ts:43`)

`generateV2()` is a pure, dependency-injected function:

```
buildBusinessUnderstanding()            → Business Intelligence Layer
  → generateCreativeBriefs()  (+ validateDiversity)   → Brand Engine
    → planStorefront()                   → Layout Composer
      → compileDefinition()              → Store Generator → SiteDefinition (schemaVersion 2)
```

It returns 3 independent storefronts (`understanding`, `briefs`, `diversity`,
`assetPlan`, `storefronts[]`) with **no persistence** of its own.

### 3.3 Live service wiring (`generator.ts`)

Contrary to the "no persistence" comment in `generate-v2.ts`, V2 **is fully wired
into the live generation job**:

- `generator.ts:86` — `if (isGenerationV2Enabled(site.restaurantId)) { await this.runV2(...); return; }`
- `runV2()` (`generator.ts:241-271`) runs `generateV2()` and **persists 3
  `SiteVersion` rows** (schemaVersion-2 definitions) inside the same
  `$transaction` + job-stage machinery as V1, reusing `createBrandAssetStore()`
  and the durability/heartbeat pattern.

### 3.4 Rollout gate (`v2/rollout.ts`)

```
GENERATION_V2_ENABLED=true
GENERATION_V2_RESTAURANT_IDS=id1,id2   (empty = no one; "*" = everyone)
```

Rollback = flip the flag; V1 is byte-identical and untouched either way. A
**shadow mode** (`v2/shadow.ts`, `runV2Shadow`) can run understanding → briefs →
diversity alongside V1 and emit structured logs without affecting customers.

---

## 4. Existing Modules (reuse — do not rebuild)

### 4.1 AI infrastructure

| Module | Path | Notes |
|---|---|---|
| Provider abstraction | `lib/ai/index.ts`, `lib/ai/types.ts` | `getAIProvider()` selects OpenAI → Anthropic → Gemini by env key; vendor-neutral `complete()`; multimodal |
| Providers | `lib/ai/providers/{openai,anthropic,gemini}.ts` | Anthropic default `claude-sonnet-5`; OpenAI default `gpt-4o` |
| Image generation | `lib/ai/image/` | Used by branding; flag-gated with safe fallbacks |

**Convention (reused across ~23 files):** each AI feature defines a `*_SHAPE`
prompt constant, calls `complete()`, `JSON.parse`, then validates with **Zod**.
Note: JSON is prompt-requested, **not** native structured output (no OpenAI
`response_format: json_object` / tool schema) — a hardening opportunity.

### 4.2 Catalog extraction

| Module | Path |
|---|---|
| Upload routes (multer) | `imports/import.routes.ts` |
| Service (create/approve/review/rerun) | `imports/import.service.ts` |
| Vision/text extraction + prompts | `imports/vision-extractor.ts` |
| Adapter registry | `imports/adapters/registry.ts` |
| Adapters | `imports/adapters/{pdf,image,csv,website,google-maps,doordash,uber-eats,grubhub}.adapter.ts` |
| Extraction schema | `imports/types.ts` (`extractedMenuDataSchema`) |
| Async job runner | `imports/job-runner.ts` |

Supported inputs today: **Image, PDF, CSV, Website URL, Google Maps, DoorDash,
Uber Eats, Grubhub** (each adapter declares `inputKind` + `implemented`).

### 4.3 Store generation & rendering

| Module | Path |
|---|---|
| Config schema | `sites/types.ts` (`siteDefinitionSchema`, `sectionBlockSchema`) |
| ID → component map | `sites/renderer/registry.ts` |
| Section loop / fallback | `sites/renderer/layout-engine.ts` |
| Page assembler | `sites/renderer/render-page.ts` |
| Live-data resolver | `sites/renderer/render-site.ts` |
| Component library (HTML emitters) | `sites/renderer/components/*.ts` (hero, footer, menu-section, contact, offers, reviews, gallery, chrome, …) |
| Token → CSS | `sites/theme-css.ts`, `theme-carrier.ts` |
| Storefront routing | `sites/public-render.routes.ts` |

### 4.4 Frontend (dashboard)

| Area | Path |
|---|---|
| Import hub + review editor | `apps/web/src/app/dashboard/import/` (`review-editor.tsx`, confidence badges) |
| Generate + variation selection | `apps/web/src/app/dashboard/website/variations/` |
| Customization studio | `apps/web/src/app/dashboard/website/editor/studio/customization-studio.tsx` |
| Section manager | `.../studio/section-manager.tsx` |

### 4.5 Data model

- Tenancy: `Organization → Restaurant (= any business) → Site → SiteVersion`.
- Design persistence is **JSON-first**: `SiteVersion.definition` (schemaVersion 2 =
  theme-free), `Site.brandProfile`, `Site.settings`. **No new tables required** for
  the V2 vision.
- Business types: Prisma enum `BusinessType`
  (`RESTAURANT, COFFEE_SHOP, DELI, VAPE_SHOP, CONVENIENCE_STORE, BAKERY, PIZZA,
  RETAIL, OTHER`). `GROCERY` is listed in CLAUDE.md but **not** in the enum.

---

## 5. Missing Modules / Gaps

| # | Gap | Detail | Impact |
|---|---|---|---|
| 1 | **Rollout** | V2 disabled by default; allowlist empty. No code needed to enable — env + monitoring + widening to `*`. | Blocks adoption |
| 2 | **V2 SCORING** | `runV2` (`generator.ts:241`) **skips** the SCORING stage and creates **no `SiteScore` rows** (V1 does — `generator.ts:163-211`). `dashboard/website/score/` may render empty for V2 stores. | UI gap / missing quality signal |
| 3 | **Component library breadth** | ~7 hero variants, ~6 menu layouts, **1 footer**, product card is settings-driven (no distinct variants). Output diversity is capped by the library, not the AI. | Storefronts risk looking similar |
| 4 | **Google Business URL input** | Adapter exists (`google-maps.adapter.ts`) but must be confirmed `implemented: true` and surfaced as a distinct input option in the import UI. | Vision input not clearly exposed |
| 5 | **V1 deprecation path** | `WEBSITE_THEME` setup step + theme catalog + `Site.themeId` still power production. Must be retired without breaking published schemaVersion-1 stores. | Cleanup / long tail |
| 6 | **Structured-output hardening** | JSON is prompt-requested, not provider-enforced; validation is post-hoc Zod. | Reliability opportunity |

---

## 6. Risks

- **Output sameness (highest product risk).** The architecture is sound, but a thin
  component library (1 footer, few heroes) will make AI-generated stores look alike
  regardless of how good the briefs are. **The library — not the AI — is the
  ceiling.**
- **Two coexisting engines.** V1 (theme catalog) and V2 (theme-free) run in
  parallel; drift or confusion is possible until V1 is retired. The module boundary
  test mitigates cross-contamination.
- **Scoring inconsistency.** V2 stores lack `SiteScore`, so quality dashboards and
  any score-gated flows behave differently for V1 vs V2 stores.
- **In-process job runner.** No external queue yet; heavy concurrent generation
  relies on `waitUntil` + the reaper. Fine for current scale, a known seam.
- **Enum migrations.** Adding business types (e.g. `GROCERY`) requires a Postgres
  enum migration (hard enum, not free text).
- **Published-store compatibility.** Retiring V1 must preserve rendering for stores
  already published on schemaVersion 1.

---

## 7. Recommended Roadmap

**Decisions confirmed with stakeholder:** extend existing V2 · keep the HTML
component library (not React) · light library expansion now (big indexed catalog
later) · deprecate V1 gradually after V2 is proven.

| Phase | Goal | Risk |
|---|---|---|
| **0 — Shadow validation** | Run `runV2Shadow` on test businesses (Pizza/Deli/Vape); inspect understanding + briefs + `diversity.pass`. V1 keeps serving. | None |
| **1 — Close SCORING gap** | Generate `SiteScore` for V2 **or** make the score UI degrade safely when absent. Unit-test `runV2`. | Low |
| **2 — Light library expansion** | Add high-impact variants (2nd footer, distinct product card, maybe +hero/+menu); register + widen the capability enums. | Low |
| **3 — Google Business URL** | Confirm adapter `implemented`; surface as a distinct import option. | Low |
| **4 — Controlled rollout** | `GENERATION_V2_ENABLED=true` + allowlist real pilots → monitor → widen to `*`. Rollback = flip flag. | Medium |
| **5 — Retire V1** | Remove `WEBSITE_THEME` wizard step + theme catalog; keep schemaVersion-1 render compatibility. | Medium |

**Later (deferred by decision):** the large **indexed catalog** (`hero_12`,
`menu_5`, …) — the highest-ROI investment for differentiation once the core is
proven.

---

## 8. Implementation Plan

### 8.1 End-to-end flow (target)

```
1. Owner uploads: image / PDF / website URL / Google Business URL
   → POST /api/imports  (multer + adapter registry)
2. AI extraction: adapter.extract() → JSON (extractedMenuDataSchema) → AWAITING_REVIEW
3. Human review: PATCH /api/imports/:id → POST .../approve
   → create MenuCategory / MenuItem + update businessProfile
4. Store generation: POST /api/sites/:id/generate → GenerationJob → runV2()
     buildUnderstanding → 3× CreativeBrief → 3× StorefrontPlan
       → copy + imagery → 3× SiteDefinition(v2) → persist 3 SiteVersion
5. Selection: owner previews 3 storefronts → selectVariation
6. Publish: Site.status=PUBLISHED, publishedVersionId → deterministic renderer
   → live store via subdomain / custom domain (menu resolved live from DB)
```

### 8.2 Backend work

- **SCORING (Gap 2):** in `runV2` (`generator.ts:241`), either adapt
  `scoreSiteDefinition` for schemaVersion-2 (theme-free) and write `SiteScore`, or
  explicitly document the skip and adjust the UI. No schema change — `SiteScore`
  table exists (`schema.prisma:591`).
- **New library components (Gap 3):** add renderers in
  `sites/renderer/components/`, register in `renderer/registry.ts`, and widen the
  enums in `v2/contracts.ts` (`heroCompositionSchema` / `productLayoutSchema`) **and**
  `types.ts` `ThemeVariants` together so the planner knows they exist.
- **Google Business URL (Gap 4):** confirm `implemented: true` in
  `google-maps.adapter.ts`; ensure `sourceType` handling in
  `import.validation.ts` / `import.routes.ts`.
- **Reuse (no rebuild):** `lib/ai/`, the `*_SHAPE` + Zod convention,
  `job-durability.ts` / `job-reaper.ts`.

### 8.3 Database work

- **No new tables. No large migration.** Everything the vision needs is already
  supported by JSON columns (`SiteVersion.definition` schemaVersion 2,
  `Site.brandProfile`, `Site.settings`).
- Optional: generate `SiteScore` for V2 (existing table); add `GROCERY` to the
  `BusinessType` enum if required (simple enum migration).
- Do **not** drop V1 columns (`Site.themeId`, `Theme` table) until rollout completes.

### 8.4 Frontend work

- Existing screens work with V2 unchanged (import/review, variation selection,
  studio all consume the same `SiteVersion` shape).
- Score card (`dashboard/website/score/`) must handle missing `SiteScore` for V2.
- Surface **Google Business URL** as a distinct input in
  `dashboard/import/import-hub.tsx`.
- Later: remove the `website-theme-step` from the setup wizard.

### 8.5 Verification

- **Shadow logs:** `runV2Shadow` on ≥3 verticals; assert `diversity.pass = true`
  and inferences backed by evidence.
- **Tests:** `pnpm --filter api test` — keep `v2/generate-v2.test.ts`,
  `v2/module-boundary.test.ts`, `v2/briefs/diversity-validator.test.ts` green.
- **Manual E2E:** upload real menu → review → generate with V2 flag on for the test
  ID → confirm 3 `SiteVersion` rows at `schemaVersion: 2` (no `themeKey`) → preview
  → select → publish → open live store.
- **Regression (V1):** businesses outside the allowlist generate V1 byte-identical.

---

## 9. Verdict: does this beat traditional themes?

**Yes — and the codebase already committed to this direction.** JSON-config +
component-library separates *decision* (AI) from *rendering* (governed
components), yielding original per-business designs with a **structural guarantee
against broken output** (the AI can only emit variants that physically exist). The
HTML-string renderer keeps it deterministic and SEO-strong.

**The honest caveat:** the advantage is realized through **library breadth and
quality**, not the architecture (which is done). With one footer and a handful of
heroes, outputs will look similar no matter how strong the AI is. The highest-ROI
future investment is expanding the component library — the indexed catalog
deferred by decision to a later phase.

---

*Generated as an architecture audit. No production code was modified.*
