-- HR_ERP — Per-cycle 50%-per-benefit cap switch (spec 031).
--
-- WHY
--   The 50% cap stops one benefit swallowing a pool. That is right over twelve months and wrong
--   over five: a 30,000 ceiling prorated to a cycle opening 1 August is 12,500, and the cap then
--   limits any single benefit to 6,250. The rule meant to encourage variety instead stops the
--   employee using the pool. HR can now switch it off FOR THAT CYCLE.
--
-- WHY ON THE CYCLE, NOT IN CONFIG
--   A global setting would mean flipping it today changes the rules a CLOSED cycle's claims were
--   judged under — what was allowed when would no longer be recoverable. Freezing the rule with
--   the cycle is what makes the exception auditable instead of a hidden mode.
--
-- NOT RETROACTIVE
--   Changing the setting re-evaluates nothing. A benefit already past a re-enabled cap simply has
--   zero remaining (max(0, ceiling - used)), never a negative amount and never a clawback — the
--   only behaviour consistent with a claim being reimbursement of money already spent against a
--   proof of payment.
--
-- SAFETY
--   Purely additive: three columns, defaulting to TRUE, so every existing cycle keeps exactly
--   today's behaviour. Nothing is backfilled and nothing existing is read or changed.
--
-- ORDER: run after 049.

ALTER TABLE "PlanYear" ADD COLUMN IF NOT EXISTS "flexCapEnabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "PlanYear" ADD COLUMN IF NOT EXISTS "flexCapChangedById" text;
ALTER TABLE "PlanYear" ADD COLUMN IF NOT EXISTS "flexCapChangedAt" timestamp(3);

DO $$ BEGIN
  ALTER TABLE "PlanYear" ADD CONSTRAINT "PlanYear_flexCapChangedById_fkey"
    FOREIGN KEY ("flexCapChangedById") REFERENCES "User"(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
