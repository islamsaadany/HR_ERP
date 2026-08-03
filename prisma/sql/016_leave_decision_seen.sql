-- HR_ERP — Time-Off: track whether the requester has seen a decision (FR-014).
-- Adds LeaveRequest."decisionSeenAt": null = decided-but-unseen (drives the nav badge),
-- set to a timestamp once the requester views their Time-Off page. Idempotent, runner-applied.
BEGIN;
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "decisionSeenAt" timestamp(3);
COMMIT;
