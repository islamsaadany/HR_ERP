-- Verify that migration 057 (spec 037 — official holidays) actually landed.
--
-- STRICTLY READ-ONLY: two SELECT statements, nothing else. It creates nothing, drops
-- nothing, and writes nothing — not even a temporary scratch table. Safe to run any time,
-- as often as you like.
--
-- It works whether or not the migration has been applied: if 057 never ran you get FAILs
-- explaining that, not a database error. The checks that read the new columns go through
-- `query_to_xml`, which lets a SELECT read a column that may not exist yet without the
-- planner aborting the whole statement — naming those columns directly is what would turn
-- "not applied" into a crash, in exactly the situation you'd run this to diagnose.
-- (Those calls pass tableforest = false on purpose: with true, a query matching no rows
-- returns an EMPTY document and xpath then fails to parse it.)
--
-- All PASS = the deploy applied 057 by itself; nothing more to do.
-- Any FAIL  = run `prisma/sql/057_official_holidays.sql` here, then run this again.

WITH facts AS (
  SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'PublicHoliday'
        AND column_name IN ('originalStart','originalEnd','actualStart','actualEnd')) AS range_cols,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'PublicHoliday'
        AND column_name IN ('status','source','verifiedAt','reminderSentAt','localName')) AS cycle_cols,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'PublicHoliday' AND column_name = 'date') AS old_col,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'NotificationSettings' AND column_name = 'verificationLeadDays') AS lead_col,
    to_regclass('public."_sql_migrations"') IS NOT NULL AS has_ledger,
    to_regclass('public."HolidayAnnouncement"') IS NOT NULL AS has_announcements
),
applied AS (
  SELECT CASE WHEN f.has_ledger THEN (
    xpath('//w/text()', query_to_xml(
      $q$SELECT to_char(applied_at, 'DD/MM/YYYY HH24:MI') AS w
           FROM "_sql_migrations" WHERE filename LIKE '057%' LIMIT 1$q$,
      false, false, ''))
  )[1]::text END AS applied_when
  FROM facts f
)
SELECT * FROM (
  SELECT 1 AS n, 'Migration 057 recorded' AS "check",
    CASE WHEN a.applied_when IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS result,
    CASE
      WHEN a.applied_when IS NOT NULL THEN 'applied ' || a.applied_when || ' UTC'
      WHEN NOT f.has_ledger THEN 'no migration ledger at all — this database has never been deployed to'
      ELSE 'not applied — the deploy did not run it (check the Vercel build log for [apply-sql])'
    END AS detail
  FROM facts f, applied a

  UNION ALL
  SELECT 2, 'Holiday date ranges added',
    CASE WHEN f.range_cols = 4 THEN 'PASS' ELSE 'FAIL' END,
    f.range_cols || ' of 4 columns present'
  FROM facts f

  UNION ALL
  SELECT 3, 'Verification lifecycle added',
    CASE WHEN f.cycle_cols = 5 THEN 'PASS' ELSE 'FAIL' END,
    f.cycle_cols || ' of 5 columns present'
  FROM facts f

  -- Dropping the old single-date column is the LAST step 057 takes on that table, so its
  -- absence is what proves the migration finished rather than stopping partway.
  UNION ALL
  SELECT 4, 'Old single-date column removed',
    CASE WHEN f.old_col = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN f.old_col = 0 THEN 'gone, as expected'
         ELSE 'still there — 057 stopped partway; run it again' END
  FROM facts f

  UNION ALL
  SELECT 5, 'Existing holidays backfilled',
    CASE
      WHEN f.range_cols <> 4 THEN 'FAIL'
      WHEN (xpath('//b/text()', query_to_xml(
              'SELECT count(*) AS b FROM "PublicHoliday" WHERE "actualStart" IS NULL OR "originalStart" IS NULL',
              false, false, '')))[1]::text = '0' THEN 'PASS'
      ELSE 'FAIL' END,
    CASE
      WHEN f.range_cols <> 4 THEN 'skipped — the date-range columns do not exist yet'
      ELSE (xpath('//t/text()', query_to_xml('SELECT count(*) AS t FROM "PublicHoliday"', false, false, '')))[1]::text
           || ' holiday(s), '
           || (xpath('//b/text()', query_to_xml(
                'SELECT count(*) AS b FROM "PublicHoliday" WHERE "actualStart" IS NULL OR "originalStart" IS NULL',
                false, false, '')))[1]::text
           || ' with a missing date'
    END
  FROM facts f

  UNION ALL
  SELECT 6, 'Announcements table created',
    CASE WHEN f.has_announcements THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN f.has_announcements
         THEN (xpath('//s/text()', query_to_xml('SELECT count(*) AS s FROM "HolidayAnnouncement"', false, false, '')))[1]::text
              || ' announcement(s) sent so far'
         ELSE 'missing' END
  FROM facts f

  UNION ALL
  SELECT 7, 'Reminder lead time set',
    CASE WHEN f.lead_col = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE
      WHEN f.lead_col <> 1 THEN 'missing'
      ELSE COALESCE(
        'reminding HR ' || (xpath('//d/text()', query_to_xml(
          $q$SELECT "verificationLeadDays" AS d FROM "NotificationSettings" WHERE id = 'singleton'$q$,
          false, false, '')))[1]::text || ' days before a holiday',
        'column present, no settings row yet — it will default to 14')
    END
  FROM facts f
) rows ORDER BY n;


-- ── The holidays log as it stands ────────────────────────────────────────────
-- Also read-only. "announced" and "observed" differ only for a holiday HR has moved.
-- Returns no rows until 057 has applied (the columns simply aren't there yet).
SELECT
  (xpath('//observed/text()',  x))[1]::text AS observed,
  (xpath('//announced/text()', x))[1]::text AS announced,
  (xpath('//nm/text()',        x))[1]::text AS name,
  (xpath('//st/text()',        x))[1]::text AS status,
  (xpath('//src/text()',       x))[1]::text AS source,
  (xpath('//rem/text()',       x))[1]::text AS hr_reminder
FROM unnest(
  CASE WHEN (SELECT count(*) FROM information_schema.columns
              WHERE table_name = 'PublicHoliday'
                AND column_name IN ('actualStart','originalStart','status','source','reminderSentAt')) = 5
  THEN xpath('/table/row', query_to_xml($q$
    SELECT to_char("actualStart", 'DD/MM/YYYY')
             || CASE WHEN "actualEnd" <> "actualStart"
                     THEN ' - ' || to_char("actualEnd", 'DD/MM/YYYY') ELSE '' END AS observed,
           to_char("originalStart", 'DD/MM/YYYY')
             || CASE WHEN "originalEnd" <> "originalStart"
                     THEN ' - ' || to_char("originalEnd", 'DD/MM/YYYY') ELSE '' END AS announced,
           name AS nm, status::text AS st, source::text AS src,
           CASE WHEN "reminderSentAt" IS NULL THEN 'not yet' ELSE 'sent' END AS rem
      FROM "PublicHoliday" ORDER BY "actualStart"
  $q$, false, false, ''))
  ELSE ARRAY[]::xml[] END
) AS x;
