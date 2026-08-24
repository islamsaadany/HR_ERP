-- HR_ERP — Finance: bank confirmations & monthly salary runs (spec 040, 2026-08-24).
--
-- WHY
--   The bank releases money on two signatures: Finance enters a transfer, the CEO confirms it.
--   Nothing connected that to the company's records — the confirmation left no trace against the
--   request it settled. These tables are the notification and the record. They do NOT gate a
--   payment; the gate is the bank's.
--
-- THE ONE STORED FIGURE
--   `PaymentBatch.totalAmount` is frozen when the batch is sent, unlike every other money figure
--   in this module, which is derived on read. The confirmer acts on the number he was emailed,
--   possibly hours earlier; recomputing on read would let the emailed figure and the confirmed
--   figure diverge at exactly the moment that matters.
--
-- THE ENUM CHANGE
--   `PaybackStatus` gains PAYMENT_SUBMITTED, the position spec 039 reserved in the schema
--   comment. `ALTER TYPE … ADD VALUE` cannot run inside a transaction block on older Postgres, so
--   it is issued as its own statement, first, before anything else, and is idempotent via
--   IF NOT EXISTS. Nothing else in this file depends on it committing. See the note at the
--   statement itself for why it inserts before REJECTED rather than before PAID.
--
-- COLUMNS REMOVED
--   Spec 039 reserved `paymentRunId` on "PaybackRequest" and "PettyCashFunding" for this feature.
--   The design landed on a join table ("PaymentBatchItem") instead, which also carries the
--   payee/purpose/amount snapshot, so membership lives there and the reserved columns have no
--   meaning. They were never written by any code — 039 said so explicitly — so dropping them is
--   safe and leaves no dead weight. Guarded, so a re-run is a no-op.
--
-- SAFETY
--   Four new tables, two new enum types, one new enum member, two dropped always-null columns.
--   Fully idempotent. Nothing existing is rewritten.
--
-- THE `updatedAt` DIFF (expected, same as 060/064/067): the new tables carry DEFAULT
--   CURRENT_TIMESTAMP on "updatedAt"; `prisma migrate diff` reports DROP DEFAULT and that is fine.
--
-- ORDER: run after 067.

-- ─── The enum member (must be its own statement) ───────────────────────────

-- BEFORE 'REJECTED', not BEFORE 'PAID': the type as created in 067 runs
-- SUBMITTED, APPROVED, REJECTED, PAID, so inserting before PAID would land the new member AFTER
-- REJECTED and leave the database's order disagreeing with the order schema.prisma declares.
-- Anything that ever sorts by this column would then sort differently from the code that reads
-- it. Verified against a real database both ways before choosing.
ALTER TYPE "PaybackStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_SUBMITTED' BEFORE 'REJECTED';

-- ─── New enum types ────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PaymentBatchType" AS ENUM ('EXPENSES', 'SALARY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentBatchStatus" AS ENUM ('SENT', 'CONFIRMED', 'SENT_BACK', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Who may confirm ───────────────────────────────────────────────────────
--
-- Unlike "LearningManager", holding HR Admin or Super User does NOT confer this implicitly.
-- The CEO's instruction was that payments wait for him and nobody else; an implicit power held by
-- every top-level account would make that untrue. The lock-out that pattern guards against is
-- covered by letting a Super User appoint THEMSELVES, so an empty table is a pause, not a wall.

CREATE TABLE IF NOT EXISTS "TransactionConfirmer" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "appointedById" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransactionConfirmer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionConfirmer_userId_key"
  ON "TransactionConfirmer" ("userId");

-- ─── Batches ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PaymentBatch" (
  "id"             TEXT NOT NULL,
  "reference"      TEXT NOT NULL,
  "type"           "PaymentBatchType" NOT NULL,
  "status"         "PaymentBatchStatus" NOT NULL DEFAULT 'SENT',
  "bankReference"  TEXT,
  "valueDate"      TIMESTAMP(3) NOT NULL,
  "note"           TEXT,
  "totalAmount"    NUMERIC(10,2) NOT NULL,
  "itemCount"      INTEGER NOT NULL,
  "sentById"       TEXT,
  "sentAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById"    TEXT,
  "decidedAt"      TIMESTAMP(3),
  "decisionNote"   TEXT,
  "confirmedTotal" NUMERIC(10,2),
  "salaryMonth"    TIMESTAMP(3),
  "headcount"      INTEGER,
  "isExtraRun"     BOOLEAN NOT NULL DEFAULT false,
  "extraRunReason" TEXT,
  "attachmentUrl"  TEXT,
  "attachmentName" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PaymentBatch_status_idx" ON "PaymentBatch" ("status");
CREATE INDEX IF NOT EXISTS "PaymentBatch_type_idx" ON "PaymentBatch" ("type");
CREATE INDEX IF NOT EXISTS "PaymentBatch_sentAt_idx" ON "PaymentBatch" ("sentAt");

-- ONE ORDINARY SALARY RUN PER MONTH. A second transfer for the same month is possible, but only
-- as an explicitly flagged extra run with a reason — so nobody can quietly pay a month twice.
-- Withdrawn batches are excluded: a withdrawn run never happened.
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentBatch_one_salary_run_per_month"
  ON "PaymentBatch" ("salaryMonth")
  WHERE "type" = 'SALARY' AND "isExtraRun" = false AND "status" <> 'WITHDRAWN';

CREATE TABLE IF NOT EXISTS "PaymentBatchItem" (
  "id"                 TEXT NOT NULL,
  "batchId"            TEXT NOT NULL,
  "paybackRequestId"   TEXT,
  "pettyCashFundingId" TEXT,
  "amountAtSend"       NUMERIC(10,2) NOT NULL,
  "payeeName"          TEXT NOT NULL,
  "purpose"            TEXT NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentBatchItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PaymentBatchItem_batchId_idx" ON "PaymentBatchItem" ("batchId");

-- EXACTLY ONE PARENT — a payable is either a payback request or a float movement, never both and
-- never neither. Same discipline as ExpenseEvidence in 067.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentBatchItem_one_parent') THEN
    ALTER TABLE "PaymentBatchItem" ADD CONSTRAINT "PaymentBatchItem_one_parent"
      CHECK (("paybackRequestId" IS NULL) <> ("pettyCashFundingId" IS NULL));
  END IF;
END $$;

-- ONE PAYABLE, ONE LIVE BATCH. Sending back or withdrawing deletes the items, which is exactly
-- what "released" means — the payable becomes selectable again.
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentBatchItem_one_live_payback"
  ON "PaymentBatchItem" ("paybackRequestId") WHERE "paybackRequestId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentBatchItem_one_live_funding"
  ON "PaymentBatchItem" ("pettyCashFundingId") WHERE "pettyCashFundingId" IS NOT NULL;

-- ─── Reminder log ──────────────────────────────────────────────────────────
--
-- So the daily job cannot pester somebody twice about the same batch on the same day, and so
-- "was he actually told?" is answerable.

CREATE TABLE IF NOT EXISTS "ConfirmationReminderLog" (
  "id"        TEXT NOT NULL,
  "batchId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "sentOn"    DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConfirmationReminderLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConfirmationReminderLog_batchId_userId_sentOn_key"
  ON "ConfirmationReminderLog" ("batchId", "userId", "sentOn");

-- ─── Foreign keys ──────────────────────────────────────────────────────────

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('TransactionConfirmer_userId_fkey',           'TransactionConfirmer', 'userId',             'User',             'CASCADE'),
      ('TransactionConfirmer_appointedById_fkey',    'TransactionConfirmer', 'appointedById',      'User',             'SET NULL'),
      ('PaymentBatch_sentById_fkey',                 'PaymentBatch',         'sentById',           'User',             'SET NULL'),
      ('PaymentBatch_decidedById_fkey',              'PaymentBatch',         'decidedById',        'User',             'SET NULL'),
      ('PaymentBatchItem_batchId_fkey',              'PaymentBatchItem',     'batchId',            'PaymentBatch',     'CASCADE'),
      ('PaymentBatchItem_paybackRequestId_fkey',     'PaymentBatchItem',     'paybackRequestId',   'PaybackRequest',   'SET NULL'),
      ('PaymentBatchItem_pettyCashFundingId_fkey',   'PaymentBatchItem',     'pettyCashFundingId', 'PettyCashFunding', 'SET NULL')
    ) AS t(conname, tbl, col, ref, on_delete)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.conname) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I("id") ON DELETE %s ON UPDATE CASCADE',
        fk.tbl, fk.conname, fk.col, fk.ref, fk.on_delete
      );
    END IF;
  END LOOP;
END $$;

-- ─── Drop the columns spec 039 reserved but this design did not use ────────
--
-- Membership landed in "PaymentBatchItem", which also holds the payee/purpose/amount snapshot.
-- These columns were never written by any code (039 documented them as reserved and unwritten),
-- so they are always NULL and nothing reads them.

ALTER TABLE "PaybackRequest" DROP COLUMN IF EXISTS "paymentRunId";
ALTER TABLE "PettyCashFunding" DROP COLUMN IF EXISTS "paymentRunId";
