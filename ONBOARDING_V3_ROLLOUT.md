# Onboarding V3 — Rollout Plan & Final Readiness Report

**Date:** 2026-07-24
**Branch:** `claude/frontend-onboarding-phases-3-6-xd6i01`
**Scope:** Make Wizard V3 the default onboarding path for all customers, keeping
the legacy 7-step wizard as a temporary fallback. No payment step, no Stripe, no
payment settings inside the wizard (explicitly out of scope).

---

## 1. Executive answer

**Is V3 ready to become the default? — Yes, with a staged rollout.**

Every blocker identified in the previous readiness report is now closed:

| # | Blocker | Status |
|---|---------|--------|
| 1 | Store could go live with the placeholder name "My Business" | ✅ Fixed — **Confirm-details** step forces a real business name |
| 2 | No way to set an address in V3 | ✅ Fixed — address captured (optional) in the same step |
| 3 | Hard dependency on AI import (no fallback if AI failed / no source) | ✅ Fixed (prior task) — **Manual / Skip** path to the builder |
| 4 | No end-to-end coverage of the full flow | ✅ Fixed — live E2E for **both** paths + resume at every stage |
| 5 | No safe rollout mechanism / kill-switch story | ✅ This document |

**Can we safely set `NEXT_PUBLIC_ONBOARDING_V3=true`? — Yes**, but understand the
one operational caveat first: the flag is **build-time inlined**, so flipping it
(on OR off) requires a rebuild + redeploy. There is no instant runtime toggle.
Plan the rollout and the rollback around a deploy, not a dashboard switch.

---

## 2. What V3 is now

A 4-stage flow at `/setup`, mobile-first, warm-cream/gold design tokens:

```
Create ──► Review ──► Confirm details ──► Build (hand off to /dashboard/builder)
(type +     (AI menu    (name + address      (generate → review →
 sources)    edit &      guaranteed before    publish → live link + QR)
             approve)    going live)
```

- **Two entry paths converge** on Confirm details before build:
  - **AI import:** Create → analyze sources → review & approve the extracted menu → Confirm → Build.
  - **Manual / Skip:** Create (pick type, press *Skip — I'll add my menu manually*) → Confirm → Build (owner adds the menu by hand in the dashboard).
- **Confirm details** always re-fetches the freshest server state, so an
  AI-extracted name/address is pre-filled; the "My Business" placeholder is
  treated as empty so the owner is forced to name the store. Name is required;
  address is optional.
- **Resume is data-driven**, not a replay. On load the container derives the
  correct stage from the real store + import-job state:
  - no store → Create
  - store, no import → Create
  - import PENDING/PROCESSING → Review (analyzing)
  - import AWAITING_REVIEW → Review (editor)
  - import APPROVED, not yet DONE → **Confirm details** (never straight to build)
  - setupStep DONE → straight to the builder
  - transient load failure → retry screen (never a fresh Create that could 409 on re-create)

---

## 3. Test evidence

All gates green on this branch:

- `pnpm typecheck` → clean
- `pnpm lint` → 0 errors (2 pre-existing `<img>` warnings in `page.tsx`, unrelated)
- `pnpm vitest run` → **350 passed / 350**
- `pnpm build` → succeeds (`/setup` compiles)

V3-specific coverage (`src/app/setup/`, 50 tests):

- **Full-path E2E** (`onboarding-v3.e2e.test.tsx`) — drives the real container
  and real Create / Review / Confirm screens against a stateful in-memory API:
  - Manual/Skip: create → skip → confirm → **build handoff + store saved with real name/address + setupStep DONE**
  - AI import: create → analyze → approve → confirm → **build handoff + store saved**
  - Resume at each of the 6 states above.
- **Confirm-details unit** (`confirm-details-screen.test.tsx`) — placeholder-as-empty, AI prefill, save+handoff, empty-name block.
- **Container resume** (`onboarding-v3.test.tsx`) — including "approved but not DONE resumes at Confirm, not build".
- **Flag gate** (`page.gate.test.tsx`) — `/setup` renders legacy when flag off, V3 when on.

---

## 4. Rollout plan (staged, reversible)

Because the flag is a build-time env var, each stage is a deploy. Keep the legacy
wizard code in place for the entire rollout — it is the fallback.

### Stage 0 — Pre-flight (no user impact)
- Merge this branch. The flag stays **OFF**, so production still shows the legacy
  wizard. Nothing changes for any owner.
- Confirm the API supports both paths in the target environment: consolidated
  import endpoint reachable, `updateRestaurant` accepts `{ name, address }`,
  `setSetupStep("DONE")` works. (All already used by the legacy flow.)

### Stage 1 — Internal / staging
- Set `NEXT_PUBLIC_ONBOARDING_V3=true` in **staging only**, rebuild, deploy.
- Manually walk both paths on a real device:
  - AI import with a real menu photo + a website URL.
  - Manual/Skip with no source.
  - Kill the tab mid-analysis and reopen → confirm resume lands correctly.
  - Complete to a published storefront; verify the store name + address on the
    live site and on an order receipt.

### Stage 2 — Limited production (canary)
- If your host supports per-deployment/preview env (e.g. a Vercel preview or a
  parallel Render service), point a small % of new-owner traffic at a build with
  the flag on. Watch: onboarding completion rate, drop-off at Confirm, import
  failure rate, support tickets mentioning "name"/"address"/"stuck".
- If the host does **not** support traffic splitting, treat Stage 2 as a short
  soak: enable in production during a low-traffic window and monitor closely for
  24–48h before calling it stable.

### Stage 3 — Full default
- Set `NEXT_PUBLIC_ONBOARDING_V3=true` in production, rebuild, deploy.
- V3 is now the default for **all** new onboarding. Existing owners mid-setup on
  the legacy flow are unaffected functionally (both flows write the same server
  state); a refresh moves them onto V3's resume, which reads the same store +
  import state.

### Stage 4 — Cleanup (later, separate PR — NOT now)
- After V3 has been the default and stable for a full release cycle, remove the
  flag, the legacy wizard (`legacy-wizard.tsx`, `steps/`), and the branch in
  `page.tsx`. Out of scope for this task; do not start it here.

---

## 5. Rollback

- **Mechanism:** set `NEXT_PUBLIC_ONBOARDING_V3` back to blank/`false`, rebuild,
  redeploy. `/setup` immediately renders the legacy wizard again.
- **Data safety of a mid-rollout revert:** V3 and the legacy wizard write the
  **same** server state (a `Restaurant` row + import jobs + `setupStep`). An
  owner who started on V3 and lands back on the legacy wizard after a rollback
  keeps their store; the legacy wizard resumes from `setupStep`. No data
  migration, no destructive change.
- **Caveat:** rollback is a redeploy, not instant. Budget for it. If you need a
  faster kill-switch than a deploy, see Risk R1's mitigation.

---

## 6. Remaining risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R1 | Flag is build-time inlined → no instant runtime kill-switch; on/off both need a redeploy. | Medium | Keep legacy wizard in place (done). If instant toggling is required, a follow-up could read the flag from a runtime source (cookie/header/remote config) — **out of scope now**. Plan rollout/rollback around deploys. |
| R2 | AI import quality depends on the backend vision/extraction service and the AI key being present in the target env. | Medium | Manual/Skip path fully de-risks this: no source, no key required — the owner still completes onboarding and adds the menu by hand. Failed imports also expose *Continue without it — add my menu manually*. |
| R3 | Confirm-details save (`updateRestaurant`) or `setSetupStep("DONE")` fails. | Low | Name save surfaces an inline error and blocks handoff (owner retries). The `setSetupStep` write is best-effort and self-heals on next load (builder is still reachable; a stale step re-derives). |
| R4 | Address is optional → some stores go live without one. | Low (by design) | Intentional: pickup/address can be refined later in Settings. Not a blocker for going live. Revisit only if a vertical requires address at creation. |
| R5 | Legacy and V3 diverge over time while both are shipped. | Low | Time-boxed: Stage 4 removes legacy after V3 is proven. Until then both write identical state, so divergence is cosmetic only. |
| R6 | E2E stubs the heavy `ReviewEditor` and on-device image downscale. | Low | Those leaves have their own unit tests; the E2E covers the container + real Create/Review/Confirm wiring and both full paths. Stage 1 manual QA covers the real editor on a device. |

**No P0/blocker risks remain.** R1 is the only item worth a conscious decision:
accept deploy-based toggling (recommended, simplest) or invest in a runtime flag
later.

---

## 7. Recommendation

Ship it staged. Merge with the flag **OFF** (zero risk), validate on staging with
the flag on, soak in production briefly, then flip production to default. Keep the
legacy wizard as the fallback until V3 has a stable release cycle behind it, then
remove it in a separate PR.

Setting `NEXT_PUBLIC_ONBOARDING_V3=true` is **safe** — the only thing to respect
is that it (and its rollback) take effect on redeploy, not instantly.
