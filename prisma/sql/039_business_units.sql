-- HR_ERP — Multi-brand by business unit (spec 024).
-- Adds the BusinessUnit table + User.businessUnitId FK, and seeds the three
-- group companies. Additive and non-destructive: existing users get
-- businessUnitId = NULL and keep the current default brand until HR assigns them.
-- Theming only — no data isolation, no benefits/money change. Idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS "BusinessUnit" (
  "id"           text PRIMARY KEY,
  "name"         text NOT NULL UNIQUE,
  "shortName"    text NOT NULL,
  "logoUrl"      text,
  "primaryColor" text NOT NULL DEFAULT '#0f2444',
  "accentColor"  text NOT NULL DEFAULT '#c9a227',
  "order"        integer NOT NULL DEFAULT 0,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"    timestamp(3) NOT NULL DEFAULT now()
);

-- Nullable FK on User (safety net ON DELETE SET NULL; the admin also blocks
-- deleting a unit while employees are assigned).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "businessUnitId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'User_businessUnitId_fkey' AND table_name = 'User'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_businessUnitId_fkey"
      FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_businessUnitId_idx" ON "User"("businessUnitId");

-- Seed the three group companies (navy/gold defaults so nothing changes visually
-- until a Super User re-themes a unit; no employees auto-assigned).
INSERT INTO "BusinessUnit" ("id", "name", "shortName", "primaryColor", "accentColor", "order")
VALUES
  ('bu-forefront-consulting', 'Forefront Consulting',    'Forefront',    '#0f2444', '#c9a227', 0),
  ('bu-visual-shift',         'Visual Shift Consulting', 'Visual Shift', '#0f2444', '#c9a227', 1),
  ('bu-omnisight',            'Omnisight Analytics',     'Omnisight',    '#0f2444', '#c9a227', 2)
ON CONFLICT ("name") DO NOTHING;

COMMIT;
