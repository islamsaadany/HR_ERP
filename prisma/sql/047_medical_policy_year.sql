-- HR_ERP — Medical policy year + per-cycle premium charging (spec 027).
--
-- WHY
--   The insurance term runs 1 Jun -> 31 May while the benefits cycle is the calendar year, so a
--   premium committed in June buys cover reaching into the NEXT cycle. Charging the whole premium
--   to the cycle it was committed in makes the 2026 pool absorb twelve months of premium for seven
--   months of cover. This splits it: each cycle's pool absorbs only its months.
--
-- SAFETY
--   Additive and idempotent. No premium is recomputed and no commitment figure moves — every
--   existing commitment keeps its exact premium and gains ONE charge equal to it, against the
--   plan year it was already counted in. So the pool an employee sees today does not change until
--   HR configures a real policy term.
--
-- ORDER: run after 046.

-- 1. Charge lifecycle. SCHEDULED -> APPLIED, or SCHEDULED -> CANCELLED when cover ended first.
--    CANCELLED is NOT a liability: premium paid in advance for cover after an employee's leave
--    date is recovered from the insurer, so nothing is owed by anyone.
DO $$ BEGIN
  CREATE TYPE "MedicalChargeStatus" AS ENUM ('SCHEDULED', 'APPLIED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. The insurance contract's own term. Length is whatever HR sets — nothing assumes 12 months.
CREATE TABLE IF NOT EXISTS "MedicalPolicyYear" (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  "startDate" timestamp(3) NOT NULL,
  "endDate"   timestamp(3) NOT NULL,
  status      "PlanYearStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. A commitment belongs to the policy term it buys, not the cycle it was made in.
--    Nullable so this migration can backfill; every new commitment sets it.
ALTER TABLE "MedicalCommitment" ADD COLUMN IF NOT EXISTS "policyYearId" text;

-- 4. The per-cycle share. THIS is what draws against a pool.
CREATE TABLE IF NOT EXISTS "MedicalCycleCharge" (
  id              text PRIMARY KEY,
  "commitmentId"  text NOT NULL,
  "planYearId"    text NOT NULL,
  "policyYearId"  text NOT NULL,
  amount          integer NOT NULL,
  "overlapMonths" integer NOT NULL,
  status          "MedicalChargeStatus" NOT NULL DEFAULT 'SCHEDULED',
  "appliedAt"     timestamp(3),
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Constraints added separately so a re-run doesn't fail on an existing table.
DO $$ BEGIN
  ALTER TABLE "MedicalCycleCharge"
    ADD CONSTRAINT "MedicalCycleCharge_commitmentId_fkey"
    FOREIGN KEY ("commitmentId") REFERENCES "MedicalCommitment"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MedicalCycleCharge"
    ADD CONSTRAINT "MedicalCycleCharge_planYearId_fkey"
    FOREIGN KEY ("planYearId") REFERENCES "PlanYear"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MedicalCycleCharge"
    ADD CONSTRAINT "MedicalCycleCharge_policyYearId_fkey"
    FOREIGN KEY ("policyYearId") REFERENCES "MedicalPolicyYear"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MedicalCommitment"
    ADD CONSTRAINT "MedicalCommitment_policyYearId_fkey"
    FOREIGN KEY ("policyYearId") REFERENCES "MedicalPolicyYear"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "MedicalCycleCharge_commitmentId_planYearId_key"
  ON "MedicalCycleCharge"("commitmentId", "planYearId");

BEGIN;

-- 5. Backfill a policy term for the commitments that already exist, taking its dates from the
--    plan year they were committed in. This is the no-op case by construction: a term equal to
--    the cycle overlaps it entirely, so the split yields one charge for the whole premium and
--    nobody's pool moves. Real terms are configured by HR afterwards.
INSERT INTO "MedicalPolicyYear" (id, name, "startDate", "endDate", status)
SELECT
  'mpy_legacy_' || py.id,
  py.name || ' (pre-policy-year)',
  COALESCE(py."startDate", date_trunc('year', py."createdAt")),
  COALESCE(py."endDate",   date_trunc('year', py."createdAt") + interval '1 year' - interval '1 day'),
  py.status
FROM "PlanYear" py
WHERE EXISTS (SELECT 1 FROM "MedicalCommitment" mc WHERE mc."planYearId" = py.id)
ON CONFLICT (id) DO NOTHING;

UPDATE "MedicalCommitment" mc
   SET "policyYearId" = 'mpy_legacy_' || mc."planYearId"
 WHERE mc."policyYearId" IS NULL;

-- 6. One charge per existing commitment, equal to its premium, against its original plan year.
--    Marked APPLIED because that money is already being counted against that cycle's pool today.
INSERT INTO "MedicalCycleCharge"
  (id, "commitmentId", "planYearId", "policyYearId", amount, "overlapMonths", status, "appliedAt")
SELECT
  'mcc_legacy_' || mc.id,
  mc.id,
  mc."planYearId",
  mc."policyYearId",
  mc.premium,
  12,
  'APPLIED'::"MedicalChargeStatus",
  mc."committedAt"
FROM "MedicalCommitment" mc
WHERE mc."policyYearId" IS NOT NULL
ON CONFLICT ("commitmentId", "planYearId") DO NOTHING;

-- 7. Re-key: commit once per POLICY TERM, not per benefits cycle. Dropping the old constraint is
--    what allows a renewal to be a distinct commitment rather than a collision.
ALTER TABLE "MedicalCommitment" DROP CONSTRAINT IF EXISTS "MedicalCommitment_userId_planYearId_key";
DROP INDEX IF EXISTS "MedicalCommitment_userId_planYearId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MedicalCommitment_userId_policyYearId_key"
  ON "MedicalCommitment"("userId", "policyYearId");

COMMIT;
