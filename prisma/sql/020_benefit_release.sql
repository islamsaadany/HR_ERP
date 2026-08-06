-- HR_ERP — HR bulk-release of a fixed-allowance guaranteed benefit (spec 013).
-- A per-employee record that a benefit was released for a plan year. Presence of a row =
-- "Released"; absence = "Not released". `amount` snapshots the band-derived figure at release.
-- Salary-driven benefits (Loans) are never released here. Idempotent, runner-applied.
BEGIN;

CREATE TABLE IF NOT EXISTS "BenefitRelease" (
  "id"                  text PRIMARY KEY,
  "userId"              text NOT NULL,
  "guaranteedBenefitId" text NOT NULL,
  "planYearId"          text NOT NULL,
  "amount"              integer NOT NULL,
  "releasedAt"          timestamp(3) NOT NULL DEFAULT now(),
  "releasedById"        text,
  CONSTRAINT "BenefitRelease_userId_fkey"              FOREIGN KEY ("userId")              REFERENCES "User"("id")              ON DELETE CASCADE,
  CONSTRAINT "BenefitRelease_guaranteedBenefitId_fkey" FOREIGN KEY ("guaranteedBenefitId") REFERENCES "GuaranteedBenefit"("id") ON DELETE CASCADE,
  CONSTRAINT "BenefitRelease_planYearId_fkey"          FOREIGN KEY ("planYearId")          REFERENCES "PlanYear"("id")          ON DELETE CASCADE,
  CONSTRAINT "BenefitRelease_releasedById_fkey"        FOREIGN KEY ("releasedById")        REFERENCES "User"("id")              ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "BenefitRelease_userId_guaranteedBenefitId_planYearId_key"
  ON "BenefitRelease" ("userId","guaranteedBenefitId","planYearId");
CREATE INDEX IF NOT EXISTS "BenefitRelease_guaranteedBenefitId_planYearId_idx"
  ON "BenefitRelease" ("guaranteedBenefitId","planYearId");

COMMIT;
