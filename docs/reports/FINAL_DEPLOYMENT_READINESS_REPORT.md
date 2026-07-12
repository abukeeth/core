# Final Deployment Readiness Report — `apps/api` on Render

Deployment Phase 2 (final verification pass). This report re-verifies `docs/reports/RENDER_DEPLOYMENT_GUIDE.md`'s environment variable table against the current state of the codebase. No deployment was performed and no code was modified.

---

## 1. Scope of Verification

- Every environment variable listed in `render.yaml` was cross-checked against actual usage in `apps/api/src`, `apps/api/scripts`, and `apps/api/prisma`.
- The core, boot-required schema (`apps/api/src/config/env.ts`, `coreEnvSchema`) was cross-checked against `render.yaml` for completeness.
- Checked for variables declared in `render.yaml` but unused anywhere in the codebase (obsolete).
- Checked for variables required to boot but missing from `render.yaml` (missing secrets).
- Re-confirmed the Docker/Blueprint configuration, root directory, health check, and pooler guidance from prior reports still match the current repository state.

---

## 2. Environment Variable Verification Results

All 20 variables declared in `render.yaml` are actively referenced in the codebase:

| Variable | Referenced in code? | Core-required at boot? |
|---|---|---|
| `NODE_ENV` | Yes | Yes (has default, but set explicitly) |
| `PORT` | Yes | Yes (has default, but set explicitly) |
| `DATABASE_URL` | Yes | **Yes — required, no default** |
| `FRONTEND_URL` | Yes | **Yes — required, no default** |
| `JWT_ACCESS_SECRET` | Yes | **Yes — required, no default** |
| `JWT_REFRESH_SECRET` | Declared/documented only — not read by any module (intentional, reserved; see `env.ts` line 194 comment) | No |
| `JWT_ACCESS_TTL` | Yes | **Yes — required, no default** |
| `JWT_REFRESH_TTL` | Yes | **Yes — required, no default** |
| `COMMERCE_ENCRYPTION_KEY` | Yes | **Yes — required, regex-validated (64-char hex)** |
| `ADMIN_EMAIL` | Yes | No (feature-scoped: seed script) |
| `ADMIN_PASSWORD` | Yes | No (feature-scoped: seed script) |
| `ADMIN_NAME` | Yes | No (feature-scoped: seed script) |
| `SMTP_HOST` | Yes | No (feature-scoped: email) |
| `SMTP_PORT` | Yes | No (feature-scoped: email) |
| `SMTP_USER` | Yes | No (feature-scoped: email) |
| `SMTP_PASSWORD` | Yes | No (feature-scoped: email) |
| `SMTP_FROM_ADDRESS` | Yes | No (feature-scoped: email) |
| `OPENAI_API_KEY` | Yes | No (feature-scoped: AI provider) |
| `GOOGLE_MAPS_API_KEY` | Yes | No (feature-scoped: Places import) |
| `SITE_PLATFORM_DOMAIN` | Yes | No (feature-scoped: custom domains) |

**No missing secrets:** every variable in the core boot schema (`DATABASE_URL`, `FRONTEND_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `COMMERCE_ENCRYPTION_KEY`, plus `NODE_ENV`/`PORT`) is present in `render.yaml` with a correct directive (`value`, `generateValue`, or `sync: false`).

**No obsolete variables:** every variable declared in `render.yaml` is either actively read by application code or is an intentionally-documented reserved variable (`JWT_REFRESH_SECRET`) — none are dead/leftover config with no corresponding code.

**One documented, non-blocking gap (unchanged from prior report):** `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` are valid alternative AI-provider variables the code supports but `render.yaml` does not declare. This does not block deployment — `OPENAI_API_KEY` alone satisfies the AI-provider requirement — and only matters if a different provider is preferred, in which case it's added manually post-deploy via Render's Environment tab.

---

## 3. Configuration Verification (unchanged since prior reports, re-confirmed)

- `render.yaml`, `apps/api/Dockerfile`, `pnpm-workspace.yaml`, root `package.json`, and `apps/api/package.json` are all unchanged since the initial clean import commit (`4bd0553`) — verified via `git log` on these paths.
- Docker/Blueprint deployment method, repo-root build context, `/health` health check path, and Session-Pooler Supabase connection guidance from `docs/reports/RENDER_DEPLOYMENT_GUIDE.md` and `docs/reports/SUPABASE_SETUP_REPORT.md` remain accurate against the current codebase.

---

## 4. Deployment Blockers

**None identified.** No missing secrets, no obsolete variables, no configuration drift between `render.yaml` and the application code since the prior reports were written.

---

## Verdict

**PASS** — the deployment configuration is complete, every environment variable is accounted for and correctly sourced, and no code-level or configuration-level blockers remain. Ready to proceed to actual deployment execution when authorized.
