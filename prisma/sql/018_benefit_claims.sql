-- HR_ERP — Benefits claims & reimbursement (spec 007 Phase-2).
-- Adds a claim policy (claimType) to guaranteed + basket benefits and a BenefitClaim
-- table (partial claims, proof upload, HR review → release). Idempotent, runner-applied.
BEGIN;

DO $$ BEGIN CREATE TYPE "ClaimType" AS ENUM ('NONE','NOTE','PROOF'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ClaimStatus" AS ENUM ('PENDING','RELEASED','REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "GuaranteedBenefit"  ADD COLUMN IF NOT EXISTS "claimType" "ClaimType" NOT NULL DEFAULT 'NONE';
ALTER TABLE "BenefitCatalogItem" ADD COLUMN IF NOT EXISTS "claimType" "ClaimType" NOT NULL DEFAULT 'PROOF';

CREATE TABLE IF NOT EXISTS "BenefitClaim" (
  "id"                  text PRIMARY KEY,
  "userId"              text NOT NULL,
  "planYearId"          text NOT NULL,
  "guaranteedBenefitId" text,
  "catalogItemId"       text,
  "amount"              integer NOT NULL,
  "note"                text,
  "proofUrl"            text,
  "proofName"           text,
  "status"              "ClaimStatus" NOT NULL DEFAULT 'PENDING',
  "decisionNote"        text,
  "reviewedById"        text,
  "createdAt"           timestamp(3) NOT NULL DEFAULT now(),
  "decidedAt"           timestamp(3),
  CONSTRAINT "BenefitClaim_userId_fkey"              FOREIGN KEY ("userId")              REFERENCES "User"("id")               ON DELETE CASCADE,
  CONSTRAINT "BenefitClaim_planYearId_fkey"          FOREIGN KEY ("planYearId")          REFERENCES "PlanYear"("id")           ON DELETE CASCADE,
  CONSTRAINT "BenefitClaim_guaranteedBenefitId_fkey" FOREIGN KEY ("guaranteedBenefitId") REFERENCES "GuaranteedBenefit"("id")  ON DELETE CASCADE,
  CONSTRAINT "BenefitClaim_catalogItemId_fkey"       FOREIGN KEY ("catalogItemId")       REFERENCES "BenefitCatalogItem"("id") ON DELETE CASCADE,
  CONSTRAINT "BenefitClaim_reviewedById_fkey"        FOREIGN KEY ("reviewedById")        REFERENCES "User"("id")               ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "BenefitClaim_userId_planYearId_idx" ON "BenefitClaim" ("userId","planYearId");
CREATE INDEX IF NOT EXISTS "BenefitClaim_status_idx"            ON "BenefitClaim" ("status");

-- Sensible defaults (admin can change in Admin → Benefits → Claim requirements):
-- Special events needs an optional note; medical cover needs no claim.
UPDATE "GuaranteedBenefit"  SET "claimType" = 'NOTE' WHERE "name" ILIKE '%special event%';
UPDATE "BenefitCatalogItem" SET "claimType" = 'NONE' WHERE "isMedical" = true;

COMMIT;
