-- HR_ERP — One-time Employee ID backfill by business unit + joining date (spec 025).
-- ID = the business unit's first 2 letters (uppercase) + a per-unit sequence
-- ordered by hire date (earliest first; ties by name; no hire date sorts last).
-- e.g. Forefront Consulting → FO-0001, FO-0002 …; Visual Shift → VI-0001 …;
-- an employee with no business unit gets the "XX-" prefix. Numbering is PER UNIT,
-- so there are no skips within a unit. Requires migration 040 (the employeeId
-- column). Only fills BLANK Employee IDs — never overwrites a set/linked ID.
-- Safe to re-run.
--
-- STEP 1 — VERIFY FIRST (run this SELECT; it changes nothing):
--   SELECT UPPER(LEFT(COALESCE(bu."name",'XX'),2)) || '-' ||
--          LPAD(ROW_NUMBER() OVER (PARTITION BY u."businessUnitId"
--                                  ORDER BY u."startDate" ASC NULLS LAST, u."name" ASC)::text, 4, '0') AS proposed_id,
--          u."name", u."email", bu."name" AS business_unit,
--          to_char(u."startDate",'YYYY-MM-DD') AS joined, u."employeeId" AS current_id
--   FROM "User" u
--   LEFT JOIN "BusinessUnit" bu ON bu."id" = u."businessUnitId"
--   ORDER BY bu."name" NULLS FIRST, u."startDate" ASC NULLS LAST, u."name" ASC;
--
-- STEP 2 — APPLY (the transaction below):
BEGIN;

WITH ranked AS (
  SELECT
    u."id",
    UPPER(LEFT(COALESCE(bu."name", 'XX'), 2)) || '-' || LPAD(
      ROW_NUMBER() OVER (
        PARTITION BY u."businessUnitId"
        ORDER BY u."startDate" ASC NULLS LAST, u."name" ASC
      )::text, 4, '0'
    ) AS eid
  FROM "User" u
  LEFT JOIN "BusinessUnit" bu ON bu."id" = u."businessUnitId"
)
UPDATE "User" u
SET "employeeId" = r.eid
FROM ranked r
WHERE u."id" = r."id"
  AND u."employeeId" IS NULL;  -- only fill blanks; never overwrite a set/linked ID

COMMIT;
