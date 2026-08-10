-- 030 — Claim reimbursement workflow foundation (spec 020)
-- Additive & non-breaking: adds the new Finance role, the staged claim statuses,
-- the Finance payment columns on BenefitClaim, and the NotificationSettings row.
-- Existing rows are backfilled to the new status vocabulary. The legacy PENDING/
-- RELEASED enum values are LEFT IN PLACE (retired later) so nothing breaks mid-migration.
--
-- Run once in the Neon SQL editor. Postgres requires ALTER TYPE ... ADD VALUE to run
-- OUTSIDE a transaction, so run this file as-is (the editor autocommits each statement);
-- do not wrap it in BEGIN/COMMIT.

-- 1) New role
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FINANCE';

-- 2) New claim statuses (legacy PENDING/RELEASED kept for now)
ALTER TYPE "ClaimStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "ClaimStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ClaimStatus" ADD VALUE IF NOT EXISTS 'REIMBURSED';

-- 3) Finance payment columns on BenefitClaim
ALTER TABLE "BenefitClaim" ADD COLUMN IF NOT EXISTS "paidById" TEXT;
ALTER TABLE "BenefitClaim" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "BenefitClaim" ADD COLUMN IF NOT EXISTS "transferDate" TIMESTAMP(3);
ALTER TABLE "BenefitClaim" ADD COLUMN IF NOT EXISTS "amountTransferred" INTEGER;
-- FK for paidById → User (matches Prisma onDelete: SetNull). Guarded so re-runs are safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BenefitClaim_paidById_fkey'
  ) THEN
    ALTER TABLE "BenefitClaim"
      ADD CONSTRAINT "BenefitClaim_paidById_fkey"
      FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 4) NotificationSettings singleton (non-secret config)
CREATE TABLE IF NOT EXISTS "NotificationSettings" (
  "id" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "hrInbox" TEXT,
  "financeInbox" TEXT,
  "fromName" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "NotificationSettings" ("id", "emailEnabled")
VALUES ('singleton', false)
ON CONFLICT ("id") DO NOTHING;

-- NOTE: The status backfill (PENDING→SUBMITTED, RELEASED→REIMBURSED) is intentionally
-- a SEPARATE statement so it can be committed after the ADD VALUE statements above
-- (Postgres forbids using a newly-added enum value in the same transaction). If your
-- editor runs the whole file in one transaction, run this UPDATE as a second pass:
UPDATE "BenefitClaim" SET status = 'SUBMITTED'  WHERE status = 'PENDING';
UPDATE "BenefitClaim" SET status = 'REIMBURSED' WHERE status = 'RELEASED';
