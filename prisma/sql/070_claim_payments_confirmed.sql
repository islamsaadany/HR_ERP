-- HR_ERP — Benefit-claim reimbursements travel the confirmation path too (spec 041, 2026-08-24).
--
-- WHY
--   The CEO: "previously the employee would receive the email of their benefit or any transaction
--   when the finance confirm, but actually this notification should be connected to my financial
--   confirmation to avoid confusion."
--
--   He is right, and it is not a small point. Since spec 020, a benefit claim became REIMBURSED and
--   the employee was emailed "you have been reimbursed" the moment FINANCE recorded a transfer —
--   but at that moment the money has not moved. It moves when he confirms it at the bank. Anyone
--   emailed in between has been told something untrue, and then asks Finance where their money is.
--
--   So a claim reimbursement becomes the third kind of payable that can sit in a submission,
--   alongside payback requests and petty cash float movements. The employee is told when the CEO
--   marks the submission complete, and not before.
--
-- WHY A SEPARATE FILE FROM 068
--   068 is already committed and may have been applied by a preview deployment. An applied file is
--   recorded in _sql_migrations and never runs again, so editing it would silently lose this
--   change. A new file always runs.
--
-- SAFETY
--   One enum member, one nullable column, one constraint swap, one index, one foreign key. No data
--   is rewritten and no existing row changes meaning: claims that are already REIMBURSED stay
--   exactly as they are. Fully idempotent.
--
-- ORDER: run after 068.

-- ─── The claim's new waiting state ─────────────────────────────────────────
--
-- BEFORE 'REIMBURSED' so the database's order matches the order schema.prisma declares
-- (SUBMITTED → APPROVED → PAYMENT_SUBMITTED → REIMBURSED → REJECTED). The same trap as in 068:
-- picking the wrong neighbour leaves the two disagreeing.

ALTER TYPE "ClaimStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_SUBMITTED' BEFORE 'REIMBURSED';

-- ─── A submission item may now point at a benefit claim ────────────────────

ALTER TABLE "PaymentBatchItem" ADD COLUMN IF NOT EXISTS "benefitClaimId" TEXT;

CREATE INDEX IF NOT EXISTS "PaymentBatchItem_benefitClaimId_idx"
  ON "PaymentBatchItem" ("benefitClaimId");

-- One claim can be awaiting confirmation only once, exactly as for the other two kinds.
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentBatchItem_one_live_claim"
  ON "PaymentBatchItem" ("benefitClaimId") WHERE "benefitClaimId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentBatchItem_benefitClaimId_fkey') THEN
    ALTER TABLE "PaymentBatchItem" ADD CONSTRAINT "PaymentBatchItem_benefitClaimId_fkey"
      FOREIGN KEY ("benefitClaimId") REFERENCES "BenefitClaim"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Exactly one parent, now out of three ──────────────────────────────────
--
-- The old two-way constraint is replaced rather than amended: a new name means the swap is
-- unambiguous on a re-run, and the old one cannot linger contradicting the new one.

ALTER TABLE "PaymentBatchItem" DROP CONSTRAINT IF EXISTS "PaymentBatchItem_one_parent";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentBatchItem_exactly_one_parent') THEN
    ALTER TABLE "PaymentBatchItem" ADD CONSTRAINT "PaymentBatchItem_exactly_one_parent"
      CHECK (
        ("paybackRequestId"   IS NOT NULL)::int +
        ("pettyCashFundingId" IS NOT NULL)::int +
        ("benefitClaimId"     IS NOT NULL)::int = 1
      );
  END IF;
END $$;

-- ─── Repair: a database where the FIRST version of 068 already ran ─────────
--
-- 068 was committed, then the CEO corrected the vocabulary and its column and enum names changed
-- (sentAt → submittedAt, SENT → SUBMITTED, and so on). Any database that had already applied the
-- first version — a preview deployment, a colleague's local copy — will never see those names,
-- because `CREATE TABLE IF NOT EXISTS` skips a table that exists and the runner never re-runs an
-- applied file. Prisma queries by column name, so such a database would throw at runtime.
--
-- These renames are guarded on the old name existing, so they are a no-op on a fresh database and
-- a repair on a stale one. Convergence beats assuming nobody deployed the branch.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'PaymentBatch' AND column_name = 'sentById') THEN
    ALTER TABLE "PaymentBatch" RENAME COLUMN "sentById" TO "submittedById";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'PaymentBatch' AND column_name = 'sentAt') THEN
    ALTER TABLE "PaymentBatch" RENAME COLUMN "sentAt" TO "submittedAt";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'PaymentBatchItem' AND column_name = 'amountAtSend') THEN
    ALTER TABLE "PaymentBatchItem" RENAME COLUMN "amountAtSend" TO "amountAtSubmission";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PaymentBatch_submittedAt_idx" ON "PaymentBatch" ("submittedAt");
DROP INDEX IF EXISTS "PaymentBatch_sentAt_idx";

-- The foreign key kept its old name on such a database. Postgres does not care and neither does
-- Prisma, but a constraint called "sentById_fkey" on a column called "submittedById" is exactly
-- the sort of thing that wastes somebody's afternoon later.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentBatch_sentById_fkey') THEN
    ALTER TABLE "PaymentBatch" RENAME CONSTRAINT "PaymentBatch_sentById_fkey"
      TO "PaymentBatch_submittedById_fkey";
  END IF;
END $$;

-- The status values carried the wrong verb too. RENAME VALUE keeps every existing row valid.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'PaymentBatchStatus' AND e.enumlabel = 'SENT') THEN
    ALTER TYPE "PaymentBatchStatus" RENAME VALUE 'SENT' TO 'SUBMITTED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'PaymentBatchStatus' AND e.enumlabel = 'CONFIRMED') THEN
    ALTER TYPE "PaymentBatchStatus" RENAME VALUE 'CONFIRMED' TO 'COMPLETE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'PaymentBatchStatus' AND e.enumlabel = 'SENT_BACK') THEN
    ALTER TYPE "PaymentBatchStatus" RENAME VALUE 'SENT_BACK' TO 'RETURNED';
  END IF;
END $$;

-- NOT repaired, deliberately: on such a database `PaybackStatus.PAYMENT_SUBMITTED` sits after
-- REJECTED rather than before it, because the first 068 inserted it BEFORE 'PAID'. Only the sort
-- order differs; every value is present and every row is valid. Correcting it would mean
-- recreating the type and rewriting a live column — real risk, for a cosmetic difference, on a
-- database that by definition is a disposable preview. A fresh database gets the right order.
