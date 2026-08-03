-- HR_ERP — email + password sign-in: add a password hash to the employee registry. Idempotent, runner-applied.
BEGIN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" text;
COMMIT;
