-- HR_ERP — Employee ID + linked-account switching (spec 025).
-- Adds a nullable, NON-unique Employee ID (person identifier). Two accounts that
-- share it are the same person (drives the account switcher). Email stays the
-- unique per-account login. Additive, non-destructive, idempotent.
BEGIN;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employeeId" text;
CREATE INDEX IF NOT EXISTS "User_employeeId_idx" ON "User"("employeeId");

COMMIT;
