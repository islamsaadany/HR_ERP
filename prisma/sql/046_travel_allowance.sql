-- HR_ERP — Summer allowance becomes a year-round, pool-funded Travel allowance.
--
-- WHAT CHANGES FOR EMPLOYEES
--   The guaranteed "Summer allowance" (its own budget, outside the pool, notionally Jul–Sep)
--   becomes a flexible "Travel allowance" in the Lifestyle category: claimable all year, paid
--   in full with no receipt, and drawn FROM THE POOL. Same band amounts as before.
--
-- 1. Fixed per-band allowance columns on the flexible catalogue.
--    An item with any of these set is an ENTITLEMENT, not a receipt-based claim: the employee
--    requests it and is paid the band amount. One amount per band for full- AND part-timers —
--    the pool ceiling already differs by employment type, so a second set of figures would only
--    be a chance for the two to drift apart.
ALTER TABLE "BenefitCatalogItem" ADD COLUMN IF NOT EXISTS "band6mo2y"  integer;
ALTER TABLE "BenefitCatalogItem" ADD COLUMN IF NOT EXISTS "band2to4y"  integer;
ALTER TABLE "BenefitCatalogItem" ADD COLUMN IF NOT EXISTS "band4to7y"  integer;
ALTER TABLE "BenefitCatalogItem" ADD COLUMN IF NOT EXISTS "band7to10y" integer;

BEGIN;

-- 2. Create the Travel allowance, COPYING the amounts already configured on the Summer row
--    rather than hardcoding figures — whatever the operator set is what carries across. The
--    full-time columns are the source; full- and part-timers now share one set.
--    NOTE tbe claim type: a request, no proof. 100% coverage: the band amount IS the payout.
INSERT INTO "BenefitCatalogItem"
  (id, key, name, description, category, "isMedical", "eligibleFullTime", "eligiblePartTime",
   "order", active, "claimType", "coverageRate", "band6mo2y", "band2to4y", "band4to7y", "band7to10y")
SELECT
  'ci_travel_allowance',
  'travel_allowance',
  'Travel allowance',
  'A fixed allowance for your band, paid in full. Claim it whenever you like — no receipt needed.',
  'Lifestyle & flexibility',
  false,
  true,
  true,
  90,
  true,
  'NOTE'::"ClaimType",
  100,
  g."ftBand6mo2y",
  g."ftBand2to4y",
  g."ftBand4to7y",
  g."ftBand7to10y"
FROM "GuaranteedBenefit" g
WHERE g.name = 'Summer allowance'
ON CONFLICT (key) DO NOTHING;

-- 2b. Fallback for an installation with no Summer row (fresh seed): create the item with the
--     documented placeholder amounts so the catalogue isn't missing it entirely.
INSERT INTO "BenefitCatalogItem"
  (id, key, name, description, category, "isMedical", "eligibleFullTime", "eligiblePartTime",
   "order", active, "claimType", "coverageRate", "band6mo2y", "band2to4y", "band4to7y", "band7to10y")
VALUES
  ('ci_travel_allowance', 'travel_allowance', 'Travel allowance',
   'A fixed allowance for your band, paid in full. Claim it whenever you like — no receipt needed.',
   'Lifestyle & flexibility', false, true, true, 90, true, 'NOTE'::"ClaimType", 100,
   2500, 3500, 5000, 6000)
ON CONFLICT (key) DO NOTHING;

-- 3. Retire the guaranteed Summer allowance — DO NOT DELETE IT.
--    BenefitClaim.guaranteedBenefitId is ON DELETE CASCADE, so dropping this row would destroy
--    every historical summer claim along with it. GuaranteedBenefit has no `active` flag, so
--    clearing both eligibility flags is how a benefit is withdrawn: it stops appearing for every
--    employee (the page and the claim action both filter on these), while its claim history and
--    its configured amounts stay intact and auditable.
UPDATE "GuaranteedBenefit"
   SET "eligibleFullTime" = false,
       "eligiblePartTime" = false,
       note = 'Retired 2026-08-16 — replaced by the Travel allowance in the flexible basket.'
 WHERE name = 'Summer allowance';

COMMIT;
