-- HR_ERP — Refine benefit claim policy + add employee monthly salary (for Loans).
-- Idempotent, runner-applied.
BEGIN;

-- Monthly salary (HR-private) — drives the Loans benefit ceiling (up to one month).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "monthlySalary" integer;

-- Guaranteed benefits default to "Request" (note only, full amount) going forward.
ALTER TABLE "GuaranteedBenefit" ALTER COLUMN "claimType" SET DEFAULT 'NOTE';

-- Reset the policy to the agreed model:
--   • all guaranteed → Request (note), EXCEPT Professional development → Proof
--   • medical → Automatic (no claim); other basket items stay Proof
UPDATE "GuaranteedBenefit"  SET "claimType" = 'NOTE'  WHERE "claimType" <> 'NOTE';
UPDATE "GuaranteedBenefit"  SET "claimType" = 'PROOF' WHERE "name" ILIKE '%professional development%';
UPDATE "BenefitCatalogItem" SET "claimType" = 'NONE'  WHERE "isMedical" = true;

COMMIT;
