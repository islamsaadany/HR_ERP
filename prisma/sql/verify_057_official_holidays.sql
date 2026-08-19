-- Verify that migration 057 (spec 037 — official holidays) actually landed.
--
-- Paste this whole file into Neon's SQL editor and run it. It only READS your data — it
-- changes nothing — so it is safe to run any time, as often as you like.
--
-- It works whether or not the migration has been applied: if 057 never ran, you get a row
-- of FAILs telling you so, NOT a database error. (The checks that touch the new columns are
-- run through dynamic SQL for exactly that reason — naming a column that doesn't exist yet
-- would otherwise abort the whole script before it could report anything.)
--
-- Every row comes back PASS or FAIL. All PASS = the deploy applied 057 by itself and the
-- feature is ready. Any FAIL = paste `prisma/sql/057_official_holidays.sql` into this editor,
-- run it, then run this check again.

DROP TABLE IF EXISTS _v057_checks;
CREATE TEMP TABLE _v057_checks (n int, check_name text, result text, detail text);

DROP TABLE IF EXISTS _v057_holidays;
CREATE TEMP TABLE _v057_holidays (observed text, announced text, name text, status text, source text, hr_reminder text);

DO $verify$
DECLARE
  has_ledger   boolean;
  applied_when text;
  range_cols   int;
  cycle_cols   int;
  old_col      boolean;
  has_table    boolean;
  has_lead     boolean;
  total        int;
  blanks       int;
  sent         int;
  lead_days    int;
BEGIN
  -- 1 ─ Did the deploy record 057 as applied?
  has_ledger := to_regclass('public."_sql_migrations"') IS NOT NULL;
  IF has_ledger THEN
    EXECUTE $q$SELECT to_char(applied_at, 'DD/MM/YYYY HH24:MI')
                 FROM "_sql_migrations" WHERE filename LIKE '057%' LIMIT 1$q$
      INTO applied_when;
  END IF;
  INSERT INTO _v057_checks VALUES (
    1, 'Migration 057 recorded',
    CASE WHEN applied_when IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
    CASE
      WHEN applied_when IS NOT NULL THEN 'applied ' || applied_when || ' UTC'
      WHEN NOT has_ledger THEN 'no migration ledger at all — this database has never been deployed to'
      ELSE 'not applied — the deploy did not run it (check the Vercel build log for [apply-sql])'
    END);

  -- 2 ─ The two date ranges (announced + observed)
  SELECT count(*) INTO range_cols FROM information_schema.columns
   WHERE table_name = 'PublicHoliday'
     AND column_name IN ('originalStart','originalEnd','actualStart','actualEnd');
  INSERT INTO _v057_checks VALUES (
    2, 'Holiday date ranges added',
    CASE WHEN range_cols = 4 THEN 'PASS' ELSE 'FAIL' END,
    range_cols || ' of 4 columns present');

  -- 3 ─ The verification lifecycle
  SELECT count(*) INTO cycle_cols FROM information_schema.columns
   WHERE table_name = 'PublicHoliday'
     AND column_name IN ('status','source','verifiedAt','reminderSentAt','localName');
  INSERT INTO _v057_checks VALUES (
    3, 'Verification lifecycle added',
    CASE WHEN cycle_cols = 5 THEN 'PASS' ELSE 'FAIL' END,
    cycle_cols || ' of 5 columns present');

  -- 4 ─ The old single-date column is gone. Dropping it is the LAST step on that table,
  --     so its absence is what proves 057 ran to completion rather than stopping partway.
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'PublicHoliday' AND column_name = 'date')
    INTO old_col;
  INSERT INTO _v057_checks VALUES (
    4, 'Old single-date column removed',
    CASE WHEN old_col THEN 'FAIL' ELSE 'PASS' END,
    CASE WHEN old_col THEN 'still there — 057 stopped partway; run it again'
         ELSE 'gone, as expected' END);

  -- 5 ─ Existing holidays carried over with nothing left blank (dynamic: the columns may
  --     not exist yet, and naming them directly would abort this whole script).
  IF range_cols = 4 THEN
    EXECUTE 'SELECT count(*), count(*) FILTER (WHERE "actualStart" IS NULL OR "originalStart" IS NULL) FROM "PublicHoliday"'
      INTO total, blanks;
    INSERT INTO _v057_checks VALUES (
      5, 'Existing holidays backfilled',
      CASE WHEN blanks = 0 THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN total = 0 THEN 'no holidays listed yet — nothing to carry over (fine)'
           ELSE total || ' holiday(s), ' || blanks || ' with a missing date' END);
  ELSE
    INSERT INTO _v057_checks VALUES (5, 'Existing holidays backfilled', 'FAIL',
      'skipped — the date-range columns do not exist yet');
  END IF;

  -- 6 ─ The announcements table
  has_table := to_regclass('public."HolidayAnnouncement"') IS NOT NULL;
  IF has_table THEN
    EXECUTE 'SELECT count(*) FROM "HolidayAnnouncement"' INTO sent;
  END IF;
  INSERT INTO _v057_checks VALUES (
    6, 'Announcements table created',
    CASE WHEN has_table THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN has_table THEN sent || ' announcement(s) sent so far' ELSE 'missing' END);

  -- 7 ─ The reminder lead time
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'NotificationSettings' AND column_name = 'verificationLeadDays')
    INTO has_lead;
  IF has_lead THEN
    EXECUTE 'SELECT "verificationLeadDays" FROM "NotificationSettings" WHERE id = ''singleton''' INTO lead_days;
  END IF;
  INSERT INTO _v057_checks VALUES (
    7, 'Reminder lead time set',
    CASE WHEN has_lead THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN NOT has_lead THEN 'missing'
         WHEN lead_days IS NULL THEN 'column present, no settings row yet — it will default to 14'
         ELSE 'reminding HR ' || lead_days || ' days before a holiday' END);

  -- The holidays themselves, for eyeballing — only readable once the columns exist.
  IF range_cols = 4 AND cycle_cols = 5 THEN
    EXECUTE $q$
      INSERT INTO _v057_holidays
      SELECT to_char("actualStart", 'DD/MM/YYYY')
               || CASE WHEN "actualEnd" <> "actualStart"
                       THEN ' - ' || to_char("actualEnd", 'DD/MM/YYYY') ELSE '' END,
             to_char("originalStart", 'DD/MM/YYYY')
               || CASE WHEN "originalEnd" <> "originalStart"
                       THEN ' - ' || to_char("originalEnd", 'DD/MM/YYYY') ELSE '' END,
             name, status::text, source::text,
             CASE WHEN "reminderSentAt" IS NULL THEN 'not yet' ELSE 'sent' END
        FROM "PublicHoliday" ORDER BY "actualStart"
    $q$;
  END IF;
END
$verify$;

-- ── Result 1: did the migration land? ────────────────────────────────────────
SELECT check_name AS "check", result, detail FROM _v057_checks ORDER BY n;

-- ── Result 2: the holidays log as it stands (empty until 057 has applied) ────
-- "announced" and "observed" differ only for a holiday HR has moved.
SELECT * FROM _v057_holidays;
