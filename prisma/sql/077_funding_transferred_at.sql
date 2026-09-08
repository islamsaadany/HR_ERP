-- HR_ERP — A petty cash top-up needs to know whether the money has actually gone (2026-09-08).
--
-- WHY
--   The CEO, looking at Finance's queue: "all the petty cash was released already." Seventeen
--   top-ups going back to 30/11/2024 were sitting there as money still to be transferred —
--   ~EGP 285,000 of it — with the header tick selecting the lot in one click.
--
--   The cause was not bad data. `PettyCashFunding` had no paid/unpaid state AT ALL. A payback has
--   a status, a benefit claim has a status, a funding row had nothing — so `availablePayables()`
--   could only ask "is this a TOP_UP with no live batch item?", which is true of every top-up ever
--   recorded, including the whole imported MARCOM history whose own notes read "Reimbursed to the
--   custodian at the end of the period, settling it."
--
--   Nothing would have corrupted if they had been sent: completing a transaction writes back to
--   paybacks and claims, not to petty cash. What would have happened is worse in the way that
--   matters — the appointed confirmer would have been emailed a total and asked to release money
--   at the bank that left the company months ago.
--
-- WHAT THIS DOES
--   • Adds `transferredAt` — when the money actually reached the custodian. NULL is the ONLY thing
--     that makes a top-up payable.
--   • BACKFILLS every existing row with its own `date`. None of the history is owed: each row
--     records a movement that already happened, which is what the funding form has always meant.
--     Getting this wrong in the other direction would leave the queue exactly as broken as it is,
--     so the backfill is checked below by the count it should produce.
--   • Indexes (type, transferredAt), which is precisely what the payables query asks for.
--
-- A RETURN is money coming back from the custodian and is never payable; it is stamped too, so a
-- null can only ever mean "a top-up that still has to be paid" and no reader has to remember the
-- type as well.
--
-- IDEMPOTENT, and the backfill is deliberately tied to the moment the COLUMN APPEARS rather than
-- to "rows that are still NULL". Written the obvious way first, and a re-run test caught it: once
-- the feature is live, NULL is the normal state of a top-up Finance has queued for the bank, so
-- "stamp everything still NULL" would mark a genuinely-waiting payment as already paid — silently
-- emptying the queue of real money owed. Replaying is not hypothetical: `apply-sql.mjs` records a
-- file only on success, and this file may also be run by hand. So the backfill runs only on a
-- database that did not already have the column, which is the only database whose NULLs mean
-- "written before this idea existed".

BEGIN;

DO $funding$
DECLARE
  v_existed   BOOLEAN;
  v_pending   INT;
  v_stamped   INT;
  v_remaining INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'PettyCashFunding' AND column_name = 'transferredAt'
  ) INTO v_existed;

  ALTER TABLE "PettyCashFunding" ADD COLUMN IF NOT EXISTS "transferredAt" TIMESTAMP(3);

  IF v_existed THEN
    RAISE NOTICE 'transferredAt already present — backfill skipped, queued top-ups left alone.';
    RETURN;
  END IF;

  -- What we expect to stamp, counted BEFORE the write, so the check below is a real check and
  -- not a restatement of what just happened. (The lesson from migration 075: a migration is
  -- verified by the count it should produce, never by whether it errored.)
  SELECT count(*) INTO v_pending FROM "PettyCashFunding" WHERE "transferredAt" IS NULL;

  UPDATE "PettyCashFunding"
     SET "transferredAt" = "date"
   WHERE "transferredAt" IS NULL;

  GET DIAGNOSTICS v_stamped = ROW_COUNT;

  SELECT count(*) INTO v_remaining FROM "PettyCashFunding" WHERE "transferredAt" IS NULL;

  IF v_stamped <> v_pending OR v_remaining <> 0 THEN
    RAISE EXCEPTION
      'Funding backfill did not settle: expected to stamp %, stamped %, % still unstamped.',
      v_pending, v_stamped, v_remaining;
  END IF;

  RAISE NOTICE 'transferredAt backfilled on % existing funding row(s); none left unstamped.', v_stamped;
END
$funding$;

CREATE INDEX IF NOT EXISTS "PettyCashFunding_type_transferredAt_idx"
  ON "PettyCashFunding" ("type", "transferredAt");

COMMIT;
