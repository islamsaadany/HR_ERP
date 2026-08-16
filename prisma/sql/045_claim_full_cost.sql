-- HR_ERP — Record the receipt value alongside the covered amount on a claim.
-- Adds BenefitClaim.fullCost (int, nullable): the full price the employee entered,
-- matching their proof of payment. BenefitClaim.amount stays the COVERED (company)
-- share — what is actually reimbursed.
--
-- Why now: the claim rules changed from refusing a claim that exceeds what's left on a
-- benefit to reimbursing whatever remains (the 50%-per-benefit cap overrides the coverage
-- rate). So the covered amount is no longer always `fullCost × coverageRate`, and HR
-- reviewing a claim needs the receipt value to reconcile it against the attached proof —
-- "receipt 10,000 · covered 8,000 · capped to 7,000".
--
-- Nullable with no backfill on purpose: claims filed before this column existed have no
-- recorded receipt value, and inventing one would be a lie. The UI shows the receipt line
-- only when the value is present. Guaranteed benefits have no coverage rate and leave it null.
--
-- Additive, non-destructive, idempotent. No money rule reads this column.
BEGIN;
ALTER TABLE "BenefitClaim" ADD COLUMN IF NOT EXISTS "fullCost" integer;
COMMIT;
