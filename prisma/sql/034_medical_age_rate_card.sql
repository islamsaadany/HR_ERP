-- Spec 023 — Age-banded per-person medical rate card (Tier 1).
-- Run after 033. Idempotent and safe to re-run.
--   1) Dependant gains a kind (CHILD/SPOUSE) so a covered spouse is a dependant priced by age.
--   2) MedicalRateBand replaces the relationship-based MedicalRateCard (age bands, decimal premiums).
--   3) MedicalCoveredPerson snapshots each covered person on a commitment (locked at commit).
--   4) MedicalCommitment's legacy self/spouse/child count columns become nullable (retained for history).
--   5) MedicalRateCard is dropped (after the band card is seeded).
BEGIN;

-- ── 1) Dependant kind ───────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "DependantKind" AS ENUM ('CHILD', 'SPOUSE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Dependant"
  ADD COLUMN IF NOT EXISTS "kind" "DependantKind" NOT NULL DEFAULT 'CHILD';

-- ── 2) Age-banded rate card + Tier-1 seed ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MedicalRateBand" (
  "id"            text PRIMARY KEY,
  "tier"          integer NOT NULL DEFAULT 1,
  "minAge"        integer NOT NULL,
  "maxAge"        integer,
  "annualPremium" numeric(10,2) NOT NULL,
  "order"         integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "MedicalRateBand_tier_minAge_key" ON "MedicalRateBand" ("tier", "minAge");
CREATE INDEX IF NOT EXISTS "MedicalRateBand_tier_idx" ON "MedicalRateBand" ("tier");

INSERT INTO "MedicalRateBand" ("id", "tier", "minAge", "maxAge", "annualPremium", "order") VALUES
  ('mrb_t1_00', 1,  0, 17, 3990.72,  0),
  ('mrb_t1_18', 1, 18, 24, 5173.57,  1),
  ('mrb_t1_25', 1, 25, 29, 5708.69,  2),
  ('mrb_t1_30', 1, 30, 34, 7181.70,  3),
  ('mrb_t1_35', 1, 35, 39, 8898.47,  4),
  ('mrb_t1_40', 1, 40, 44, 9883.96,  5),
  ('mrb_t1_45', 1, 45, 49, 12497.11, 6),
  ('mrb_t1_50', 1, 50, 54, 13297.38, 7),
  ('mrb_t1_55', 1, 55, 59, 16139.08, 8),
  ('mrb_t1_60', 1, 60, 64, 21912.07, 9),
  ('mrb_t1_65', 1, 65, 69, 23788.03, 10),
  ('mrb_t1_70', 1, 70, 75, 29796.12, 11)
ON CONFLICT ("tier", "minAge") DO NOTHING;

-- ── 3) Per-covered-person commit snapshot ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MedicalCoveredPerson" (
  "id"           text PRIMARY KEY,
  "commitmentId" text NOT NULL REFERENCES "MedicalCommitment"("id") ON DELETE CASCADE,
  "dependantId"  text REFERENCES "Dependant"("id") ON DELETE SET NULL,
  "label"        text NOT NULL,
  "ageAtCommit"  integer NOT NULL,
  "premiumEGP"   integer NOT NULL
);
CREATE INDEX IF NOT EXISTS "MedicalCoveredPerson_commitmentId_idx" ON "MedicalCoveredPerson" ("commitmentId");

-- ── 4) Legacy commitment count columns become nullable (retained for history) ─
ALTER TABLE "MedicalCommitment"
  ALTER COLUMN "spouse" DROP NOT NULL,
  ALTER COLUMN "spouse" DROP DEFAULT,
  ALTER COLUMN "childrenUnder18" DROP NOT NULL,
  ALTER COLUMN "childrenUnder18" DROP DEFAULT,
  ALTER COLUMN "children18Plus" DROP NOT NULL,
  ALTER COLUMN "children18Plus" DROP DEFAULT;

-- ── 5) Drop the old relationship-based rate card ─────────────────────────────
DROP TABLE IF EXISTS "MedicalRateCard";

COMMIT;
