-- 035_incentive_config.sql
-- Editable incentive-scheme rule constants (singleton). The row is created only
-- when a Super User saves; until then getIncentiveConfig() returns the built-in
-- defaults, so the compensation engine is unchanged. Safe to run once on Neon.

CREATE TABLE IF NOT EXISTS "IncentiveConfig" (
  "id"                       TEXT PRIMARY KEY DEFAULT 'singleton',
  "envelopeRate"             DOUBLE PRECISION NOT NULL,
  "marginGate"               DOUBLE PRECISION NOT NULL,
  "tier1Min"                 DOUBLE PRECISION NOT NULL,
  "tier1Deduction"           DOUBLE PRECISION NOT NULL,
  "tier2Min"                 DOUBLE PRECISION NOT NULL,
  "tier2Deduction"           DOUBLE PRECISION NOT NULL,
  "tier3Min"                 DOUBLE PRECISION NOT NULL,
  "tier3Deduction"           DOUBLE PRECISION NOT NULL,
  "maxTotalDeduction"        DOUBLE PRECISION NOT NULL,
  "contributorCapMonths"     DOUBLE PRECISION NOT NULL,
  "contributorFloorMonths"   DOUBLE PRECISION NOT NULL,
  "commissionReferred"       DOUBLE PRECISION NOT NULL,
  "commissionSelfGenerated"  DOUBLE PRECISION NOT NULL,
  "retainerCommissionMonths" INTEGER NOT NULL,
  "cycleMonths"              INTEGER NOT NULL,
  "vendorMarkupMin"          DOUBLE PRECISION NOT NULL,
  "profitTargetMargin"       DOUBLE PRECISION NOT NULL,
  "profitFloorMargin"        DOUBLE PRECISION NOT NULL,
  "profitCeilingMonths"      DOUBLE PRECISION NOT NULL,
  "profitLeadFeeOffsetShare" DOUBLE PRECISION NOT NULL,
  "pricingFloorMultiple"     DOUBLE PRECISION NOT NULL,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  "updatedById"              TEXT
);
