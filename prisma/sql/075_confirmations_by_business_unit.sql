-- HR_ERP — Bank confirmations, one business unit at a time (spec 041 amendment, 2026-08-25).
--
-- WHY
--   The CEO: "for the transaction confirmation we need it by business unit. as every business unit
--   might have an account to confirm and accordingly different people. that's in general."
--
--   Spec 041 shipped one company-wide queue: one appointment list, and every submission visible to
--   everyone on it. That is wrong the moment two units bank separately — a person appointed for one
--   unit could confirm another unit's money, and Finance could put two units' payables into a single
--   transaction that only one account can settle.
--
-- WHAT CHANGES
--   • `TransactionConfirmer` gains `businessUnitId`, and its uniqueness moves from the person to the
--     PAIR. One person may hold several units. There is deliberately NO row meaning "every unit":
--     a company-wide appointment would silently cover a unit created next month, which is exactly
--     the sort of implicit power the appointment pattern exists to avoid.
--   • `PaymentBatch` gains `businessUnitId` — whose account it was created in. It is derived at
--     submission from the people being paid, never typed, and a submission may hold payables from
--     that one unit only.
--
-- MIGRATING WHAT IS ALREADY THERE
--   An existing appointment was company-wide, so it is EXPANDED to one row per business unit —
--   the person keeps exactly the authority they had, and the Super User can now take units away
--   individually. Dropping the rows and asking everyone to be re-appointed would have removed a
--   control silently.
--   An existing submission is assigned to the default unit (or, with none marked, the first by
--   sort order). In practice there are none — the feature reached main the day before this — and
--   the run reports how many it touched rather than assuming.
--
--   If NO business unit exists at all, this file REFUSES and rolls itself back. It is not recorded
--   as applied, the deploy still finishes, and it retries next time — because a column left
--   nullable on one database and NOT NULL on another is the failure that never announces itself.
--
-- IDEMPOTENT: may be retried. Every statement is guarded.

BEGIN;

ALTER TABLE "TransactionConfirmer" ADD COLUMN IF NOT EXISTS "businessUnitId" TEXT;
ALTER TABLE "PaymentBatch"         ADD COLUMN IF NOT EXISTS "businessUnitId" TEXT;

-- FIRST, and this ORDER MATTERS. Uniqueness moves from the person to the (person, unit) pair, and
-- the expansion below inserts a SECOND row for somebody who already has one. While the old
-- one-row-per-person index still stands, every one of those inserts violates it and the
-- `ON CONFLICT DO NOTHING` swallows the violation without a word — which is exactly what happened
-- on the first run of this file: two company-wide appointments across three units produced two
-- rows instead of six, silently, and only a check against the expected count found it.
DROP INDEX IF EXISTS "TransactionConfirmer_userId_key";

DO $unit$
DECLARE
  v_fallback TEXT;
  v_expanded INT := 0;
  v_batches  INT := 0;
BEGIN
  -- The unit an existing, unit-less submission is attributed to.
  SELECT id INTO v_fallback FROM "BusinessUnit"
   ORDER BY "isDefault" DESC, "order" ASC, "name" ASC LIMIT 1;

  IF v_fallback IS NULL THEN
    -- REFUSE rather than half-apply. `apply-sql.mjs` records a file only when it SUCCEEDS and is
    -- deliberately non-fatal, so raising here rolls this file back, lets the deploy finish, and
    -- retries on the next one. Warning-and-returning instead would leave both columns nullable
    -- FOREVER on this database — the file would be marked applied and never run again — while a
    -- fresh database got them NOT NULL. Two databases, one file, different shapes.
    RAISE EXCEPTION 'confirmations-by-unit: no BusinessUnit exists yet. Create one, then redeploy — this file will retry.';
  END IF;

  -- 1 ── Expand each company-wide appointment into one row per unit, keeping the original row as
  --      the first unit's so its id, appointer and date survive.
  WITH orphans AS (
    SELECT c.id, c."userId", c."appointedById", c."createdAt"
      FROM "TransactionConfirmer" c
     WHERE c."businessUnitId" IS NULL
  ), first_unit AS (
    SELECT id FROM "BusinessUnit" ORDER BY "isDefault" DESC, "order" ASC, "name" ASC LIMIT 1
  )
  INSERT INTO "TransactionConfirmer" ("id", "userId", "businessUnitId", "appointedById", "createdAt")
  SELECT
    -- Deterministic, so a retry collides with itself rather than duplicating.
    'tc_' || substr(md5(o."userId" || ':' || b.id), 1, 24),
    o."userId", b.id, o."appointedById", o."createdAt"
    FROM orphans o
    CROSS JOIN "BusinessUnit" b
   WHERE b.id <> (SELECT id FROM first_unit)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_expanded = ROW_COUNT;

  UPDATE "TransactionConfirmer"
     SET "businessUnitId" = (SELECT id FROM "BusinessUnit" ORDER BY "isDefault" DESC, "order" ASC, "name" ASC LIMIT 1)
   WHERE "businessUnitId" IS NULL;

  -- 2 ── Attribute existing submissions.
  UPDATE "PaymentBatch" SET "businessUnitId" = v_fallback WHERE "businessUnitId" IS NULL;
  GET DIAGNOSTICS v_batches = ROW_COUNT;

  IF v_expanded > 0 OR v_batches > 0 THEN
    RAISE NOTICE 'confirmations-by-unit: expanded % appointment row(s), attributed % submission(s).',
      v_expanded, v_batches;
  END IF;

  -- 3 ── Only now can the columns be required.
  ALTER TABLE "TransactionConfirmer" ALTER COLUMN "businessUnitId" SET NOT NULL;
  ALTER TABLE "PaymentBatch"         ALTER COLUMN "businessUnitId" SET NOT NULL;
END
$unit$;

-- The pair index, created only once every row actually has a unit to be unique against.
DO $idx$
BEGIN
  IF EXISTS (SELECT 1 FROM "BusinessUnit") THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "TransactionConfirmer_userId_businessUnitId_key"
      ON "TransactionConfirmer" ("userId", "businessUnitId");
  END IF;
END
$idx$;

CREATE INDEX IF NOT EXISTS "TransactionConfirmer_businessUnitId_idx"
  ON "TransactionConfirmer" ("businessUnitId");
CREATE INDEX IF NOT EXISTS "PaymentBatch_businessUnitId_status_idx"
  ON "PaymentBatch" ("businessUnitId", "status");

-- Foreign keys, guarded so a retry is a no-op.
DO $fk$
BEGIN
  -- A NULL column value passes a foreign key, so these are safe even in the
  -- no-business-unit-yet case above, where the columns were left nullable.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransactionConfirmer_businessUnitId_fkey') THEN
    ALTER TABLE "TransactionConfirmer"
      ADD CONSTRAINT "TransactionConfirmer_businessUnitId_fkey"
      FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE;
  END IF;

  -- RESTRICT, not CASCADE: deleting a business unit must never take the record of what was paid
  -- from its account with it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentBatch_businessUnitId_fkey') THEN
    ALTER TABLE "PaymentBatch"
      ADD CONSTRAINT "PaymentBatch_businessUnitId_fkey"
      FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT;
  END IF;
END
$fk$;

COMMIT;
