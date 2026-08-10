-- Spec 021 — Unified benefits catalogue: FT/PT eligibility + Personal/Family medical split.
-- Run after 031. Idempotent and self-adapting: the legacy guaranteed-benefit data migration
-- (one-row-per-(benefit × employmentType) → one-row-per-benefit) only runs when the old
-- `employmentType` column is still present. If the schema was already advanced by a `prisma db
-- push` (new columns present, `employmentType` gone), that block is skipped and only the medical
-- split is applied. Safe to re-run.
BEGIN;

-- ── Medical cover scope enum ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "MedicalScope" AS ENUM ('PERSONAL', 'FAMILY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── BenefitCatalogItem: eligibility flags + medical scope (idempotent) ──────
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

-- ── GuaranteedBenefit: ensure the new columns exist (idempotent) ─────────────
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

-- ── Legacy data migration — ONLY if the old per-type columns still exist ─────
-- Statements referencing `employmentType`/`band*` are only planned when the branch runs, so this
-- is safe on a DB where those columns were already dropped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'GuaranteedBenefit' AND column_name = 'employmentType'
  ) THEN
    -- (a) Move each row's band amounts into its own type's columns; eligibility = that one type.
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

    -- (b) Repoint claims from each PT row to its FT sibling (by name), before mutating eligibility.
    UPDATE "BenefitClaim" bc SET "guaranteedBenefitId" = ft.id
      FROM "GuaranteedBenefit" pt, "GuaranteedBenefit" ft
     WHERE bc."guaranteedBenefitId" = pt.id
       AND ft.name = pt.name
       AND pt."eligiblePartTime" AND NOT pt."eligibleFullTime"
       AND ft."eligibleFullTime" AND NOT ft."eligiblePartTime";

    -- (c) Repoint releases similarly — first drop any that would collide with an FT-row release.
    DELETE FROM "BenefitRelease" br
      USING "GuaranteedBenefit" pt, "GuaranteedBenefit" ft
     WHERE br."guaranteedBenefitId" = pt.id
       AND ft.name = pt.name
       AND pt."eligiblePartTime" AND NOT pt."eligibleFullTime"
       AND ft."eligibleFullTime" AND NOT ft."eligiblePartTime"
       AND EXISTS (SELECT 1 FROM "BenefitRelease" k
                    WHERE k."guaranteedBenefitId" = ft.id AND k."userId" = br."userId" AND k."planYearId" = br."planYearId");
    UPDATE "BenefitRelease" br SET "guaranteedBenefitId" = ft.id
      FROM "GuaranteedBenefit" pt, "GuaranteedBenefit" ft
     WHERE br."guaranteedBenefitId" = pt.id
       AND ft.name = pt.name
       AND pt."eligiblePartTime" AND NOT pt."eligibleFullTime"
       AND ft."eligibleFullTime" AND NOT ft."eligiblePartTime";

    -- (d) Fold PT amounts into the FT (canonical) row and mark it PT-eligible.
    UPDATE "GuaranteedBenefit" ft SET
      "ptBand6mo2y" = pt."ptBand6mo2y", "ptBand2to4y" = pt."ptBand2to4y",
      "ptBand4to7y" = pt."ptBand4to7y", "ptBand7to10y" = pt."ptBand7to10y",
      "eligiblePartTime" = true
      FROM "GuaranteedBenefit" pt
     WHERE pt.name = ft.name
       AND pt."eligiblePartTime" AND NOT pt."eligibleFullTime"
       AND ft."eligibleFullTime" AND NOT ft."eligiblePartTime";

    -- (e) Delete the now-merged PT rows.
    DELETE FROM "GuaranteedBenefit" pt
     WHERE pt."eligiblePartTime" AND NOT pt."eligibleFullTime"
       AND EXISTS (SELECT 1 FROM "GuaranteedBenefit" ft WHERE ft.name = pt.name AND ft."eligibleFullTime");

    -- (f) Retire the legacy per-type columns.
    ALTER TABLE "GuaranteedBenefit"
      DROP COLUMN "employmentType",
      DROP COLUMN "band6mo2y", DROP COLUMN "band2to4y", DROP COLUMN "band4to7y", DROP COLUMN "band7to10y";
  END IF;
END $$;

COMMIT;
