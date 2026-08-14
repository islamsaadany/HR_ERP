-- HR_ERP — One-time Employee ID backfill by joining date (spec 025).
-- Assigns FF-0001, FF-0002, … ordered by hire date (earliest first; ties broken
-- by name; employees with no hire date sort last). Requires migration 040 (the
-- employeeId column) applied first. Only fills BLANK Employee IDs — it never
-- overwrites an ID you've already set (e.g. a shared ID linking two accounts).
-- Safe to re-run.
--
-- STEP 1 — VERIFY FIRST (run this SELECT; it changes nothing):
--   SELECT 'FF-' || LPAD(ROW_NUMBER() OVER (ORDER BY "startDate" ASC NULLS LAST, "name" ASC)::text, 4, '0') AS proposed_id,
--          "name", "email", to_char("startDate",'YYYY-MM-DD') AS joined, "employeeId" AS current_id
--   FROM "User"
--   ORDER BY "startDate" ASC NULLS LAST, "name" ASC;
--
-- STEP 2 — APPLY (the transaction below):
BEGIN;

WITH ranked AS (
  SELECT
    id,
    'FF-' || LPAD(
      ROW_NUMBER() OVER (ORDER BY "startDate" ASC NULLS LAST, "name" ASC)::text,
      4, '0'
    ) AS eid
  FROM "User"
)
UPDATE "User" u
SET "employeeId" = r.eid
FROM ranked r
WHERE u.id = r.id
  AND u."employeeId" IS NULL;  -- only fill blanks; never overwrite a set/linked ID

COMMIT;
