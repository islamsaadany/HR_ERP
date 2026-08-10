-- 031 — Retire the legacy claim statuses (spec 020 cleanup)
-- Reduces the ClaimStatus enum to its final four values —
-- SUBMITTED | APPROVED | REIMBURSED | REJECTED — by swapping the enum type, and
-- sets the BenefitClaim.status default to SUBMITTED.
--
-- Run ONCE, AFTER migration 030 (which added the new values and backfilled rows).
-- The status::text comparisons make the backfill safe to re-run (they don't require
-- the legacy value to still exist in the enum).

-- 1) Safety backfill — move any stragglers off the legacy values first.
UPDATE "BenefitClaim" SET status = 'SUBMITTED'  WHERE status::text = 'PENDING';
UPDATE "BenefitClaim" SET status = 'REIMBURSED' WHERE status::text = 'RELEASED';

-- 2) Swap the enum to the final four values.
DROP TYPE IF EXISTS "ClaimStatus_old";
ALTER TYPE "ClaimStatus" RENAME TO "ClaimStatus_old";
CREATE TYPE "ClaimStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REIMBURSED', 'REJECTED');

ALTER TABLE "BenefitClaim" ALTER COLUMN status DROP DEFAULT;
ALTER TABLE "BenefitClaim"
  ALTER COLUMN status TYPE "ClaimStatus" USING status::text::"ClaimStatus";
ALTER TABLE "BenefitClaim" ALTER COLUMN status SET DEFAULT 'SUBMITTED';

DROP TYPE "ClaimStatus_old";
