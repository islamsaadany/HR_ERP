-- HR_ERP — Medical premium recoveries for Finance (spec 030).
--
-- WHY
--   Spec 027 stops charging a departed employee's pool for cover they won't use, but nothing
--   follows the money the company already paid the insurer for that cover. This adds Finance's
--   to-do: chase it, then record what actually came back. The residual is a real cost of the
--   departure — the point is that it becomes a known number instead of an invisible one.
--
-- SAFETY
--   Purely additive: one enum, one table. Nothing existing is read or changed, and NO recoveries
--   are backfilled for employees who left before this ships — inventing history for departures
--   already settled offline would hand Finance phantom work it cannot action.
--
-- ORDER: run after 047.

DO $$ BEGIN
  CREATE TYPE "MedicalRecoveryStatus" AS ENUM ('OPEN', 'RECOVERED', 'WRITTEN_OFF');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "MedicalRecovery" (
  id                  text PRIMARY KEY,
  "commitmentId"      text NOT NULL,
  "userId"            text NOT NULL,
  "policyYearId"      text NOT NULL,
  -- Null when HR hasn't recorded a last day. The row then reads "needs leave date" rather than
  -- showing a confidently wrong figure computed from nothing.
  "coverEndedOn"      timestamp(3),
  -- Frozen at creation: a later premium edit must not restate a figure Finance may already have
  -- claimed against, for the same reason a charge on a closed cycle is never rewritten.
  "premiumAtCreation" integer NOT NULL,
  "expectedMonths"    integer NOT NULL DEFAULT 0,
  "expectedAmount"    integer NOT NULL DEFAULT 0,
  status              "MedicalRecoveryStatus" NOT NULL DEFAULT 'OPEN',
  "recoveredAmount"   integer,
  "recoveredOn"       timestamp(3),
  shortfall           integer,
  reason              text,
  "settledById"       text,
  "settledAt"         timestamp(3),
  "createdAt"         timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One recovery per commitment. This uniqueness is what makes the reconcile pass idempotent —
-- it can run on every Finance page load without ever creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS "MedicalRecovery_commitmentId_key" ON "MedicalRecovery"("commitmentId");
CREATE INDEX IF NOT EXISTS "MedicalRecovery_status_idx" ON "MedicalRecovery"(status);

DO $$ BEGIN
  ALTER TABLE "MedicalRecovery" ADD CONSTRAINT "MedicalRecovery_commitmentId_fkey"
    FOREIGN KEY ("commitmentId") REFERENCES "MedicalCommitment"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MedicalRecovery" ADD CONSTRAINT "MedicalRecovery_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MedicalRecovery" ADD CONSTRAINT "MedicalRecovery_policyYearId_fkey"
    FOREIGN KEY ("policyYearId") REFERENCES "MedicalPolicyYear"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MedicalRecovery" ADD CONSTRAINT "MedicalRecovery_settledById_fkey"
    FOREIGN KEY ("settledById") REFERENCES "User"(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
