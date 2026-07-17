# AI Builder Approval Fix — Final Verification

**Companion to:** `AI_BUSINESS_BUILDER_GAP_ANALYSIS.md`, `AI_BUILDER_APPROVAL_FIX_IMPLEMENTATION.md`
**Date:** 2026-07-17
**Branch:** `claude/ai-builder-approval-fix-cqjtdb`
**Verifier note:** All results below are from commands actually executed in this environment. Where a form of verification is **not reproducible here**, that is stated explicitly — no evidence is fabricated.

---

## Summary Verdict

| # | Check | Result |
|---|---|---|
| 1 | Web tests | ✅ **266 passed** (42 files) |
| 2 | Web typecheck | ✅ **exit 0** |
| 3 | Web lint | ✅ **exit 0** (2 pre-existing `<img>` warnings, unrelated) |
| 4 | Web build | ✅ **exit 0** |
| 5 | Approval flow (manual/DOM) | ✅ Real `DesignReviewScreen` driven with real clicks (9 tests) + state-machine guarantees (hook tests) + real-browser boot |
| 6 | Site → published end-to-end | ✅ Verified at the frontend↔backend contract boundary (72 backend tests + hook tests). ⚠️ Full live AI-generation browser run **not reproducible here** (no AI key / no provisioned DB) — see §6. |

**Production-ready?** **Yes, for the scoped fix** (the approval/publishing happy path). The deterministic failure is gone, the approval gate is enforced end-to-end at the contract boundary, and all automated gates are green. One residual verification (a single live browser pass through real AI generation) could not run in this sandbox and is called out as a pre-release step. See §7.

---

## 1–4. Automated Gates (commands + results)

All commands run from `apps/web` after `pnpm install --frozen-lockfile` at repo root.

### 1. Tests — `pnpm exec vitest run`
```
Test Files  42 passed (42)
     Tests  266 passed (266)
```
Includes the builder suite (`src/app/dashboard/builder`, 54 tests across 6 files) and the full app suite. No failures, no skips.

### 2. Typecheck — `pnpm run typecheck` (`tsc --noEmit`)
```
TYPECHECK_EXIT: 0
```

### 3. Lint — `pnpm run lint` (`eslint`)
```
✖ 2 problems (0 errors, 2 warnings)
LINT_EXIT: 0
```
Both warnings are pre-existing `@next/next/no-img-element` in `src/app/page.tsx` (lines 72, 150) — not in any file changed by this fix.

### 4. Build — `API_URL=http://localhost:4000 pnpm run build` (`next build`)
```
BUILD_EXIT: 0
```
All routes compiled, including `/dashboard/builder`.

---

## 5. Approval Flow — Manual / Behavioral Verification

Because the live builder's *generation* step calls a real LLM (unavailable here, §6), the owner-facing approval flow was verified at the two levels that are reproducible and authoritative:

### 5a. Real component, real clicks — `design-review-screen.test.tsx` (NEW, 9 tests, all pass)
Renders the **actual** `DesignReviewScreen` (only the live `/preview` iframe is stubbed) and drives the real DOM:

| Behavior verified | Assertion |
|---|---|
| Shows the **real** preview of the selected design (not the build mockup) | `real-preview` renders `site-1:v-best` |
| **"Approve this design"** button present and fires `onApprove` on click | click → `onApprove` called once |
| Safe secondary **"Choose another design"** → variations page (no auto-publish) | link `href="/dashboard/website/variations"` |
| **No premature success claim** at the gate | "open for business"/"you're live"/"officially open" absent; "nothing is public yet" present |
| `approving` state hides Approve, shows progress | "Approving your design…" shown, Approve button gone |
| `publishing` state shows progress, still no "live" claim | "Publishing your website…" shown |
| `approve_failed` surfaces error + **"Try approving again"** | error text + retry → `onRetryApprove` |
| `publish_failed` surfaces readiness error + **"Try publishing again"** (publish-only) | error text + retry → `onRetryPublish` |
| Preview unavailable disables approval | "Preview unavailable" + Approve disabled |

### 5b. State-machine guarantees — `use-restaurant-builder.test.ts` (rewritten, all pass)
The seven required guarantees, each an explicit test:
1. never publishes before approval, 2. approve before publish (ordered `["approve","publish"]`), 3. publish only after approve succeeds, 4. approval failure does not publish, 5. publish failure is recoverable, 6. retry does not regenerate (stage-scoped `retryPublish`/`retryApprove`/`retrySelect`), 7. success only after confirmed publish.

### 5c. Real-browser boot probe
Production build started with `next start` on `:4100`:
```
✓ Ready in 257ms
GET /                     → HTTP 200
GET /dashboard/builder    → HTTP 307 → Location: /login   (auth middleware, as designed)
```
Confirms the fixed bundle compiles and serves in a real server/runtime; `/dashboard/builder` is correctly auth-gated. (Server log: `scratchpad/web-server.log`.)

> Note: a captured **screenshot** was attempted with the pre-installed Chromium, but Playwright is not a dependency of this project and installing it would require network fetches; no screenshot was produced rather than fabricate one. The curl probe above is the runtime evidence.

---

## 6. Site → Published State, End-to-End

The fix's correctness depends on a frontend↔backend contract. Both halves are verified, and they **meet at the exact API boundary** the hook calls.

### 6a. Backend contract — `site.service.test.ts` + `generation.service.test.ts` (72 tests, all pass)
Directly assert the approval/publish gate the fix relies on:
- `selectVariation` / `patchDraft` **clear** `previewApprovedAt` (`site.service.test.ts:268`).
- `approvePreview` **sets** `previewApprovedAt` (`:281-290`).
- `validatePublishReadiness` **blocks** publish with a `PREVIEW_APPROVAL` issue when never approved (`:296-307`), and **passes** once approved and all other checks pass (`:311`).
- `publishSite` **throws `PrePublishCheckFailedError`** when not ready (`:326`).

### 6b. Frontend path — `use-restaurant-builder.test.ts`
The hook drives `approvePreview("site-1") → publishSite("site-1") → createTable → done`, with `publishedVersionId` set only after `publishSite` resolves.

### 6c. Boundary alignment
The hook calls exactly the endpoints the backend tests exercise (`/approve-preview`, `/publish`), in the order the backend requires (approve sets the flag; publish then passes readiness). The previously-fatal sequence (`selectVariation → publishSite` **without** approve → guaranteed `PrePublishCheckFailedError`) is eliminated; the new sequence satisfies the gate.

### ⚠️ Not reproducible in this environment (stated honestly)
A single **live browser pass** — real owner, real Postgres, real LLM generating three variations, real object storage for assets — was **not** run, because:
- **No AI provider key** (`OPENAI_/ANTHROPIC_/GEMINI_API_KEY` all unset) → the generation stage cannot execute, so the builder cannot reach the review gate through the real backend.
- **No provisioned `DATABASE_URL`** → the API can't serve live data without standing up and seeding a full stack.

Fabricating a menu/site/draft to bypass generation would not be a *real* end-to-end run, so it was not done. The published-state path is therefore verified by the contract evidence above (6a+6b+6c), not by a single live click-through. See §7 for the recommended pre-release live pass.

---

## 7. Production Readiness

**Ready for release within its stated scope.** Rationale:
- The **deterministic failure is fixed**: the builder no longer auto-publishes into the `PREVIEW_APPROVAL` gate; it stops at a real preview and only publishes after a confirmed `approvePreview`.
- **No premature "you're live" / confetti** before the backend confirms publish (verified in `DesignReviewScreen` and `builder-experience` tests).
- **Retries are stage-scoped** and never regenerate.
- **All automated gates green**; **no backend/schema change** (contract was already correct).

**Recommended before general availability (one item, environment-gated):**
1. Run **one live pass** in a staging environment with a real AI key + database: start generation → confirm the review gate shows the real preview → Approve → confirm the site reaches `PUBLISHED` and the finale renders. This exercises the one layer this sandbox could not (live generation + DB). Everything up to and including the publish contract is already verified here.

**Out of scope (agreed next phase, not blockers):** in-builder compare-three-designs, brand editing before publish, regenerate-by-choice. Other publish-readiness gates (business name, ≥1 menu item, assets) still apply and now surface a real, recoverable message instead of a silent loop.

---

## Commands Executed (chronological, reproducible)
```
# repo root
pnpm install --frozen-lockfile

# apps/web
pnpm exec vitest run src/app/dashboard/builder        # 54 passed
pnpm exec vitest run                                   # 266 passed (42 files)
pnpm run typecheck                                     # exit 0
pnpm run lint                                          # exit 0 (2 pre-existing warnings)
API_URL=http://localhost:4000 pnpm run build          # exit 0
API_URL=http://localhost:4000 PORT=4100 pnpm run start # Ready in 257ms; / → 200; /dashboard/builder → 307 /login

# apps/api
pnpm exec vitest run src/modules/sites/site.service.test.ts \
                     src/modules/sites/generation.service.test.ts   # 72 passed
```

---

*Verification complete within reproducible bounds. No PR opened, per instruction. The one non-reproducible check (live AI-generation browser pass) is documented as a staging pre-release step, not silently claimed as done.*
