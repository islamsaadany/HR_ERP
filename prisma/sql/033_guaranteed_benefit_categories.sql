-- Spec 021 follow-up — give guaranteed benefits a real `category` (aligned with the flexible
-- benefit categories), instead of borrowing their `note` (which is a description). Run after 032.
BEGIN;

ALTER TABLE "GuaranteedBenefit" ADD COLUMN IF NOT EXISTS "category" text;

-- Match to existing flexible categories where possible; two new categories where nothing fits.
UPDATE "GuaranteedBenefit" SET "category" = 'Life & family'         WHERE name = 'Marriage allowance';
UPDATE "GuaranteedBenefit" SET "category" = 'Life & family'         WHERE name = 'Special events';
UPDATE "GuaranteedBenefit" SET "category" = 'Personal growth'       WHERE name = 'Professional development';
UPDATE "GuaranteedBenefit" SET "category" = 'Allowances'            WHERE name = 'Summer allowance';
UPDATE "GuaranteedBenefit" SET "category" = 'Financial support'     WHERE name = 'Loans';

COMMIT;
