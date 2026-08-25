-- HR_ERP — A receipt that lives somewhere else (spec 040 follow-up, 2026-08-25).
--
-- WHY
--   Importing the marketing expenses workbook (migration 072) brings 145 historical lines whose
--   receipts are Google Drive links, not files. There is nothing to upload: the files are in
--   somebody's Drive, they always were, and copying them here would need access this deploy does
--   not have.
--
--   So evidence gains a second, mutually exclusive location. `blobUrl` still means "we hold this
--   file privately and stream it after the entitlement check". `externalUrl` means "the receipt is
--   over there" — the SAME route answers, makes the SAME decision, and redirects instead of
--   streaming. One door, still 404 rather than 403 for anyone not entitled, because "forbidden"
--   confirms the receipt exists and the existence of a receipt is itself information.
--
-- WHAT CHANGES
--   `blobUrl` becomes nullable and `externalUrl` is added, with a check constraint asserting that
--   exactly one of the two is set. A row with neither would be a receipt that cannot be opened;
--   a row with both would be two answers to "where is it", and the route would have to pick.
--
-- IDEMPOTENT: may be retried. Every statement is guarded.

BEGIN;

ALTER TABLE "ExpenseEvidence" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;

-- Drop the NOT NULL on blobUrl. `DROP NOT NULL` is already a no-op when it is gone.
ALTER TABLE "ExpenseEvidence" ALTER COLUMN "blobUrl" DROP NOT NULL;

-- Exactly one location. Added only once the existing rows satisfy it — they all have a blobUrl
-- and no externalUrl, so they do.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ExpenseEvidence_one_location'
      AND conrelid = '"ExpenseEvidence"'::regclass
  ) THEN
    ALTER TABLE "ExpenseEvidence"
      ADD CONSTRAINT "ExpenseEvidence_one_location"
      CHECK (("blobUrl" IS NOT NULL) <> ("externalUrl" IS NOT NULL));
  END IF;
END $$;

COMMIT;
