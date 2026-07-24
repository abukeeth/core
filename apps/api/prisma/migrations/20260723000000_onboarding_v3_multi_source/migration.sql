-- Onboarding V3: consolidated multi-source import job type.
ALTER TYPE "ImportSourceType" ADD VALUE IF NOT EXISTS 'MULTI';
