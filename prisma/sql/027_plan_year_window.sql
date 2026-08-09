-- HR_ERP — Mid-year starter proration (spec 019).
-- Adds the plan-year proration window and marks which guaranteed benefits prorate.
-- Idempotent: safe to re-run. Apply in Neon AFTER 026.
--
-- Nothing is destroyed. Existing plan years get null start/end dates, so they are
-- treated as having no window (proration OFF, full amounts) until an admin sets dates.

-- 1. Plan-year proration window (admin-set; nullable).
ALTER TABLE "PlanYear" ADD COLUMN IF NOT EXISTS "startDate" timestamp(3);
ALTER TABLE "PlanYear" ADD COLUMN IF NOT EXISTS "endDate"   timestamp(3);

-- 2. Which guaranteed benefits are prorated for mid-year starters.
ALTER TABLE "GuaranteedBenefit" ADD COLUMN IF NOT EXISTS "prorated" boolean NOT NULL DEFAULT false;

-- 3. Only Professional development prorates; event/season gifts stay full-when-triggered.
UPDATE "GuaranteedBenefit"
   SET "prorated" = true
 WHERE "id" IN ('gb_ft_profdev', 'gb_pt_profdev')
   AND "prorated" = false;
