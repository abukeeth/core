# AI Builder — Design Approval & Publishing Fix (Implementation)

**Companion to:** `AI_BUSINESS_BUILDER_GAP_ANALYSIS.md`
**Date:** 2026-07-17
**Branch:** `claude/ai-builder-approval-fix-cqjtdb`
**Scope (as instructed):** repair *only* the broken design-approval / publishing happy path. **No** full compare-three-designs experience, **no** brand editing, **no** regeneration-by-choice, **no** tenancy or wizard changes, **no** new integrations, **no** backend/schema changes.

---

## 1. Root Cause

The AI Builder auto-selected a design and then **auto-published it**, but the publishing engine (correctly) refuses to publish anything a human hasn't approved — and the builder never approved. The result was a **deterministic failure**, not just a missing screen:

- `validatePublishReadiness` (`apps/api/src/modules/sites/site.service.ts:294-345`) adds a `PREVIEW_APPROVAL` issue whenever `site.previewApprovedAt` is null, and `publishSite` **throws `PrePublishCheckFailedError`** if any issue exists (`site.service.ts:378-383`).
- `selectVariation` **explicitly clears** approval: `previewApprovedAt: null` (`apps/api/src/modules/sites/generation.service.ts:57`).
- The old `use-restaurant-builder.ts` finish sequence ran `selectVariation → publishSite` and **never called `approvePreview`** — so publish always threw, dropping the owner into a "couldn't publish" retry loop that re-ran the identical failing sequence.

Additionally, the owner's first sight of the real design was the post-publish "YOU'RE LIVE" finale (confetti fired before the backend had confirmed anything approvable), and the only "preview" before that was `website-mockup.tsx` — a schematic skeleton, not the real site.

**The fix:** stop auto-publishing; insert a real preview + explicit approval gate that calls the `approvePreview` the engine is waiting for; publish (and celebrate) only after the backend confirms. **No backend contract needed to change** — the frontend was misusing a correct backend.

---

## 2. Files Changed

| File | Change |
|---|---|
| `apps/web/src/app/dashboard/builder/use-restaurant-builder.ts` | **Rewritten.** Removed the auto-publish finish sequence. Generation → auto-*select* a previewable draft → **stop at `review`**. Added owner-initiated `approveDesign` (calls `approvePreview` → then `publishSite` → then QR → `done`). Split into stage-scoped retries. New phases; `winnerId`→`selectedVersionId`. |
| `apps/web/src/app/dashboard/builder/design-review-screen.tsx` | **New.** The approval gate: renders the **real** `DevicePreview` iframe + a primary **"Approve this design"** action and a secondary **"Choose another design"** (safe link to `/dashboard/website/variations`, never auto-publishes). Renders all explicit states (loading/unavailable/approving/approve-failed/publishing/publish-failed) with stage-scoped retry buttons. No confetti / "you're live" copy. |
| `apps/web/src/app/dashboard/builder/builder-experience.tsx` | **Updated.** Maps the new phases: generating→`LiveBuildScreen`; selecting→brief build screen; review/approving/publishing/failures→`DesignReviewScreen`; `done`→`FinaleReveal` (only after confirmed publish, behind the reveal beat). |
| `apps/web/src/app/dashboard/builder/use-restaurant-builder.test.ts` | **Rewritten** to prove the required guarantees (see §4). |
| `apps/web/src/app/dashboard/builder/builder-experience.test.tsx` | **Updated** for the new phases/state shape; asserts the review gate renders and no finale appears before `done`. |

**Deliberately unchanged:** `website-mockup.tsx` (kept only as the honest *generation* animation — it is no longer treated as the preview, since `DevicePreview` now is), `finale-reveal.tsx` (its confetti is now correctly reachable only via `done`), `live-build-screen.tsx`, and **all backend files** (`site.service.ts`, `generation.service.ts`) — verified, not modified.

---

## 3. New State Flow

```
loading
  └─ bootstrap: reuse/create site, read generation status
generating ──(poll: COMPLETED)──► selecting ──► review        ◄── STOPS here; nothing published
   │  (poll: FAILED)                  │(list/select fails)      owner sees REAL DevicePreview
   ▼                                  ▼                         + "Approve this design"
generation_failed                 select_failed                + "Choose another design" (safe)
   │ retryGeneration                  │ retrySelect
   └─ regenerate                      └─ re-select only

review ──(owner clicks Approve)──► approving ──(approvePreview ok)──► publishing ──(publishSite ok)──► [QR, non-fatal] ──► done ──► FinaleReveal 🎉
                                       │ approvePreview fails            │ publishSite fails
                                       ▼                                 ▼
                                   approve_failed                    publish_failed
                                       │ retryApprove                    │ retryPublish
                                       └─ approve → publish              └─ publish ONLY (approval persists; no regen)
```

Guarantees encoded by the machine:
- **Publish is never reachable without a prior successful `approvePreview`** (only `runApproveThenPublish` calls `runPublish`, and only after `approvePreview` resolves).
- **`done` (and thus confetti) is reachable only after `publishSite` resolves.**
- **Retries are stage-scoped:** `retryPublish` re-runs publish alone (safe — a failed publish leaves `previewApprovedAt` set, since `publishSite` clears it only inside its own successful transaction); `retryApprove` re-runs approve→publish; `retrySelect` re-runs selection; **none** call `regenerateVariations`/`startGeneration`. `retryGeneration` (regeneration) is offered only on a *generation* failure.
- **Resume-safe:** reloading a site whose generation is `COMPLETED` resumes to the **review gate**, not a silent auto-publish.

---

## 4. Tests Added / Updated

`use-restaurant-builder.test.ts` proves each required guarantee (test names map 1:1):

1. **Never publishes before approval** — at the `review` gate, `publishSite` is asserted not called; and "auto-selects…STOPS at review" asserts neither `approvePreview` nor `publishSite` nor `createTable` is called without an owner action.
2. **Approve before publish** — a `callOrder` array asserts `["approve", "publish"]`.
3. **Publish only after approve succeeds** — same ordered test; publish runs only after `approvePreview` resolves.
4. **Approval failure does not publish** — `approvePreview` rejects → phase `approve_failed`, `publishSite` and `createTable` asserted **not** called.
5. **Publish failure is recoverable** — `publishSite` rejects (e.g. the `PREVIEW_APPROVAL`/readiness message) → phase `publish_failed`, `publishedVersionId` stays null, no finale.
6. **Retry does not regenerate** — `retryPublish` retries publish only (approve called once, `regenerateVariations`/`startGeneration` not called); `retryApprove` and `retrySelect` likewise never regenerate.
7. **Success only after confirmed publish** — `done` + `publishedVersionId` set only after `publishSite` resolves, then QR provisioned.

Plus: QR-failure-is-non-fatal, select-failure recovery, and preserved bootstrap/generation/resume tests.

`builder-experience.test.tsx` additionally asserts the `review`/`approving`/`publishing`/`*_failed` phases render the review gate (not a finale), and that the finale appears only after the `done` reveal beat.

---

## 5. Commands Run (with results)

All run in `apps/web` after `pnpm install --frozen-lockfile` at the repo root:

| Command | Result |
|---|---|
| `pnpm exec vitest run src/app/dashboard/builder` | **5 files, 45 tests passed** |
| `pnpm exec vitest run` (full web suite) | **41 files, 257 tests passed** |
| `pnpm run typecheck` (`tsc --noEmit`) | **exit 0** |
| `pnpm run lint` (`eslint`) | **exit 0** (2 pre-existing `<img>` warnings in `app/page.tsx`, unrelated) |
| `API_URL=… pnpm run build` (`next build`) | **exit 0** — all routes compiled |

---

## 6. Remaining Limitations (explicitly out of scope for this task)

1. **No true compare-three-designs experience.** A design is still auto-*selected* (highest score) so a previewable draft exists; the owner reviews/approves that one. The "Choose another design" action routes to the existing `/dashboard/website/variations` surface rather than an in-builder comparison. Building the in-builder 3-up comparison is the next phase.
2. **No brand editing before publish.** The owner approves or routes away; adjusting colors/logo/copy pre-publish is not yet in this flow (exists post-publish in the Website editor).
3. **No regenerate-by-choice.** Regeneration remains a *failure-recovery* action only; a "make me different options" button on a successful result is deferred.
4. **Other publish-readiness gates still apply.** `validatePublishReadiness` also requires a business name, ≥1 menu item, required pages, and processed assets. If any is unmet, `publish_failed` now surfaces the real message and offers a scoped retry — but this fix does not auto-remediate those (e.g. an owner who skipped menu import still needs a menu item). This is correct behavior, now visible and recoverable instead of a silent loop.
5. **Backend unchanged by design.** The approval contract (`approvePreview`/`previewApprovedAt`/`validatePublishReadiness`) was already correct; no schema or endpoint changed.

---

*Implementation limited to repairing the approval/publishing happy path. Compare-three-designs, brand editing, and regeneration-by-choice are the agreed next phase.*
