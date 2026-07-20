-- BOS Phase 2 (PR-P2.2) — idempotent backfill of the Membership layer.
--
-- Data-only migration (no DDL). Seeds Membership rows for existing tenants:
--   (a) Owner @ Organization  — from Organization.ownerUserId (the P1 hand-off)
--   (b) Owner @ Business      — from Restaurant.ownerId
--   (c) Staff @ Business      — from RESTAURANT_STAFF users with a restaurantId
--
-- Idempotent: each statement is guarded by NOT EXISTS on the membership's
-- natural key (userId, role, scopeType, scopeId), so a re-run (or partial-
-- failure retry) inserts nothing already present — there is no nullable "flag"
-- column to guard on (unlike the P1.2b org backfill), and no DB uniqueness
-- constraint is added. Atomic: all statements run in the one migration
-- transaction, so a failure leaves no partial/duplicate memberships. Platform
-- ADMIN users receive no tenant membership. gen_random_uuid() is built into
-- Postgres 13+ (CI/prod run 16). Nothing reads these rows yet (dual-read is
-- P2.5), so this changes no observable behavior.

-- (a) Owner @ Organization — one per Organization, keyed on the owner pointer.
INSERT INTO "Membership" ("id", "userId", "role", "scopeType", "scopeId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), o."ownerUserId", 'OWNER', 'ORGANIZATION', o."id", now(), now()
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "Membership" m
  WHERE m."userId" = o."ownerUserId"
    AND m."role" = 'OWNER'
    AND m."scopeType" = 'ORGANIZATION'
    AND m."scopeId" = o."id"
);

-- (b) Owner @ Business — one per Restaurant (Business), keyed on Restaurant.ownerId.
INSERT INTO "Membership" ("id", "userId", "role", "scopeType", "scopeId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."ownerId", 'OWNER', 'BUSINESS', r."id", now(), now()
FROM "Restaurant" r
WHERE NOT EXISTS (
  SELECT 1 FROM "Membership" m
  WHERE m."userId" = r."ownerId"
    AND m."role" = 'OWNER'
    AND m."scopeType" = 'BUSINESS'
    AND m."scopeId" = r."id"
);

-- (c) Staff @ Business — one per RESTAURANT_STAFF user linked to a business.
INSERT INTO "Membership" ("id", "userId", "role", "scopeType", "scopeId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u."id", 'STAFF', 'BUSINESS', u."restaurantId", now(), now()
FROM "User" u
WHERE u."role" = 'RESTAURANT_STAFF'
  AND u."restaurantId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Membership" m
    WHERE m."userId" = u."id"
      AND m."role" = 'STAFF'
      AND m."scopeType" = 'BUSINESS'
      AND m."scopeId" = u."restaurantId"
  );
