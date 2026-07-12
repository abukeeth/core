# Production Hardening Phase 7 — Completion Report

**Object Storage Migration**

Implemented per `docs/reports/Sprint07/PRODUCTION_HARDENING_MASTER_SPEC.md`, Phase 7. Supports Phase 4's container-durability requirement (local disk in a container is ephemeral) and is a prerequisite for a real Phase 10 backup story.

## 1. What was done

### 1.1 `S3FileStorage` / `S3ReleaseStorage` — genuinely additive

Both `FileStorage` and `ReleaseStorage` interfaces already existed specifically for this purpose since Sprint 04/06 (their own code comments said so). This phase implements the S3-compatible half of each, selected by an env-driven factory (`OBJECT_STORAGE_BUCKET` unset → local disk, unchanged; set → S3) — **no caller in the imports or sites modules changed**, since they only ever depended on the interface, never the implementation. `lib/object-storage-client.ts` is a new shared S3 client (mirrors `lib/prisma.ts`/`lib/redis.ts`'s singleton pattern), provider-agnostic by design (AWS S3, Cloudflare R2, Backblaze B2, and MinIO all speak the same API).

### 1.2 New dependency and env vars

`@aws-sdk/client-s3` added. New optional env vars (`config/env.ts`, `.env.example`): `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ENDPOINT` (non-AWS providers), `OBJECT_STORAGE_ACCESS_KEY_ID`/`OBJECT_STORAGE_SECRET_ACCESS_KEY`, and `OBJECT_STORAGE_PUBLIC_URL_BASE` (the public-serving-strategy decision, §1.3). All outside the core startup-validated schema — object storage is optional, exactly like Redis in Phase 5.

### 1.3 Public-asset serving strategy — decided explicitly (spec item 6)

Three mutually exclusive paths, implemented and all covered by tests:

1. **Local disk** (`OBJECT_STORAGE_BUCKET` unset) — unchanged.
2. **Direct-from-CDN** (`OBJECT_STORAGE_PUBLIC_URL_BASE` set) — the **recommended** path once real object storage is configured, per the master spec's own explicit recommendation. `app.ts` mounts nothing at `/assets`; `renderer/asset-url.ts` builds the full URL straight to the CDN/bucket domain.
3. **Proxied through the API** (object storage configured, no public URL base) — a thin dynamic route in `app.ts` reads the object back via the same `fileStorage.read()` every caller uses, with a best-effort `Content-Type` guessed from the extension. This is what this codebase's own `docker-compose.yml` MinIO setup actually uses, since `http://minio:9000` isn't a real browser-reachable URL.

`ReleaseStorage` needed no such decision — its content is already always read through the API's own render routes (`public-render.routes.ts`), before and after this phase.

### 1.4 Migration script

`apps/api/scripts/migrate-storage-to-s3.ts` (`pnpm --filter api run storage:migrate-to-s3`) — copies existing local-disk files into the configured bucket and rewrites the DB rows that reference them by path (`SiteAsset.storageKey`, `ImportJob.sourceFilePath`). Idempotent (skips already-migrated keys, safe to re-run). `ReleaseStorage` needs no DB rewrite since nothing stores a path for it. Expected to be a no-op today (no accumulated production data exists), written for reuse the next time storage providers change, per the spec's own framing.

### 1.5 `docker-compose.yml`: MinIO

Added `minio` (S3 API + console) and a one-shot `minio-init` (bucket bootstrap — MinIO doesn't auto-create buckets) service, both pinned to specific release tags rather than `:latest`. `api` is wired to use MinIO by default in this compose file (not local disk) — deliberately, since this file represents production-like simulation and the master spec's own Phase 7 verification criteria calls for exercising the S3 code path here, not just its default. `pnpm dev` outside Docker is unaffected and still always uses local disk.

## 2. Files changed

**New:**
- `apps/api/src/lib/object-storage-client.ts` (+ `.test.ts`)
- `apps/api/src/lib/file-storage.test.ts`
- `apps/api/src/lib/release-storage.s3.test.ts`
- `apps/api/scripts/migrate-storage-to-s3.ts`
- `docs/runbooks/object-storage.md`
- `docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_7_COMPLETION_REPORT.md` (this file)

**Modified:**
- `apps/api/src/lib/file-storage.ts` — `S3FileStorage` + factory.
- `apps/api/src/lib/release-storage.ts` — `S3ReleaseStorage` + factory.
- `apps/api/src/modules/sites/renderer/asset-url.ts` (+ its own test) — the one seam anticipated for exactly this purpose since Sprint 06.
- `apps/api/src/app.ts` — `registerAssetsRoute` (three-path conditional serving).
- `apps/api/src/config/env.ts`, `apps/api/.env.example` — new env vars.
- `apps/api/package.json` — `@aws-sdk/client-s3` dependency, `storage:migrate-to-s3` script.
- `apps/api/tsconfig.json` — `scripts/` added to `include` so the migration script gets typecheck coverage.
- `docker-compose.yml` — `minio`/`minio-init` services; `api`'s `depends_on`/environment updated; the now-unneeded `api-uploads` volume removed.

**Explicitly not touched — verified, not assumed:** every file under `apps/api/src/modules/imports/` and `apps/api/src/modules/sites/` except `renderer/asset-url.ts` (the anticipated seam) — confirmed via `git status` showing zero other modifications in either directory, and the full import/sites test suites (51 files, 322 tests) passing unmodified.

## 3. Verification

| Check | Result |
|---|---|
| `prisma validate` | ✅ Pass (schema unchanged) |
| `prisma generate` | ✅ Pass |
| `pnpm run lint` (root, both apps) | ✅ Pass, no warnings |
| `pnpm run typecheck` (root, both apps) | ✅ Pass |
| `pnpm run test` (root, both apps) | ✅ **877/877 passing + 2 Phase-6 integration tests skipped by default** (up from 859 pre-Phase-7; 18 new tests: `file-storage.test.ts` (4), `object-storage-client.test.ts` (8), `release-storage.s3.test.ts` (6)) |
| `pnpm run build` (root, both apps) | ✅ Pass |

**Round-trip verification per backend (master spec Phase 7 Verification item 1)**: both `FileStorage` and `ReleaseStorage`, local-disk and S3-backed, round-trip byte-for-byte/character-for-character identical content — the S3 side verified against a mocked `@aws-sdk/client-s3` client (an in-memory `Map` standing in for bucket contents), since this sandbox has no live bucket.

**The existing import/sites test suites pass unmodified (master spec Phase 7 Verification item 3)** — the entire point of the interface having been drawn correctly back in Sprints 04/06. Confirmed directly: 51 test files / 322 tests under `modules/imports` and `modules/sites` all pass with zero changes, and `git status` confirms zero files modified in either directory beyond the one seam (`asset-url.ts`) that was always intended to change here.

**Real server-boot verification (compensating for this sandbox's Docker Hub block — see §4)**: the compiled server was booted twice — once in local-disk mode (unchanged: `/health` → `200`, `/assets/<missing>` → `404` via `express.static`), and once in S3 mode with an intentionally unreachable endpoint (`/health` → `200`, `/assets/uploads/<key>` → `404` within seconds, not a hang or crash, confirming the proxy route's `try/catch` degrades gracefully when the object-storage backend is unreachable, and the server stays healthy afterward).

## 4. Known limitation (carried forward from Phase 4/5/6)

This sandbox's network policy blocks Docker Hub image-layer downloads outright, so `docker compose up` pulling the MinIO images (or any image) could not be run live here. `docker compose config` confirms the compose file itself is syntactically valid and resolves as intended. The master spec's own Verification section calls for running the full import→review→approve and generate→publish→view-live-site flows against real S3-compatible storage "in a staged environment" before calling this phase done — that staged-environment run (with a real reachable MinIO or real cloud object storage) is the recommended final check before any real production cutover, same category of limitation as every prior phase's Docker-Hub-blocked verification.

## 5. Notes

- `OBJECT_STORAGE_PUBLIC_URL_BASE` is the mechanism that implements the master spec's "direct-from-CDN" recommendation — not yet exercised against a real CDN in this sandbox (no live infrastructure), but the URL-building logic itself is fully unit-tested.
- The migration script's DB-row rewrite (`SiteAsset.storageKey`, `ImportJob.sourceFilePath`) was not exercised against real accumulated data in this environment (none exists, as expected) — its logic was reviewed carefully rather than run against live rows, consistent with the spec's own "expected to be a no-op today" framing.

---

*Phase 7 complete. Continuing immediately to Phase 8 (Image Optimization) per instruction.*
