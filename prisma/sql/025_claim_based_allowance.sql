-- 025_claim_based_allowance.sql
-- Spec 018: Benefits claim-based living allowance.
--
-- CLEAN WIPE (confirmed test data): removes the one-shot basket model and introduces a dedicated
-- medical-commitment record. Flexible benefits are now claimed directly against catalog items via
-- BenefitClaim (unchanged). Employees re-commit medical after this runs; HR re-enters any real prior
-- claims via the manual claim-entry flow (spec 016).
--
-- Paste into Neon's SQL editor and run as a single script.

BEGIN;

-- 1) Remove the old basket model. Dropping these tables wipes all selection/allocation data.
DROP TABLE IF EXISTS "SelectionLine";
DROP TABLE IF EXISTS "BenefitSelection";

-- 2) Drop the now-unused enum type.
DROP TYPE IF EXISTS "SelectionStatus";

-- 3) New dedicated medical-commitment record (one per employee per plan year).
CREATE TABLE "MedicalCommitment" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "planYearId"      TEXT NOT NULL,
  "spouse"          BOOLEAN NOT NULL DEFAULT false,
  "childrenUnder18" INTEGER NOT NULL DEFAULT 0,
  "children18Plus"  INTEGER NOT NULL DEFAULT 0,
  "premium"         INTEGER NOT NULL,
  "committedById"   TEXT,
  "committedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MedicalCommitment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MedicalCommitment_userId_planYearId_key"
  ON "MedicalCommitment" ("userId", "planYearId");

ALTER TABLE "MedicalCommitment"
  ADD CONSTRAINT "MedicalCommitment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MedicalCommitment"
  ADD CONSTRAINT "MedicalCommitment_planYearId_fkey"
  FOREIGN KEY ("planYearId") REFERENCES "PlanYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MedicalCommitment"
  ADD CONSTRAINT "MedicalCommitment_committedById_fkey"
  FOREIGN KEY ("committedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
