-- BOS Phase 1 (PR-P1.2b) — idempotent backfill of the Organization layer.
--
-- Data-only migration (no DDL). Creates exactly one Organization for every
-- pre-existing Business (Restaurant) that does not yet have one, and links it.
-- New businesses created on/after PR-P1.2a already have an Organization, so
-- this only closes the pre-existing gap.
--
-- Single atomic statement: the CTE INSERTs one Organization per un-orged
-- Restaurant and RETURNs (id, ownerUserId); the outer UPDATE then links each
-- un-orged Restaurant to its brand-new Organization by the owner. Because the
-- UPDATE joins only against the *newly inserted* rows (not any Organization
-- created earlier by PR-P1.2a) and Restaurant.ownerId is UNIQUE, the mapping is
-- provably 1:1 and cannot mis-link, even though the Organization table is no
-- longer empty.
--
-- Idempotent: both the INSERT source and the UPDATE target are guarded by
-- "organizationId IS NULL", so re-running is a no-op. The statement is atomic
-- (and the whole migration runs in one transaction), so a failure leaves no
-- orphan Organization. Name is snapshotted from the Business name at backfill
-- time; Restaurant.name is NOT NULL so it is always available.
WITH new_orgs AS (
  INSERT INTO "Organization" ("id", "name", "ownerUserId", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), r."name", r."ownerId", now(), now()
  FROM "Restaurant" r
  WHERE r."organizationId" IS NULL
  RETURNING "id", "ownerUserId"
)
UPDATE "Restaurant" r
SET "organizationId" = new_orgs."id"
FROM new_orgs
WHERE r."ownerId" = new_orgs."ownerUserId"
  AND r."organizationId" IS NULL;
