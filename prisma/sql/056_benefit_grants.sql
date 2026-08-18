-- 056 — Per-person guaranteed-benefit grants (spec 036).
-- Paste into Neon's SQL editor after 055. Idempotent.
--
-- A grant names ONE employee on ONE guaranteed benefit for ONE plan year, with an explicit
-- Super-User-typed amount. The granted person then uses the completely normal
-- request → approve → pay flow; a grant never widens general eligibility and expires with
-- the cycle. Replaces the reverted Release-sheet typed-amount override (2026-08-18).

CREATE TABLE IF NOT EXISTS "GuaranteedBenefitGrant" (
  "id"                  TEXT NOT NULL,
  "guaranteedBenefitId" TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "planYearId"          TEXT NOT NULL,
  "amount"              INTEGER NOT NULL,
  "grantedById"         TEXT,
  "grantedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuaranteedBenefitGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GuaranteedBenefitGrant_userId_guaranteedBenefitId_planYearI_key"
  ON "GuaranteedBenefitGrant"("userId", "guaranteedBenefitId", "planYearId");
CREATE INDEX IF NOT EXISTS "GuaranteedBenefitGrant_planYearId_idx"
  ON "GuaranteedBenefitGrant"("planYearId");

DO $$ BEGIN
  ALTER TABLE "GuaranteedBenefitGrant"
    ADD CONSTRAINT "GuaranteedBenefitGrant_guaranteedBenefitId_fkey"
    FOREIGN KEY ("guaranteedBenefitId") REFERENCES "GuaranteedBenefit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GuaranteedBenefitGrant"
    ADD CONSTRAINT "GuaranteedBenefitGrant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GuaranteedBenefitGrant"
    ADD CONSTRAINT "GuaranteedBenefitGrant_planYearId_fkey"
    FOREIGN KEY ("planYearId") REFERENCES "PlanYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GuaranteedBenefitGrant"
    ADD CONSTRAINT "GuaranteedBenefitGrant_grantedById_fkey"
    FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
