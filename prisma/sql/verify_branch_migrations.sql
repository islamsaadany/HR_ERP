-- HR_ERP — VERIFY migrations 036–044 (read-only; changes nothing).
-- Paste into the Neon SQL editor. Run all, or a section at a time.
-- Expected: every row in Section 1 shows PASS (or REVIEW with a note you can eyeball).

-- ============================================================
-- SECTION 1 — Schema + data checklist (one row per check)
-- ============================================================
WITH col AS (
  SELECT table_name, column_name FROM information_schema.columns
), checks AS (
  -- 040: Employee ID column + index
  SELECT 1 AS ord, '040  User.employeeId column' AS check_name,
         CASE WHEN EXISTS (SELECT 1 FROM col WHERE table_name='User' AND column_name='employeeId')
              THEN 'PASS' ELSE 'FAIL — missing' END AS status

  UNION ALL
  SELECT 2, '040  User_employeeId_idx index',
         CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='User_employeeId_idx')
              THEN 'PASS' ELSE 'FAIL — missing' END

  UNION ALL
  -- 041: backfill — every existing user has an Employee ID
  SELECT 3, '041  Users still missing an Employee ID',
         CASE WHEN (SELECT count(*) FROM "User" WHERE "employeeId" IS NULL OR "employeeId"='')=0
              THEN 'PASS — all set'
              ELSE 'REVIEW — ' || (SELECT count(*) FROM "User" WHERE "employeeId" IS NULL OR "employeeId"='')::text
                   || ' blank (OK only if added after backfill)' END

  UNION ALL
  -- 041: IDs match the PREFIX-#### format (e.g. FO-0001)
  SELECT 4, '041  Employee IDs in PREFIX-#### format',
         (SELECT count(*) FROM "User" WHERE "employeeId" ~ '^[A-Z]{2}-[0-9]{4}$')::text
         || ' of ' || (SELECT count(*) FROM "User" WHERE "employeeId" IS NOT NULL AND "employeeId"<>'')::text
         || ' assigned'

  UNION ALL
  -- 042: platformName on both brand carriers
  SELECT 5, '042  BrandSettings.platformName column',
         CASE WHEN EXISTS (SELECT 1 FROM col WHERE table_name='BrandSettings' AND column_name='platformName')
              THEN 'PASS' ELSE 'FAIL — missing' END
  UNION ALL
  SELECT 6, '042  BusinessUnit.platformName column',
         CASE WHEN EXISTS (SELECT 1 FROM col WHERE table_name='BusinessUnit' AND column_name='platformName')
              THEN 'PASS' ELSE 'FAIL — missing' END

  UNION ALL
  -- 043: isDefault column + at most one default
  SELECT 7, '043  BusinessUnit.isDefault column',
         CASE WHEN EXISTS (SELECT 1 FROM col WHERE table_name='BusinessUnit' AND column_name='isDefault')
              THEN 'PASS' ELSE 'FAIL — missing' END
  UNION ALL
  SELECT 8, '043  At most one default business unit',
         CASE WHEN (SELECT count(*) FROM "BusinessUnit" WHERE "isDefault")<=1
              THEN 'PASS — ' || (SELECT count(*) FROM "BusinessUnit" WHERE "isDefault")::text || ' default'
              ELSE 'FAIL — more than one default' END

  UNION ALL
  -- 044: uiPrefs column
  SELECT 9, '044  User.uiPrefs column',
         CASE WHEN EXISTS (SELECT 1 FROM col WHERE table_name='User' AND column_name='uiPrefs')
              THEN 'PASS' ELSE 'FAIL — missing' END

  UNION ALL
  -- 039: business units seeded
  SELECT 10, '039  Business units present',
         (SELECT count(*) FROM "BusinessUnit")::text || ' unit(s)'
)
SELECT check_name, status FROM checks ORDER BY ord;

-- ============================================================
-- SECTION 2 — Business-unit brand snapshot (eyeball it)
-- ============================================================
SELECT "name", "platformName", "shortName", "isDefault"
FROM "BusinessUnit"
ORDER BY "order", "name";

-- ============================================================
-- SECTION 3 — Employee ID spot-check (first 20, and any duplicates)
-- ============================================================
SELECT "employeeId", "name", "email"
FROM "User"
ORDER BY "employeeId" NULLS LAST, "name"
LIMIT 20;

-- Duplicate Employee IDs = linked accounts (expected only for one real person, e.g. Alaa).
SELECT "employeeId", count(*) AS accounts, string_agg("email", ', ') AS emails
FROM "User"
WHERE "employeeId" IS NOT NULL AND "employeeId" <> ''
GROUP BY "employeeId"
HAVING count(*) > 1
ORDER BY "employeeId";
