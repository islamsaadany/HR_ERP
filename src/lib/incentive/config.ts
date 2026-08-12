import { prisma } from "@/lib/prisma";
import { INCENTIVE_RULES, type RuleConfig } from "./rules";

/**
 * The live incentive rule config: the admin-saved singleton merged over the
 * built-in defaults. Returns the defaults when no row exists (nothing has been
 * edited) or the table is absent (DB not yet migrated), so the engine is
 * unchanged until a Super User deliberately saves a value.
 */
export async function getIncentiveConfig(): Promise<RuleConfig> {
  try {
    const row = await prisma.incentiveConfig.findUnique({ where: { id: "singleton" } });
    if (!row) return INCENTIVE_RULES;
    return {
      envelopeRate: row.envelopeRate,
      marginGate: row.marginGate,
      contributorTiers: [
        { min: row.tier1Min, deduction: row.tier1Deduction },
        { min: row.tier2Min, deduction: row.tier2Deduction },
        { min: row.tier3Min, deduction: row.tier3Deduction },
        { min: 0, deduction: 0 },
      ],
      maxTotalDeduction: row.maxTotalDeduction,
      contributorCapMonths: row.contributorCapMonths,
      contributorFloorMonths: row.contributorFloorMonths,
      commissionReferred: row.commissionReferred,
      commissionSelfGenerated: row.commissionSelfGenerated,
      retainerCommissionMonths: row.retainerCommissionMonths,
      cycleMonths: row.cycleMonths,
      vendorMarkupMin: row.vendorMarkupMin,
      profitShare: {
        targetMargin: row.profitTargetMargin,
        floorMargin: row.profitFloorMargin,
        ceilingMonths: row.profitCeilingMonths,
        leadFeeOffsetShare: row.profitLeadFeeOffsetShare,
      },
      pricingFloorMultiple: row.pricingFloorMultiple,
    };
  } catch {
    // Table not present yet (pre-migration) — fall back to the built-in defaults.
    return INCENTIVE_RULES;
  }
}
