-- HR_ERP — Per-person pool-ceiling exceptions (2026-08-20, follow-up to the pool-invariant fix).
--
-- WHY
--   The ceiling is now enforced on every write path, so a NEW overrun cannot be created. What
--   remains possible by design is the ceiling SHRINKING under money already spent: HR lowers a
--   configured amount, corrects an employment type or start date, or re-dates a cycle. Those must
--   stay possible, so the resulting overrun is surfaced on the Benefits report and resolved here.
--
--   RAISED   `amount` becomes that person's ceiling for that cycle (Super User only — it authorises
--            spend past a money rule).
--   ACCEPTED the numbers stand as they are; the row stops being flagged. A record, not a change.
--
-- SAFETY
--   Additive only: one new enum, one new table, no change to any existing column or row. Idempotent
--   (IF NOT EXISTS throughout), so a retry or a redeploy is a no-op.
--
-- ORDER: run after 058.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PoolExceptionKind') THEN
    CREATE TYPE "PoolExceptionKind" AS ENUM ('RAISED', 'ACCEPTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PoolCeilingException" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "planYearId"  TEXT NOT NULL,
  "kind"        "PoolExceptionKind" NOT NULL,
  "amount"      INTEGER,
  "reason"      TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PoolCeilingException_pkey" PRIMARY KEY ("id")
);

-- One decision per person per cycle; a later decision replaces the earlier one.
CREATE UNIQUE INDEX IF NOT EXISTS "PoolCeilingException_userId_planYearId_key"
  ON "PoolCeilingException" ("userId", "planYearId");
CREATE INDEX IF NOT EXISTS "PoolCeilingException_planYearId_idx"
  ON "PoolCeilingException" ("planYearId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PoolCeilingException_userId_fkey') THEN
    ALTER TABLE "PoolCeilingException"
      ADD CONSTRAINT "PoolCeilingException_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PoolCeilingException_planYearId_fkey') THEN
    ALTER TABLE "PoolCeilingException"
      ADD CONSTRAINT "PoolCeilingException_planYearId_fkey"
      FOREIGN KEY ("planYearId") REFERENCES "PlanYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PoolCeilingException_createdById_fkey') THEN
    ALTER TABLE "PoolCeilingException"
      ADD CONSTRAINT "PoolCeilingException_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
