-- 076 — Releasing a cycle's incentive payments into Finance (spec 009 FR-006g, 2026-08-26).
--
-- Idempotent: apply-sql.mjs records each file on success, but a file may be retried before
-- it ever succeeds, so every statement here is safe to run twice.
--
-- Four things:
--   1. Employee ID on the incentive People sheet — what a payment is matched on.
--   2. BusinessUnitHead — who may RELEASE for a unit, twin of TransactionConfirmer.
--   3. IncentivePayout — one released payment, and its link into Finance's queue.
--   4. The editable incentive payment message on the notification settings singleton.

-- ── 1. Employee ID on the People sheet ─────────────────────────────────────
ALTER TABLE "IncentivePerson" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;

-- ── 2. Who may release, per business unit ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "BusinessUnitHead" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "appointedById"  TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Constraints added separately so a re-run over a half-built table converges rather than
-- failing on the CREATE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessUnitHead_userId_fkey') THEN
    ALTER TABLE "BusinessUnitHead"
      ADD CONSTRAINT "BusinessUnitHead_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessUnitHead_businessUnitId_fkey') THEN
    ALTER TABLE "BusinessUnitHead"
      ADD CONSTRAINT "BusinessUnitHead_businessUnitId_fkey"
      FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessUnitHead_appointedById_fkey') THEN
    ALTER TABLE "BusinessUnitHead"
      ADD CONSTRAINT "BusinessUnitHead_appointedById_fkey"
      FOREIGN KEY ("appointedById") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessUnitHead_userId_businessUnitId_key"
  ON "BusinessUnitHead" ("userId", "businessUnitId");
CREATE INDEX IF NOT EXISTS "BusinessUnitHead_businessUnitId_idx"
  ON "BusinessUnitHead" ("businessUnitId");

-- ── 3. Released payments ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IncentivePayoutKind') THEN
    CREATE TYPE "IncentivePayoutKind" AS ENUM ('SCHEME_FEES', 'COMMISSION');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "IncentivePayout" (
  "id"             TEXT PRIMARY KEY,
  "cycleId"        TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "personName"     TEXT NOT NULL,
  "kind"           "IncentivePayoutKind" NOT NULL,
  "amount"         DECIMAL(10,2) NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "releasedById"   TEXT,
  "releasedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncentivePayout_cycleId_fkey') THEN
    ALTER TABLE "IncentivePayout"
      ADD CONSTRAINT "IncentivePayout_cycleId_fkey"
      FOREIGN KEY ("cycleId") REFERENCES "IncentiveCycle"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncentivePayout_userId_fkey') THEN
    ALTER TABLE "IncentivePayout"
      ADD CONSTRAINT "IncentivePayout_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncentivePayout_businessUnitId_fkey') THEN
    ALTER TABLE "IncentivePayout"
      ADD CONSTRAINT "IncentivePayout_businessUnitId_fkey"
      FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncentivePayout_releasedById_fkey') THEN
    ALTER TABLE "IncentivePayout"
      ADD CONSTRAINT "IncentivePayout_releasedById_fkey"
      FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- One release per person per half per cycle. This is the backstop behind the screen not
-- offering an already-released line: two people pressing at the same moment cannot pay
-- the same amount twice.
CREATE UNIQUE INDEX IF NOT EXISTS "IncentivePayout_cycleId_userId_kind_key"
  ON "IncentivePayout" ("cycleId", "userId", "kind");
CREATE INDEX IF NOT EXISTS "IncentivePayout_cycleId_idx" ON "IncentivePayout" ("cycleId");

-- The fourth kind of payable in Finance's one queue.
ALTER TABLE "PaymentBatchItem" ADD COLUMN IF NOT EXISTS "incentivePayoutId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentBatchItem_incentivePayoutId_fkey') THEN
    ALTER TABLE "PaymentBatchItem"
      ADD CONSTRAINT "PaymentBatchItem_incentivePayoutId_fkey"
      FOREIGN KEY ("incentivePayoutId") REFERENCES "IncentivePayout"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ── 4. The editable payment message ────────────────────────────────────────
-- NULL means "use the built-in wording", which lives in code. Deliberately not seeded with
-- the default text: a row holding a copy would silently stop tracking the code the day the
-- default is improved.
ALTER TABLE "NotificationSettings" ADD COLUMN IF NOT EXISTS "incentiveEmailSubject" TEXT;
ALTER TABLE "NotificationSettings" ADD COLUMN IF NOT EXISTS "incentiveEmailHeading" TEXT;
ALTER TABLE "NotificationSettings" ADD COLUMN IF NOT EXISTS "incentiveEmailBody"    TEXT;
ALTER TABLE "NotificationSettings" ADD COLUMN IF NOT EXISTS "incentiveEmailFooter"  TEXT;
