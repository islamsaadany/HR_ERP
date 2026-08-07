-- HR_ERP — Benefits company coverage rates (spec 012). Each flexible benefit gains a coverage
-- percentage; the covered (company) share = cost × rate/100 draws from the pool, the employee pays
-- the rest. SelectionLine gains `cost` (the full price entered) while `amount` stays the covered
-- pool draw. Idempotent, runner-applied.
BEGIN;

-- Catalog: coverage rate (default 100% = fully covered / unchanged behavior for unseeded items).
ALTER TABLE "BenefitCatalogItem" ADD COLUMN IF NOT EXISTS "coverageRate" integer NOT NULL DEFAULT 100;

-- Seed the agreed rates by benefit key. 100% keys (medical, checkup, coaching) keep the default.
UPDATE "BenefitCatalogItem" SET "coverageRate" = 80
  WHERE "key" IN ('gym','sports','schooling','childcare','caregiver','learning');
UPDATE "BenefitCatalogItem" SET "coverageRate" = 50
  WHERE "key" IN ('mobile','homeoffice');

-- Selection line: the full cost the employee entered. `amount` remains the covered pool draw.
ALTER TABLE "SelectionLine" ADD COLUMN IF NOT EXISTS "cost" integer NOT NULL DEFAULT 0;

-- Backfill existing rows: pre-coverage, the allocated amount WAS the (100%-covered) cost.
UPDATE "SelectionLine" SET "cost" = "amount" WHERE "cost" = 0;

COMMIT;
