# AI Business Builder — Product Gap Analysis

**Companion to:** `PHASE_01`–`PHASE_03` audits, `SETUP_WIZARD_REPLACEMENT_PLAN.md`, `ORDERVORA_FUTURE_ROADMAP.md`
**Date:** 2026-07-17
**Lens:** Product experience and business outcome — **not** technical architecture. The question is not "is the code clean?" but "does the owner get to choose, see, and approve their business's website before it goes live to real customers?"

**Evidence base (read end-to-end):** `apps/web/src/app/dashboard/builder/*` (`builder-experience.tsx`, `use-restaurant-builder.ts`, `live-build-screen.tsx`, `website-mockup.tsx`, `finale-reveal.tsx`, `build-steps.ts`) and the backing publish engine (`apps/api/src/modules/sites/site.service.ts`, `generation.service.ts`).

---

## The One-Sentence Finding

**The AI Business Builder auto-selects a design the owner never sees, tries to auto-publish it to the public internet without ever asking for approval, and — because the publishing engine correctly refuses to publish anything a human hasn't approved — the "happy path" cannot actually complete.** The owner gets confetti and a "you're live" screen, or a "couldn't publish" retry loop, but in neither case do they get to *choose and approve their own storefront*.

---

## 1. Does the user receive a real website preview? — **No (not before it matters).**

There are two "previews," and the timing is the whole problem:

- **During the build:** `website-mockup.tsx` shows a **schematic skeleton** — grey blocks that "solidify" as backend stages complete, tinted with the winning design's color once known. Its own doc comment is honest about this: *"a schematic 'your website is assembling itself' preview … an honest structural reveal, not fabricated content."* It is **not the owner's actual website** — it's an animated placeholder of rectangles.
- **At the very end:** `finale-reveal.tsx` renders a **real** `DevicePreview` of the published version (`finale-reveal.tsx:125`). This is genuine output — but it appears on the **"YOU'RE LIVE"** screen, i.e. **after the site is already public**.

**Business outcome:** the first time the owner sees their real website, it is **already live to customers**. There is no "here's your site — take a look before we publish" moment. The preview exists; it arrives one step too late to be a preview.

## 2. Can the user compare multiple generated designs? — **No.**

The backend generates **three** design variations (`build-steps.ts` ASSEMBLY: *"Assembling three complete designs…"*), and a real comparison surface exists elsewhere (`/dashboard/website/variations`, with a working `selectVariation` API). But the AI Business Builder **never shows them**. In `use-restaurant-builder.ts:runFinishSequence`, the code **auto-picks the highest-scoring variation** (`variations.reduce(... candidateScore > currentScore ...)`, lines 115-132) and immediately selects it.

The three designs *are* surfaced to the UI as `candidates` with a `winnerId` — but the type's own comment says what that's for: *"A candidate design considered during the auto-select moment — just enough to **dramatize the choice**, not the full definition"* (`use-restaurant-builder.ts:35`). The owner watches an animation of a choice **being made for them**. They do not make it.

**Business outcome:** the core value proposition of an "AI *Builder*" — *you* pick the look of *your* business — is replaced by a machine picking on a hidden score the owner never sees or influences.

## 3. Can the user approve a design? — **No.**

`runFinishSequence` goes `selectVariation → publishSite → provision QR → done` with **zero user interaction** in between (`use-restaurant-builder.ts:106-160`). There is **no approval button, no "looks good, publish it" gate**. The builder **never calls `approvePreview`** (verified: `approvePreview` appears nowhere in `dashboard/builder/` or `setup/`).

## 4. Can the user reject a design? — **No.**

There is no "I don't like this" path in the builder. The only escape is a **failure-recovery retry** (`retryGeneration` → `regenerateVariations`), which only appears if generation *errors*. A successfully-generated design the owner simply dislikes has **no reject affordance** — by the time they'd want to reject it, it's published.

## 5. Can the user regenerate a design? — **Only on failure, not by choice.**

`regenerateVariations` exists and works, but in the builder it is wired **exclusively to error recovery** (`retryGeneration`, shown only in the `generation_failed` phase, `builder-experience.tsx:62`). There is no "make me different options" button offered on a *successful* result, because the successful result is never paused for the owner to react to.

## 6. Can the user edit branding before publishing? — **No.**

The builder pipeline runs `BRAND_ANALYSIS` (colors, personality — real work), then proceeds straight through assembly, auto-select, and auto-publish. There is **no brand-editing step** anywhere in the flow. Brand editing *is* possible — but only **afterward**, in the separate `/dashboard/website` editor (`patchDraft`), i.e. **after the un-edited brand is already live**. The owner cannot adjust their colors, logo, tagline, or copy *before* customers see them.

## 7. Why does the system require design approval while no approval workflow exists? — **The two halves were built to contradictory specifications, and the contradiction is fatal.**

This is the heart of the problem, and it is not a philosophical tension — it is a **deterministic failure**:

- **The publishing engine (built correctly) hard-requires human approval.** `validatePublishReadiness` (`site.service.ts:294-345`) refuses to publish unless `site.previewApprovedAt` is set: *"a design being selected … is not the same as the owner having actually looked at the full preview and approved it. This is the PREVIEW_APPROVED gate: publishing is refused until approvePreview() has been called."* If unapproved, it adds a `PREVIEW_APPROVAL` issue, and `publishSite` **throws `PrePublishCheckFailedError`** when any issue exists (`site.service.ts:378-383`).
- **Selecting a design explicitly clears approval.** `selectVariation` sets `previewApprovedAt: null` (`generation.service.ts:57`) — by design, because picking a (possibly different) design invalidates any prior approval.
- **The AI Builder does select, then immediately publish — but never approves.** `runFinishSequence`: `selectVariation(...)` (clears approval) → `publishSite(...)` (requires approval) → **throws**.

**The result:** the AI Business Builder's success path **cannot complete as written**. Every run that reaches the publish step hits `PrePublishCheckFailedError` ("Open the full preview and approve it before publishing"), drops into `finish_failed` at the PUBLISHING step (`use-restaurant-builder.ts:143-147`), and offers a **retry that re-runs the identical sequence and fails identically**. (Additional gates compound this: publish is *also* refused if the menu is empty — `MENU` issue, `site.service.ts:324-327` — which is exactly the state of any owner who skipped menu import in the wizard.)

**Why this happened (product reading):** one team built an *auto-magic, zero-click "watch your business build itself"* experience; another built a *responsible publishing engine that won't put an unreviewed site on the public internet*. Both are individually reasonable. Wired together, the builder is trying to skip the very gate the engine exists to enforce. The "design approval experience" is required by the backend and **entirely absent** from the frontend — so the feature is stuck between a demo that can't ship and a safeguard doing its job.

## 8. Fake placeholders vs. real generated output

| Element | Real or Fake? | Notes |
|---|---|---|
| Menu import → catalog | **Real** | Genuine AI extraction (from the wizard). |
| Generation job + stages | **Real** | `GenerationJob` runs real `BRAND_ANALYSIS`/`CONTENT_GENERATION`/`ASSEMBLY` work; polled, not timered. |
| Three design variations | **Real (generated) but hidden** | Actually produced by the backend; never shown for comparison. |
| Design scoring | **Real** | `SiteScore` drives the auto-pick — but the score is invisible to the owner. |
| **`WebsiteMockup` build animation** | **Placeholder** | Schematic grey/color blocks, not the real site. Honest, but not a preview. |
| **The "candidates / winner" comparison moment** | **Theater** | Real IDs, but presented only to *"dramatize the choice"* the owner doesn't make. |
| **The auto-select "choice"** | **Fake as a user experience** | A decision is animated as if chosen; it's a `reduce()` over hidden scores. |
| `DevicePreview` on the finale | **Real** | Genuine rendered published site — shown only after going live. |
| QR code / order link | **Real** | Real `qrToken`, real orderable link. |
| **Confetti + "you launched a real business" finale** | **Real celebration wrapping an un-approved auto-publish** | Celebrates an outcome (you chose and launched this) that **did not happen as a user action** — and often can't complete at all (Q7). |

**Summary:** the *engine* is largely real; the *experience of choosing and approving* is the fabricated part. The builder dramatizes decisions the owner never gets to make, then hits a wall trying to skip the approval the backend requires.

---

## What Is Missing to Reach a Production-Ready AI Business Builder

Framed as owner outcomes, in the order the owner experiences them:

1. **A real "Here are your designs" comparison screen.** Show the 3 generated variations as real, viewable previews (the `DevicePreview`/variations surface already exists) — side by side, with the score as a *hint*, not a hidden verdict. Let the owner pick.
2. **A real full-site preview before publish.** Let the owner open the chosen design as it will actually appear (real render, real content, mobile + desktop) — the thing `DevicePreview` already does, moved *before* go-live.
3. **An explicit Approve action** that calls the `approvePreview` the engine is waiting for — turning the existing `PREVIEW_APPROVAL` gate from a fatal contradiction into the intended, satisfiable step.
4. **A Reject / "show me other options" action** on a *successful* result (wire the already-working `regenerateVariations` to a real button, not just error recovery).
5. **A brand-edit step before publish** — adjust colors, logo, tagline, hero copy on the chosen design before customers see it (the `patchDraft` and asset-upload APIs already exist; they just run post-live today).
6. **A publish that only fires after approval** — and readiness messaging that *guides* (menu empty? assets missing?) instead of a dead-end "couldn't publish" retry loop.
7. **Honest finale framing** — celebrate what actually happened ("your site is ready — publish when you're happy"), not "you launched a business" over an unreviewed auto-publish.

## What Should Be Removed

- **The auto-select of a "winning" design.** Remove the hidden `reduce()`-by-score pick (`use-restaurant-builder.ts:115-132) as the *decision* — keep the score as a displayed hint only. The owner decides.
- **The auto-publish in `runFinishSequence`.** Remove the `selectVariation → publishSite` auto-chain (lines 132-147). It is the exact step that contradicts the approval gate and cannot succeed.
- **The "dramatize the choice" candidate animation** as a *substitute* for choosing. Remove the theater; replace it with a real chooser (or, if kept, make it a transition *into* the real comparison, not instead of it).
- **The premature "you're live / you launched a business" celebration.** Remove it from the pre-approval position; move any celebration to *after* a real, owner-initiated publish.

Note: nothing here means deleting the *backend* — the generation, scoring, variations, approval gate, and publish engine are all real and correct. What's removed is the **frontend's attempt to bypass the owner and the approval gate**.

## What Should Be Rebuilt

**The middle of the flow — from "designs generated" to "published" — must be rebuilt from an auto-pilot into a decision experience.** Concretely, `use-restaurant-builder.ts`'s `runFinishSequence` (the auto-select → auto-publish core) is rebuilt into a **stateful review flow**: `generated → COMPARE(3 real previews) → CHOOSE → EDIT BRAND (optional) → FULL PREVIEW → APPROVE → PUBLISH → celebrate`. This reuses every existing backend endpoint (`listVariations`, `selectVariation`, `patchDraft`, `renderDraftPreview`, `approvePreview`, `checkPublishReadiness`, `publishSite`) — it is a **frontend experience rebuild on a working backend**, consistent with the whole audit's KEEP-the-backend theme. The build-animation and finale components can be **reused**; only the auto-pilot orchestration between them is replaced.

## What Should Be Implemented First

**First, and by itself shippable: insert the Approve gate — turn the current broken auto-publish into `preview → approve → publish`.**

Why this first:
- It **fixes the deterministic failure** (Q7). Today the happy path throws `PrePublishCheckFailedError` and loops. Adding a real preview + an Approve button that calls `approvePreview` before `publishSite` makes the flow **actually complete** — the single highest-impact fix.
- It **stops publishing unreviewed sites to real customers** — the most serious business/brand risk in the current build.
- It is **small and uses only existing APIs** — surface the real `DevicePreview` before publish, add an "Approve & publish" button that calls `approvePreview` then `publishSite`. No backend change.

**Then, second:** the real **multi-design comparison + choose** screen (deliver the actual "AI Builder" promise). **Third:** the **brand-edit-before-publish** step. **Fourth:** wire **regenerate/reject** as first-class choices. This order fixes *correctness and trust* before *richness* — the owner can safely launch a site they approved (step 1), then gets to genuinely choose and shape it (steps 2-4).

---

## Bottom Line

The AI Business Builder is not failing because of its progress UI — that part is real and well-built. It is failing because it was designed to **launch a business *for* the owner** while the platform was correctly designed to **never publish a site the owner hasn't approved**. The owner never receives the one thing an AI *Builder* must provide: **a real design they can see, compare, shape, and approve before it becomes their public business.** Implement the approval gate first (it also unbreaks the flow), then give the owner the choice the current experience only pretends to offer.

---

*Analysis derived from direct reading of the builder frontend and the publish engine. No code was modified; this is a product planning document.*
