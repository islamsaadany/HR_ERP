-- HR_ERP — Emergency contact on the employee registry.
-- Three HR-managed columns on User: who to call, their relationship, and their number.
-- Shown read-only on the employee's own Profile and editable on the admin employee form;
-- deliberately NOT surfaced in the Team Directory (sensitive). Idempotent; apply after 027.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emergencyContactName"         text;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emergencyContactRelationship" text;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emergencyContactPhone"        text;
