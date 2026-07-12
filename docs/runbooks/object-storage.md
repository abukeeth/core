# Object Storage

Part of Production Hardening Phase 7 (`PRODUCTION_HARDENING_MASTER_SPEC.md`). Covers what moved off local disk, the factory pattern, the public-asset serving decision, and the migration script.

## What moved

Two swappable interfaces already existed specifically for this purpose (their own original code comments said so — Sprint 04's `file-storage.ts`: *"Swappable for S3/GCS later without changing any caller"*; Sprint 06's `release-storage.ts`: *"same swappable-interface pattern"*):

- **`FileStorage`** (`lib/file-storage.ts`) — import uploads (menu PDFs/photos, Sprint 04) and site assets (hero/gallery/logo/OG images, Sprint 06's `asset.service.ts`).
- **`ReleaseStorage`** (`lib/release-storage.ts`) — published-site static HTML pages, `sitemap.xml`, `robots.txt`, and the OG share image (Sprint 06).

Both now have a real S3-compatible implementation (`S3FileStorage`, `S3ReleaseStorage`) alongside the original local-disk one, selected by an env-driven factory at module load. **This is genuinely additive** — no caller in the imports or sites modules changed; they only ever depended on the interface.

## Configuration

`OBJECT_STORAGE_BUCKET` unset (the default) means both stay on local disk, byte-for-byte identical to every environment before this phase — this is what keeps local development working unchanged. Set it (plus region/credentials, and optionally an endpoint for non-AWS providers) to switch to durable object storage:

| Variable | Required when object storage is active | Notes |
|---|---|---|
| `OBJECT_STORAGE_BUCKET` | yes | Presence of this variable alone is what the factory checks. |
| `OBJECT_STORAGE_REGION` | no (defaults `"auto"`) | |
| `OBJECT_STORAGE_ENDPOINT` | only for non-AWS providers | Cloudflare R2, Backblaze B2, MinIO. Enables path-style addressing automatically. |
| `OBJECT_STORAGE_ACCESS_KEY_ID` / `OBJECT_STORAGE_SECRET_ACCESS_KEY` | yes | Sourced from Phase 3's secrets management, never hardcoded. |
| `OBJECT_STORAGE_PUBLIC_URL_BASE` | no | See "Public-asset serving strategy" below. |

`lib/object-storage-client.ts` is the shared S3 client (mirrors `lib/prisma.ts`/`lib/redis.ts`'s singleton pattern) — provider-agnostic by design, since AWS S3, Cloudflare R2, Backblaze B2, and MinIO all speak the same API.

## Key layout

One bucket can hold both without collision:
- `uploads/<uuid>.<ext>` — `S3FileStorage` (mirrors `IMPORT_UPLOAD_DIR`'s local-disk naming intent).
- `site-releases/<siteId>/<versionId>/<filename>` — `S3ReleaseStorage` (mirrors `SITE_RELEASE_DIR`'s local-disk naming intent; deterministic, not random, since these are looked up by known key).

## Public-asset serving strategy (master spec Phase 7 item 6)

This decision only applies to `FileStorage`/`SiteAsset.storageKey` — `ReleaseStorage` content is always read through the API's own render routes (`public-render.routes.ts` reads the page/asset text and writes it directly into the HTTP response), so there's no separate URL question for it, before or after this phase.

Three mutually exclusive paths, decided by `renderer/asset-url.ts` and mirrored by `app.ts`'s `registerAssetsRoute`:

1. **Local disk** (`OBJECT_STORAGE_BUCKET` unset) — unchanged: `express.static` serves `/assets/<basename>`.
2. **Direct-from-CDN** (`OBJECT_STORAGE_PUBLIC_URL_BASE` set) — **the recommended path** once real object storage is configured, per the master spec's own recommendation ("Recommend direct-from-CDN for this codebase's public content"). Nothing is mounted at `/assets` at all; `assetUrl()` returns the full storage key appended to the configured public base, served straight from the bucket/CDN domain, never touching this API. Faster, offloads the API entirely.
3. **Proxied through the API** (object storage configured, no public URL base yet — e.g. a private bucket with no CDN in front) — a thin dynamic route at `/assets/*` reads the object back via the same `fileStorage.read()` every other caller uses (not a second, storage-backend-specific code path) and serves it with a best-effort `Content-Type` guessed from the file extension. Simpler auth story, slower, and the fallback this codebase's own local `docker-compose.yml` MinIO setup actually uses (see below).

## Local development: MinIO

`docker-compose.yml` adds a `minio` service (S3-compatible, for local production simulation) plus a one-shot `minio-init` service that creates the bucket at stack-up time (MinIO doesn't auto-create buckets). Unlike `pnpm dev` outside Docker — which always stays on local disk, since nothing sets `OBJECT_STORAGE_BUCKET` there — the `api` service in `docker-compose.yml` *is* wired to MinIO by default, so `docker compose up` genuinely exercises the S3 code path, not just the default. `OBJECT_STORAGE_PUBLIC_URL_BASE` is deliberately left unset there (`http://minio:9000` only resolves inside the compose network, not from a browser), so assets are proxied through the API — a real deployment behind an actual CDN/public bucket domain would set it.

**Known limitation carried forward from Phase 4**: this sandbox's network policy blocks Docker Hub image-layer downloads outright, so `docker compose up` pulling the MinIO images could not be run live here — `docker compose config` confirms the compose file itself is syntactically valid and resolves as intended. The actual `FileStorage`/`ReleaseStorage` S3 implementations were verified directly (not via MinIO) — see Verification below.

## Migration script

`apps/api/scripts/migrate-storage-to-s3.ts` (run via `pnpm --filter api run storage:migrate-to-s3`) — a one-time copy of any existing local-disk files into the configured bucket, rewriting the DB rows that reference them by path (`SiteAsset.storageKey`, `ImportJob.sourceFilePath`; `ReleaseStorage` needs no DB rewrite, since nothing stores a path for it — every read is reconstructed from `Site.id`/`SiteVersion.id`, which don't change across a storage-backend migration). Idempotent and safe to re-run: a row whose path already looks like an S3 key is skipped, and re-uploading identical bytes under the same key is a harmless no-op. Expected to be a no-op today — no production deployment has ever existed to have accumulated files — but written for reuse the next time storage providers change, per the master spec's own framing.

## Rollback

The factory pattern means reverting to local disk is a one-line env-var change (unset `OBJECT_STORAGE_BUCKET`), not a code revert — provided no data has been written *only* to the S3 backend yet. A real cutover that has accumulated real data would need the migration script run in reverse, or keeping both backends readable during a transition window (not implemented — noted here as the real operational caveat, consistent with the master spec's own Rollback framing for this phase).

## Verification

- `file-storage.test.ts` / `release-storage.s3.test.ts` / `object-storage-client.test.ts`: round-trip tests (save/put then read returns byte-for-byte/character-for-character identical content) for both the local-disk and S3-backed implementations of both interfaces, against a mocked `@aws-sdk/client-s3` client (an in-memory `Map` standing in for bucket contents) — proving the S3 implementations satisfy the exact same interface contract as local disk, independent of any live bucket.
- `asset-url.test.ts`: all three serving-strategy paths (local disk, direct-from-CDN, proxied-through-API), plus the three original local-disk test cases confirmed passing completely unmodified.
- The full existing import/sites test suites (`import.service.test.ts`, `asset.service.test.ts`, and every other test that consumes `fileStorage`/`releaseStorage` through the interface) pass **unmodified** — confirming the abstraction boundary drawn back in Sprints 04/06 was never violated by this phase.
