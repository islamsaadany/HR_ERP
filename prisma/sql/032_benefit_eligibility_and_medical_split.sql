-- Spec 021 — Unified benefits catalogue: FT/PT eligibility + Personal/Family medical split.
-- Run after 031. Safe to run once (guards where practical). Restructures GuaranteedBenefit from
-- one-row-per-(benefit × employmentType) to one-row-per-benefit with FT/PT eligibility flags and
-- per-type band amounts, and splits medical into Personal (self) and Family (self + dependants).
BEGIN;

-- ── Medical cover scope enum ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "MedicalScope" AS ENUM ('PERSONAL', 'FAMILY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── BenefitCatalogItem: eligibility flags + medical scope ───────────────────
ALTER TABLE "BenefitCatalogItem"
  ADD COLUMN IF NOT EXISTS "medicalScope" "MedicalScope",
  ADD COLUMN IF NOT EXISTS "eligibleFullTime" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "eligiblePartTime" boolean NOT NULL DEFAULT true;

-- Tag the existing single medical item as Personal (self only).
UPDATE "BenefitCatalogItem"
   SET "medicalScope" = 'PERSONAL',
       name = 'Personal medical insurance',
       description = 'Covers you only.'
 WHERE "isMedical" = true AND "medicalScope" IS NULL;

-- Add the Family medical option (self + spouse + children). Eligible for both types by default;
-- HR unticks FT/PT in the catalogue to restrict it (e.g. Part-timers → Personal only).
INSERT INTO "BenefitCatalogItem"
  (id, key, name, description, category, "isMedical", "medicalScope", "eligibleFullTime", "eligiblePartTime", "order", active, "claimType", "coverageRate")
VALUES
  ('cat_medical_family', 'medical_family', 'Family medical insurance', 'Covers you, your spouse and children.',
   'Health & protection', true, 'FAMILY', true, true, 1, true, 'NOTE', 100)
ON CONFLICT (key) DO NOTHING;

-- ── GuaranteedBenefit: one row per benefit, FT/PT eligibility + per-type amounts ──
ALTER TABLE "GuaranteedBenefit"
  ADD COLUMN IF NOT EXISTS "eligibleFullTime" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "eligiblePartTime" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ftBand6mo2y" integer,
  ADD COLUMN IF NOT EXISTS "ftBand2to4y" integer,
  ADD COLUMN IF NOT EXISTS "ftBand4to7y" integer,
  ADD COLUMN IF NOT EXISTS "ftBand7to10y" integer,
  ADD COLUMN IF NOT EXISTS "ptBand6mo2y" integer,
  ADD COLUMN IF NOT EXISTS "ptBand2to4y" integer,
  ADD COLUMN IF NOT EXISTS "ptBand4to7y" integer,
  ADD COLUMN IF NOT EXISTS "ptBand7to10y" integer;

-- Move each existing row's band amounts into its own employment type's columns, and set its
-- eligibility to that one type (merging siblings happens next).
UPDATE "GuaranteedBenefit" SET
  "ftBand6mo2y"  = CASE WHEN "employmentType" = 'FULL_TIME' THEN "band6mo2y"  END,
  "ftBand2to4y"  = CASE WHEN "employmentType" = 'FULL_TIME' THEN "band2to4y"  END,
  "ftBand4to7y"  = CASE WHEN "employmentType" = 'FULL_TIME' THEN "band4to7y"  END,
  "ftBand7to10y" = CASE WHEN "employmentType" = 'FULL_TIME' THEN "band7to10y" END,
  "ptBand6mo2y"  = CASE WHEN "employmentType" = 'PART_TIME' THEN "band6mo2y"  END,
  "ptBand2to4y"  = CASE WHEN "employmentType" = 'PART_TIME' THEN "band2to4y"  END,
  "ptBand4to7y"  = CASE WHEN "employmentType" = 'PART_TIME' THEN "band4to7y"  END,
  "ptBand7to10y" = CASE WHEN "employmentType" = 'PART_TIME' THEN "band7to10y" END,
  "eligibleFullTime" = ("employmentType" = 'FULL_TIME'),
  "eligiblePartTime" = ("employmentType" = 'PART_TIME');

-- Pair a FT row with the PT row of the same name (the seed uses matching names), fold the PT
-- amounts into the FT (canonical) row, repoint any claims/releases, then drop the PT row.
CREATE TEMP TABLE gb_merge ON COMMIT DROP AS
SELECT ft.id AS keep_id, pt.id AS drop_id,
       pt."ptBand6mo2y" AS b1, pt."ptBand2to4y" AS b2, pt."ptBand4to7y" AS b3, pt."ptBand7to10y" AS b4
  FROM "GuaranteedBenefit" ft
  JOIN "GuaranteedBenefit" pt
    ON pt.name = ft.name
   AND ft."eligibleFullTime" AND NOT ft."eligiblePartTime"
   AND pt."eligiblePartTime" AND NOT pt."eligibleFullTime";

UPDATE "GuaranteedBenefit" g SET
  "ptBand6mo2y" = m.b1, "ptBand2to4y" = m.b2, "ptBand4to7y" = m.b3, "ptBand7to10y" = m.b4,
  "eligiblePartTime" = true
  FROM gb_merge m WHERE g.id = m.keep_id;

UPDATE "BenefitClaim"   bc SET "guaranteedBenefitId" = m.keep_id FROM gb_merge m WHERE bc."guaranteedBenefitId" = m.drop_id;
UPDATE "BenefitRelease" br SET "guaranteedBenefitId" = m.keep_id FROM gb_merge m WHERE br."guaranteedBenefitId" = m.drop_id;
DELETE FROM "GuaranteedBenefit" g USING gb_merge m WHERE g.id = m.drop_id;

-- Retire the old per-type columns now that data has moved.
ALTER TABLE "GuaranteedBenefit"
  DROP COLUMN IF EXISTS "employmentType",
  DROP COLUMN IF EXISTS "band6mo2y",
  DROP COLUMN IF EXISTS "band2to4y",
  DROP COLUMN IF EXISTS "band4to7y",
  DROP COLUMN IF EXISTS "band7to10y";

COMMIT;
