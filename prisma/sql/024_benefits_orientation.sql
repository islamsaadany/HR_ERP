-- HR_ERP — Benefits orientation tour (spec 017). A per-user marker set when the employee first
-- dismisses/finishes the orientation, so it doesn't auto-open again (the "How it works" button
-- ignores it). Idempotent, runner-applied.
BEGIN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "benefitsOrientationSeenAt" timestamp(3);
COMMIT;
