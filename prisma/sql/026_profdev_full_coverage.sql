-- HR_ERP — Professional development is fully covered (100% of cost, up to the allowance).
-- Decision (2026-08-09): as a *guaranteed* benefit, Professional development should be covered
-- at 100% of cost up to the tenure-band allowance — not 50%. This aligns it with (and above)
-- the flexible "Personal learning" basket item, which is covered at 80%. The per-band allowance
-- amounts are unchanged; only the coverage framing changes, so the employee enters the full cost
-- they paid (up to the allowance) rather than half.
--
-- Idempotent: safe to re-run. Guaranteed-benefit coverage is descriptive (the note) — the claim
-- engine caps a PROOF claim at the band allowance, so no rule-engine change is required.

UPDATE "GuaranteedBenefit"
   SET "note" = '100% of cost, up to your allowance'
 WHERE "id" IN ('gb_ft_profdev', 'gb_pt_profdev')
   AND "note" <> '100% of cost, up to your allowance';
