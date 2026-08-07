-- HR_ERP — Managed departments (spec 014). A lookup table of valid department names
-- that HR/Super User maintain. The employee's department stays a text label on "User";
-- this table is the source of choices/filters. Idempotent, runner-applied.
-- Seeds the five current departments so day-one behavior is unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS "Department" (
  "id"        text PRIMARY KEY,
  "name"      text NOT NULL,
  "order"     integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);

-- Case-sensitive unique on the exact name; case-insensitive uniqueness is enforced
-- in the server action before insert/rename.
CREATE UNIQUE INDEX IF NOT EXISTS "Department_name_key" ON "Department" ("name");

-- Seed today's five departments (stable ids so re-runs are no-ops).
INSERT INTO "Department" ("id", "name", "order") VALUES
  ('dept_consulting',  'Consulting Department',  1),
  ('dept_financial',   'Financial Department',   2),
  ('dept_topmgmt',     'Top Management',         3),
  ('dept_marketing',   'Marketing & Community',  4),
  ('dept_datamgmt',    'Data Management Unit',   5)
ON CONFLICT ("name") DO NOTHING;

COMMIT;
