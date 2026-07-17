# AI Builder Approval Fix — Deployment Checklist

**Companion to:** `AI_BUILDER_APPROVAL_FIX_IMPLEMENTATION.md`, `AI_BUILDER_FINAL_VERIFICATION.md`
**Date:** 2026-07-17
**Change:** Fix AI Builder — real preview + explicit approval before publish (frontend-only, `apps/web`).

---

## 1. Pull Request

| | |
|---|---|
| **PR** | **#9** — https://github.com/abukeeth/core/pull/9 |
| Title | Fix AI Builder: real preview + explicit approval before publish |
| Head → Base | `claude/ai-builder-approval-fix-cqjtdb` → `main` |
| Merge method | Squash |
| **Merge commit on `main`** | `366649eff1546db6b61a1f1dec4070f159a4e45e` |
| Mergeable state at merge | `clean` |

## 2. CI Status (on the PR — gate for merge)

All required checks **passed** before merge:

| Check | Conclusion |
|---|---|
| Validate, lint, typecheck, test, build | ✅ success (completed 19:08:19Z) |
| Migration check | ✅ success |
| Vercel Preview Comments | ✅ success |

Verification behind CI (also reproduced locally): web **266 tests passed**, backend approval-contract **72 tests passed**, typecheck/lint/build exit 0.

> A post-merge CI run also triggered on `main` (`push` event, run `29606480134`). Note: the repo's **GitHub Actions `Deploy` workflow is a placeholder** — its deploy step only echoes *"No deployment target exists yet"* (explicitly "pending Production Hardening Phase 4"), and its smoke-test job is a placeholder. **It is not the real deployment mechanism** and its status (historically red) does not reflect the actual production deploy below.

## 3. Deployment Status

**The real production deploy is performed by Vercel's Git integration** (project `ordervora-web`), which deploys `main` to production automatically on merge — independent of the placeholder GitHub Actions `Deploy` workflow.

| | |
|---|---|
| Vercel project | `ordervora-web` (`prj_QSNKRF31vHuZyQidcMdsDzVrOaM8`) |
| **Deployment** | `dpl_9VzvJVmc4Py8Sfmr5yktJzY1zJjN` |
| Source commit | `366649e` (main — the PR #9 merge) |
| **State** | ✅ **READY** (`readyState: READY`, `aliasError: null`) |
| Target | **production** |
| Region / runtime | `iad1` / Next.js (Lambdas) |
| Ready at | 2026-07-17 ~19:10Z |
| Inspector | https://vercel.com/mkjusafashion-9513s-projects/ordervora-web/9VzvJVmc4Py8Sfmr5yktJzY1zJjN |

**Scope of deploy:** this fix is **frontend-only** (all changes under `apps/web`). The backend (`apps/api`, deployed separately on Railway) is **unchanged** — the approval contract (`approvePreview` / `previewApprovedAt` / `validatePublishReadiness`) was already correct and already in production. **No API redeploy or database migration was required** (the Migration check confirmed no schema change).

## 4. Production URL

The production deployment is aliased to:

- **https://ordervora.com** ← canonical
- https://www.ordervora.com
- https://ordervora-web.vercel.app

> **Note on external probing:** a direct `curl` to these URLs from the build sandbox returned `HTTP 000` because this environment's outbound proxy does not allowlist arbitrary web hosts — this is a sandbox egress limitation, **not** a production outage. Vercel's own API reporting `readyState: READY`, `target: production`, `aliasError: null` for commit `366649e` is the authoritative confirmation that the aliases are assigned and serving. Confirm interactively via the post-deployment steps below.

## 5. Post-Deployment Verification Steps

Run these against **https://ordervora.com** with a real owner account (the fix's behavior can only be fully confirmed with live AI generation + database, per `AI_BUILDER_FINAL_VERIFICATION.md` §6):

**Smoke:**
1. Open https://ordervora.com — confirm the app loads and `/login` renders.
2. Log in as an owner.

**The fix (happy path):**
3. Use an owner whose site is **not yet published**; open **`/dashboard/builder`**.
4. Let generation run to completion → confirm you land on the **"Review your design"** screen showing a **real website preview (iframe)** — not the schematic build animation, and **not** an automatic "you're live" finale.
5. Confirm a visible **"Approve this design"** button (this is the element that was missing in production).
6. Click **Approve** → confirm the flow approves, then publishes, and the **success/finale appears only after** publish confirms.
7. Confirm the site actually reaches **published** state (visit the storefront/site URL).

**The fix (failure is now recoverable, not a silent loop):**
8. For an owner who **skipped menu import** (empty menu), run the builder to the review screen and Approve → confirm publish now shows a **clear, recoverable error** with a **"Try publishing again"** button (instead of the old "Open the full preview and approve it before publishing." dead-end loop). Add a menu item, retry → confirm it then publishes.

**Regression guard:**
9. Confirm the manual Website hub (`/dashboard/website`) and its variations page still publish normally (unchanged by this fix).

## 6. Rollback Plan

If a regression is observed, roll back instantly at the Vercel alias level (no rebuild):
- Vercel → `ordervora-web` → Deployments → promote the previous production deployment **`dpl_6vuA3SnHVEc7MYYJb3vCkgGnii35`** (commit `d0611c7`, the prior `main` production, `isRollbackCandidate: true`).
- Because the fix is frontend-only, an alias rollback fully reverts the change; no backend/database action is involved.

---

## Summary

- ✅ PR #9 opened, CI green, squash-merged to `main` (`366649e`).
- ✅ Production deploy **succeeded on Vercel** (`READY`, `target: production`) and is aliased to **ordervora.com**.
- ℹ️ The GitHub Actions `Deploy` workflow is a placeholder (no real target) — Vercel Git integration is the actual deploy path.
- ℹ️ Frontend-only change; backend/API unchanged, no migration.
- ⏭️ Complete the §5 interactive verification against a live owner account with real AI generation to confirm the approval gate end-to-end in production.
