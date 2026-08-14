-- HR_ERP — Remove the demo persona (Ahmed Ali) after a walk-through.
--
-- Run this in the Neon SQL editor once the demo meeting is done to delete the
-- fake employee and all of his demo data. Safe to run even if 037 was never run
-- (deletes nothing). Dependants, medical commitments, and any claims Ahmed
-- created live during the demo are removed too.
BEGIN;

-- Anything Ahmed created during the demo (claims / medical / releases / leave /
-- onboarding progress) is child data of his User row. Delete the child rows
-- first, then the user, so we don't rely on cascade behavior.
DELETE FROM "BenefitClaim"      WHERE "userId"      = 'demo-ahmed-ali';
DELETE FROM "MedicalCommitment" WHERE "userId"      = 'demo-ahmed-ali';
DELETE FROM "BenefitRelease"    WHERE "userId"      = 'demo-ahmed-ali';
DELETE FROM "LeaveRequest"      WHERE "userId"      = 'demo-ahmed-ali';
DELETE FROM "ActivityCompletion" WHERE "userId"     = 'demo-ahmed-ali';
DELETE FROM "PersonalDocument"  WHERE "ownerId"     = 'demo-ahmed-ali';
DELETE FROM "Dependant"         WHERE "userId"      = 'demo-ahmed-ali';
DELETE FROM "User"              WHERE "id"          = 'demo-ahmed-ali';

COMMIT;
