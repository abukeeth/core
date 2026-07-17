# Setup Wizard Replacement Plan

**Companion to:** `PHASE_01`–`PHASE_03` audits, `ORDERVORA_FUTURE_ROADMAP.md`, `NEXT_30_DAYS_EXECUTION_PLAN.md`
**Date:** 2026-07-17
**Question:** Can the current setup wizard become the target flow — **Choose Source → Import Progress → AI Analysis → Brand Builder → Website Builder → Launch Readiness** — and if so, fix-in-place or rebuild-on-backend?

**Method:** Direct reading of the wizard (`apps/web/src/app/setup/*`), the AI builder (`apps/web/src/app/dashboard/builder/*`), the launch center (`apps/web/src/app/dashboard/launch/*`), and the full web API client (`apps/web/src/lib/api.ts`). Findings are evidence-cited; no code was changed.

---

## 1. Current Wizard — What It Actually Is

The current wizard is a **linear, server-driven state machine**, not a hardcoded client sequence. The single source of truth is `Restaurant.setupStep` (the `SetupStep` enum from Phase 3), and the page renders whichever step the server says the owner is on:

```
setup/page.tsx  →  reads restaurant.setupStep, renders the matching step, persists progress server-side
```

**Current step order** (`wizard-shell.tsx:6-14`, `SetupStep` enum):
```
BUSINESS_TYPE → BUSINESS_INFO → LOCATION → PAYMENT_PROVIDER → MENU_IMPORT → WEBSITE_THEME → DONE
```

| Step | Component | Backend call(s) | Nature |
|---|---|---|---|
| BUSINESS_TYPE | `business-type-step.tsx` | `createRestaurant({businessType})` | Data entry (9 business-type grid) |
| BUSINESS_INFO | `business-info-step.tsx` | `updateRestaurant` + `setSetupStep` | Data entry (name/desc/phone) |
| LOCATION | `location-step.tsx` | `updateRestaurant` + `setSetupStep` | Data entry (address/geo) |
| PAYMENT_PROVIDER | `payment-provider-step.tsx` | `connectPaymentProvider('STRIPE',…)` | Integration + skip |
| MENU_IMPORT | `menu-import-step.tsx` | `createImportJob`, `getImportJob`, `listImportJobs`, `rerunImportJob` + `ReviewEditor`/`ProgressCard` | **Real AI import w/ polling, resume, review, retry** |
| WEBSITE_THEME | `website-theme-step.tsx` | `createSite`, `startGeneration` → redirect `/dashboard/builder` | Kickoff + handoff |
| DONE | `finish-step.tsx` | redirect `/dashboard/launch` | Handoff |

**Two architecturally important facts:**
1. **The wizard already hands off to the AI Builder and the Launch Center.** `website-theme-step.tsx` calls `createSite()` + `startGeneration()` then `router.push("/dashboard/builder")`; `finish-step.tsx` redirects to `/dashboard/launch`. The target flow's last three stages (AI Analysis, Brand Builder, Website Builder → and Launch Readiness) **already exist as destinations the wizard routes into** — they are just in `/dashboard/builder` and `/dashboard/launch`, not inside `/setup`.
2. **The heavy, correctness-critical step (MENU_IMPORT) is already a robust real-backend flow** — polling, resumability across refreshes, awaiting-review with an inline `ReviewEditor`, failure/retry, and a "taking longer than expected" escape hatch (`menu-import-step.tsx:34-274`). It is explicitly built to never advance until a real `ImportJob` reaches APPROVED with ≥1 saved product.

---

## 2. Target Flow vs. Current Flow — Structural Mapping

Target: **Choose Source → Import Progress → AI Analysis → Brand Builder → Website Builder → Launch Readiness**

| Target stage | Exists today? | Where | Gap |
|---|---|---|---|
| **Choose Source** | **Partial** | `menu-import-step.tsx` picker (file only: PDF/IMAGE) | Backend supports 8 sources (`ImportSourceType`: PDF/IMAGE/CSV/WEBSITE/GOOGLE_MAPS/DOORDASH/UBER_EATS/GRUBHUB); the wizard UI only offers file upload. Source *chooser* UI is the gap, not the backend. |
| **Import Progress** | **Yes** | `menu-import-step.tsx` + `ProgressCard` | Fully built: poll, resume, retry. Reusable as-is. |
| **AI Analysis** | **Yes (backend + builder UI)** | `GenerationStage.BRAND_ANALYSIS`; `build-steps.ts` "Business Analysis & Brand Discovery" | Runs inside the builder pipeline, not surfaced as its own wizard stage. |
| **Brand Builder** | **Partial** | Brand is generated (`brandProfile`, `SiteBrandProfile`, `BrandSettings` types) and editable in the site editor; `BRAND_ANALYSIS` stage produces it | No standalone "Brand Builder" step/route; brand is embedded in generation + editor. Phase 3 §7.7 flagged brand is trapped in `Site`. |
| **Website Builder** | **Yes** | `/dashboard/builder` (`builder-experience.tsx`, `live-build-screen.tsx`, variations, `selectVariation`, `patchDraft`, `approvePreview`) | Fully built, strong. Reusable. |
| **Launch Readiness** | **Yes** | `/dashboard/launch` (`launch-center.tsx`) + `checkPublishReadiness`, `publishSite`, `test-order-flow.tsx` | Fully built. Reusable. |

**Conclusion of the mapping:** the target flow is **~80% already implemented in the backend and in existing frontend surfaces** — it is largely a **re-sequencing and re-framing** problem (pull the builder/launch stages under one narrative, add a real source-chooser, promote brand to its own visible step), **not** a from-scratch build.

---

## 3. Can the Current Wizard Be Transformed Into This Flow? — **Yes.**

The transformation is *aligned with*, not against, the current architecture:

- The wizard is **already a data-driven state machine** — changing the flow is primarily editing the **step list** (`SetupStep` enum + `wizard-shell.tsx` `STEP_ORDER`/`STEP_LABELS` + the `switch` in `setup/page.tsx:93-103`), not rewriting an engine.
- The target's back half (**AI Analysis / Website Builder / Launch Readiness**) already exists and is already the wizard's handoff target — transformation means **absorbing** those surfaces into the wizard narrative (or linking them as stages) rather than building them.
- The target's front half (**Choose Source / Import Progress**) maps onto the existing, robust import step — transformation means **widening the source chooser** to expose the sources the backend already accepts.

The **only genuinely new UI surface** is a first-class **Brand Builder** stage, and even that is generating data that already exists (`brandProfile`) — it needs a *screen*, not a new subsystem.

**What changes conceptually:** today's wizard front-loads **manual data entry** (business type, info, location, payment) *before* the exciting AI part. The target flow front-loads **Choose Source → Import** and treats business/brand identity as **AI-derived** from the import + analysis. So the transformation also **demotes** the four manual data-entry steps from "gates you must pass" to "confirm/skip" details — this is the real product shift, and it is a **sequencing + emphasis** change the state machine supports directly.

---

## 4. Which Parts Can Be Reused

**Reused as-is (high value, keep verbatim or near-verbatim):**
- **The wizard shell & state-machine harness** — `setup/page.tsx` load/resume/error logic (the 404-vs-transient handling at `page.tsx:29-58` is hard-won correctness) and `wizard-shell.tsx` (progress bar, layout, shared button/input classes).
- **`menu-import-step.tsx` in full** — the single most valuable component; it *is* "Import Progress" and most of "Choose Source." Polling, resume, review, retry, slow-job escape hatch all done.
- **`ReviewEditor`** (`dashboard/import/[id]/review-editor`) and **`ProgressCard`** (`dashboard/import/import-hub`) — already shared between the wizard and the dashboard.
- **The entire AI Builder** — `dashboard/builder/*` (`builder-experience.tsx`, `live-build-screen.tsx`, `build-steps.ts` which is already keyed to real `GenerationStage` order, variation select/regenerate, `patchDraft`, `approvePreview`). This is "AI Analysis + Website Builder."
- **The entire Launch Center** — `dashboard/launch/*` (`launch-center.tsx`, `test-order-flow.tsx`, `checkPublishReadiness`, `publishSite`). This is "Launch Readiness."
- **All backing APIs** (see §5) — no client rewrite needed for import, sites, generation, publish, launch.

**Reused with light re-framing:**
- **Business type / info / location** steps — kept but **demoted** to optional confirmation (or auto-filled from import/analysis where the source provides it, e.g. Google Maps / website adapters already extract business info). Their components stay; their *position and requiredness* change.
- **Payment provider step** — kept but **moved to Launch Readiness** (payment is a launch prerequisite, not a pre-import gate), matching how `checkPublishReadiness`/launch already treats go-live prerequisites.

## 5. Which Parts Should Be Deleted

Very little is truly deletable — the audit's recurring theme (Phase 2/3: almost nothing is REMOVE). Specifically:

- **Nothing in the backend.** No API should be deleted.
- **Delete/retire only after the new flow ships:** the **hard requirement that the four manual steps precede import**. That's a sequencing rule in `SetupStep`/`STEP_ORDER`, not a file — "deleting" it means reordering the enum and removing the early-gate positioning.
- **`finish-step.tsx`'s pure redirect** can be absorbed into the Launch Readiness stage (a trivial removal).
- **Candidate for consolidation, not deletion:** the **two website flows** — `/dashboard/website/*` (manual Hub) vs `/dashboard/builder/*` (AI Builder) — already flagged in Phase 2 §2.10 and the roadmap. The target flow should route through **one** (the builder). The manual Hub isn't deleted, but the wizard should stop being ambiguous about which it uses.

**Net:** this is a **reorganize-and-extend**, not a demolition. No component file must be deleted to reach the target; the deletions are of *ordering constraints* and *redundant handoffs*.

## 6. APIs — Already Usable vs. Blocking

### 6.1 Already usable (the target flow can be built on these today)

| Target stage | Ready APIs (`apps/web/src/lib/api.ts`) |
|---|---|
| Choose Source | `createImportJob(sourceType, {file \| url})` — already accepts all 8 `ImportSourceType`s (`api.ts:666`); `createRestaurant`, `updateRestaurant` |
| Import Progress | `getImportJob`, `listImportJobs`, `rerunImportJob`, `approveImportJob`, `rejectImportJob`, `updateImportJobData` (`api.ts:702-722`) |
| AI Analysis | `createSite`, `startGeneration`, `getGenerationStatus` (`api.ts:996-1012`) — drives the `BRAND_ANALYSIS`/generation stages |
| Brand Builder | `getMySite`, `patchDraft` (brand fields live in the site definition), `uploadSiteAsset` (LOGO/OG/FAVICON), `listSiteVersions`/`getSiteVersion` |
| Website Builder | `listVariations`, `selectVariation`, `regenerateVariations`, `patchDraft`, `renderDraftPreview`, `approvePreview`, `getLatestScore`/`runScore`/`applySuggestion` (`api.ts:1016-1126`) |
| Launch Readiness | `checkPublishReadiness`, `publishSite`, `listReleases`, `rollbackSite`, `getPreviewToken`, `connectPaymentProvider`, `listDomains`/`addDomain`/`verifyDomain`/`setPrimaryDomain` (`api.ts:1144-1194`) |

**The backend is not the bottleneck.** Every target stage has working, tested endpoints already consumed elsewhere in the app.

### 6.2 Blocking / partially-blocking the redesign

These are **gaps to fill**, not broken APIs — none requires a backend rewrite:

1. **No dedicated Brand endpoint.** Brand data is embedded in the `Site` definition (`brandProfile`, edited via `patchDraft`) — there is **no `generateBrandConcepts` / `getBrand` / `updateBrand`** endpoint (grep for brand functions returns none). A first-class "Brand Builder" stage works today only by editing the site draft. **Blocking for a *standalone* Brand Builder step; non-blocking if brand stays a builder sub-stage.** (This is exactly the roadmap's "promote Brand to first-class" item, 90-day.)
2. **Source chooser is file-only in the UI.** The backend accepts URL-based sources (WEBSITE/GOOGLE_MAPS/DOORDASH/UBER_EATS/GRUBHUB) but `menu-import-step.tsx:120` only sends PDF/IMAGE from a file input. **Non-blocking backend-wise** — needs a richer chooser UI passing `sourceUrl`.
3. **AI Analysis is not independently addressable.** It runs *inside* `startGeneration` as `GenerationStage.BRAND_ANALYSIS`; there is no endpoint to run analysis *before* committing to site generation. Surfacing "AI Analysis" as its own stage means either splitting the generation pipeline or presenting the existing stage as a distinct screen (the builder already renders per-stage captions via `build-steps.ts`). **Partially blocking** only if analysis must be a standalone, pre-generation step.
4. **Payment/website coupling to `setupStep`.** The wizard advances via `setSetupStep(...)` with a fixed enum order. Re-sequencing requires either **adding enum values** (a Phase-3-style additive migration) or decoupling the frontend flow from `SetupStep` and tracking wizard position client-side/in a new field. **Mildly blocking** — it's an additive schema/enum change, low risk, but it is the one DB touch.

**Summary:** one real backend gap (standalone Brand), two UI-only gaps (source chooser, analysis-as-a-stage), one additive schema change (re-sequence `SetupStep`). Nothing blocks starting.

## 7. Estimates

Effort in engineer-days (ed); 1 mid/senior FE engineer + occasional BE help. Assumes the existing builder/launch/import surfaces are reused.

### Option A — **Fix / re-sequence the current wizard**
*Reorder the existing state machine, widen the source chooser, demote manual steps, absorb builder+launch as linked stages, keep brand inside the builder.*

| Work | Effort |
|---|---|
| Re-order `SetupStep` (additive enum values) + migration + `STEP_ORDER`/labels | S (1.5ed) |
| Rework `setup/page.tsx` switch + demote business/info/location/payment to confirm/skip & move payment to launch | M (2.5ed) |
| Source-chooser UI (expose URL sources; reuse import step) | M (2ed) |
| Frame AI Analysis + Website Builder as in-wizard stages (link/embed existing `/dashboard/builder`) | M (3ed) |
| Surface Launch Readiness as final stage (link/embed `/dashboard/launch`) | S (1.5ed) |
| Brand shown as a builder sub-step (no new backend) | S (1ed) |
| Tests + wizard resume/parity | M (2.5ed) |
| **Total** | **~14ed (≈3 weeks)** |

### Option B — **Rebuild the wizard UI on top of the existing backend**
*New `/onboarding` flow purpose-built for the six target stages, reusing every existing API + the import/builder/launch components, plus a first-class Brand Builder.*

| Work | Effort |
|---|---|
| New onboarding shell + client-side stage machine (decoupled from `SetupStep`) | M (3ed) |
| Choose Source (full multi-source chooser) | M (2.5ed) |
| Import Progress (reuse `menu-import-step` internals) | S (1.5ed) |
| AI Analysis as a distinct stage (present `BRAND_ANALYSIS` output; may need a BE split) | M (3ed) + BE 2ed |
| **Brand Builder — first-class** (new `Brand` endpoints + UI; the roadmap 90-day item) | L (5ed) + BE 4ed |
| Website Builder stage (reuse `/dashboard/builder`) | S (1.5ed) |
| Launch Readiness stage (reuse `/dashboard/launch` + payment) | M (2ed) |
| Full test suite + resume + migration off old wizard | L (4ed) |
| **Total** | **~24ed FE + ~6ed BE ≈ 30ed (≈6 weeks)** |

## 8. Which Option Reaches Production Faster?

**Option A (fix/re-sequence) reaches production faster — roughly half the time (~3 weeks vs ~6 weeks).**

Why A is faster and lower-risk:
- It **reuses the wizard's hardest-won correctness** (the 404-vs-transient load logic, import resumability, the anti-race handoff in `website-theme-step.tsx:24-40`) instead of re-deriving it.
- It requires **zero backend rewrites** and only **one additive migration** (re-sequence `SetupStep`).
- The back half of the target flow (AI Analysis / Website Builder / Launch Readiness) is **already the wizard's destination** — A *links* to proven surfaces; B risks re-implementing them.
- A keeps a **single state-machine source of truth** (`setupStep`) rather than introducing a parallel onboarding-state model.

Why B is slower: its extra cost is almost entirely the **first-class Brand Builder** (new endpoints + UI, ~9ed combined) and re-building a stage machine that already works. B only *pulls ahead in value* once Brand-as-first-class is a committed goal — which the roadmap schedules at **90 days**, not now.

## 9. Final Recommendation

**Recommendation: Option A now, evolve toward B's Brand Builder later — a phased path, not a rebuild.**

1. **Ship Option A (re-sequence in place) as the 30–day onboarding upgrade.** Transform the existing state machine into **Choose Source → Import Progress → AI Analysis → (brand as a builder sub-stage) → Website Builder → Launch Readiness** by reordering `SetupStep`, widening the source chooser, demoting manual data entry to confirm/skip, moving payment into Launch Readiness, and linking the already-built builder and launch surfaces as the flow's back half. **~14ed, ~3 weeks, one additive migration, zero backend rewrites.** This delivers the target *experience* fastest and keeps all proven correctness.

2. **Then promote Brand to a first-class stage when the roadmap's 90-day "Brand Builder" backend lands** (`Brand` table + `getBrand`/`updateBrand`/`generateBrandConcepts` endpoints, per `ORDERVORA_FUTURE_ROADMAP.md` §4). At that point, swap the interim "brand-inside-builder" sub-step for a dedicated Brand Builder stage — an **incremental upgrade of the Option A flow**, not a second rebuild.

This sequencing means the user sees the full six-stage target flow in ~3 weeks, and the one genuinely-new capability (first-class Brand) arrives on the same schedule the roadmap already committed to — without ever throwing away the working wizard, import pipeline, AI builder, or launch center.

**Do NOT do a ground-up rebuild of the wizard.** The evidence (a data-driven state machine, a robust import step, an existing AI builder and launch center already wired as handoff targets, and a complete, working API surface) shows the target flow is reachable by **re-sequencing and extending** — consistent with every prior phase's KEEP/EXTEND verdict.

---

*Analysis derived from direct reading of the setup, builder, launch, and API-client sources. No code was modified; this is a planning document.*
