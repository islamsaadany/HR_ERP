/**
 * Incentive Scheme — the calculation engine (server-authoritative, pure).
 *
 * This module encodes the FINAL rules from "Forefront Consulting — Team Benefits
 * System v1.5" (Business Partner Fee, Commission, Profit Share, gates). Every
 * constant here is a settled rule, not a placeholder — do not edit without a
 * corresponding change to the document. Nothing in here touches the database or
 * the request; it is a set of pure functions the import/report layers call.
 *
 * Money rounding: all payable figures are rounded to 2 decimals, matching the
 * document's appendices.
 */

export type AssignmentType = "PRJ" | "RET";

/** All final rule constants, in one place (single source of truth). */
/**
 * The editable shape of the incentive rules. `INCENTIVE_RULES` is the built-in
 * default; an admin-saved `IncentiveConfig` row (see `config.ts`) produces the
 * same shape at runtime. Every rule function accepts an optional `RuleConfig`
 * and defaults to `INCENTIVE_RULES`, so nothing changes unless a value is edited.
 */
export type RuleConfig = {
  envelopeRate: number;
  marginGate: number;
  contributorTiers: { min: number; deduction: number }[];
  maxTotalDeduction: number;
  contributorCapMonths: number;
  contributorFloorMonths: number;
  commissionReferred: number;
  commissionSelfGenerated: number;
  retainerCommissionMonths: number;
  cycleMonths: number;
  vendorMarkupMin: number;
  profitShare: {
    targetMargin: number;
    floorMargin: number;
    ceilingMonths: number;
    leadFeeOffsetShare: number;
  };
  pricingFloorMultiple: number;
};

export const INCENTIVE_RULES: RuleConfig = {
  /** Compensation envelope = Gross Profit × 3%. */
  envelopeRate: 0.03,
  /** A client pays a Business Partner Fee only at ≥70% gross margin (binary). */
  marginGate: 0.7,
  /** Contributor tiers → deduction from the Lead's fee (by contribution share). */
  contributorTiers: [
    { min: 0.7, deduction: 0.6 }, // 70%+
    { min: 0.5, deduction: 0.3 }, // 50–69%
    { min: 0.2, deduction: 0.1 }, // 20–49%
    { min: 0, deduction: 0 }, //     under 20%
  ],
  /** Deductions add across contributors but never exceed 60% (Lead keeps ≥40%). */
  maxTotalDeduction: 0.6,
  /** Contributor payment cap = half of one month's net salary. */
  contributorCapMonths: 0.5,
  /** Below 5% of one month's net salary, no contributor payment is made. */
  contributorFloorMonths: 0.05,
  /** Commission rates on net revenue. */
  commissionReferred: 0.03, // lead referred to the business developer, who closed it
  commissionSelfGenerated: 0.05, // business developer generated AND closed it
  /** A retainer's commission is on its first three months, paid once. */
  retainerCommissionMonths: 3,
  /** A cycle is a half-year. */
  cycleMonths: 6,
  /** Minimum markup applied to an external vendor's pass-through cost (validation). */
  vendorMarkupMin: 0.1,
  /** Profit Share (proposed, not adopted). */
  profitShare: {
    targetMargin: 0.3, // one month at 30% net margin and above
    floorMargin: 0.15, // nothing below 15%
    ceilingMonths: 1,
    leadFeeOffsetShare: 0.5, // half the Business Partner Fee offsets entitlement
  },
  /** Pricing floor: bill at ≥ 3.33× consultant cost/hour (Appendix B guide). */
  pricingFloorMultiple: 3.33,
};

/**
 * Round to 2 decimals using round-half-to-even (banker's rounding), which is
 * what the document's appendices use — e.g. 40,904.865 → 40,904.86, not .87.
 * Banker's rounding avoids the upward bias of half-up across many payouts.
 */
export function money(n: number): number {
  const scaled = n * 100;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let cents: number;
  if (Math.abs(diff - 0.5) < 1e-6) {
    // Exact half → round to the even cent.
    cents = floor % 2 === 0 ? floor : floor + 1;
  } else {
    cents = Math.round(scaled);
  }
  return cents / 100;
}

export function grossProfit(revenue: number, directCost: number): number {
  return revenue - directCost;
}

export function grossMargin(revenue: number, directCost: number): number {
  if (revenue <= 0) return 0;
  return grossProfit(revenue, directCost) / revenue;
}

/**
 * Net revenue = client revenue excluding the external vendor's own cost, but
 * including the markup (which already sits inside revenue). Commission and the
 * profit-share margin use net revenue.
 */
export function netRevenue(revenue: number, vendorCost: number): number {
  return revenue - Math.max(0, vendorCost || 0);
}

/** The envelope for an assignment. Zero if the 70% margin gate is not cleared. */
export function envelope(revenue: number, directCost: number, cfg: RuleConfig = INCENTIVE_RULES): number {
  if (grossMargin(revenue, directCost) < cfg.marginGate) return 0;
  return money(grossProfit(revenue, directCost) * cfg.envelopeRate);
}

/** The deduction a single contributor's share implies (0 under 20%). */
export function tierDeduction(contributionShare: number, cfg: RuleConfig = INCENTIVE_RULES): number {
  for (const tier of cfg.contributorTiers) {
    if (contributionShare >= tier.min) return tier.deduction;
  }
  return 0;
}

export type ContributionInput = {
  name: string;
  /** Share of the assignment as a fraction 0..1 (already validated to total 1). */
  share: number;
};

export type ContributorResult = {
  name: string;
  share: number;
  tier: number; // deduction rate this contributor's tier implies
  allocation: number; // envelope × tier
  payment: number; // after floor/cap
  flooredToZero: boolean; // allocation below the 5%-of-month floor
  capped: boolean; // payment limited by the half-month cap
};

export type AssignmentInput = {
  client: string;
  type: AssignmentType;
  revenue: number;
  directCost: number;
  vendorCost?: number;
  markupPct?: number;
  leadName: string;
  leadEligible: boolean; // eligible_to_lead — stands in for the 50% utilisation gate
  bd: string; // business developer (commission earner)
  leadSource: string; // who sourced the lead; bd === leadSource ⇒ self-generated (5%)
  /** Whether this assignment is payable this cycle (closed project / active retainer). */
  payable: boolean;
  /** Contributions across the team INCLUDING the Lead's own, fractions summing to 1. */
  contributions: ContributionInput[];
  /** Net monthly salary per person name (for the contributor floor/cap). */
  salaries: Record<string, number>;
};

export type CommissionResult = {
  earner: string;
  rate: number; // 0.03 or 0.05
  selfGenerated: boolean;
  base: number; // net revenue the rate is applied to
  amount: number;
};

export type AssignmentResult = {
  client: string;
  type: AssignmentType;
  payable: boolean;
  grossProfit: number;
  grossMarginPct: number;
  marginGatePassed: boolean;
  netRevenue: number;
  envelope: number;
  totalDeduction: number;
  leadName: string;
  leadFee: number; // 0 if the lead is not eligible this cycle
  leadFeeWithheld: number; // the fee earned-but-withheld when the lead is ineligible
  leadEligible: boolean;
  contributors: ContributorResult[];
  firmRetained: number;
  commission: CommissionResult | null;
};

/**
 * Compute the full Business Partner Fee + Commission outcome for one assignment.
 * Assumes `contributions` are already validated to total 1 (the import layer
 * flags and blocks anything that does not reconcile).
 */
export function computeAssignment(a: AssignmentInput, cfg: RuleConfig = INCENTIVE_RULES): AssignmentResult {
  const gp = grossProfit(a.revenue, a.directCost);
  const marginPct = grossMargin(a.revenue, a.directCost);
  const marginGatePassed = marginPct >= cfg.marginGate;
  const net = netRevenue(a.revenue, a.vendorCost ?? 0);

  // Nothing triggers until the assignment is payable (closed project / active retainer).
  if (!a.payable) {
    return {
      client: a.client,
      type: a.type,
      payable: false,
      grossProfit: money(gp),
      grossMarginPct: marginPct,
      marginGatePassed,
      netRevenue: money(net),
      envelope: 0,
      totalDeduction: 0,
      leadName: a.leadName,
      leadFee: 0,
      leadFeeWithheld: 0,
      leadEligible: a.leadEligible,
      contributors: [],
      firmRetained: 0,
      commission: null,
    };
  }

  const env = envelope(a.revenue, a.directCost, cfg);

  // Contributors are everyone on the assignment other than the Lead. The Lead's
  // own contribution is recorded but earns no allocation and drives no deduction.
  const leadKey = a.leadName.trim().toLowerCase();
  const contributors = a.contributions.filter((c) => c.name.trim().toLowerCase() !== leadKey);

  let totalDeduction = 0;
  for (const c of contributors) totalDeduction += tierDeduction(c.share, cfg);
  totalDeduction = Math.min(totalDeduction, cfg.maxTotalDeduction);

  const contributorResults: ContributorResult[] = contributors.map((c) => {
    const tier = tierDeduction(c.share, cfg);
    const allocation = money(env * tier);
    const salary = a.salaries[c.name] ?? a.salaries[c.name.trim()] ?? 0;
    const floor = salary * cfg.contributorFloorMonths;
    const cap = salary * cfg.contributorCapMonths;
    let payment = allocation;
    let flooredToZero = false;
    let capped = false;
    if (allocation < floor) {
      payment = 0;
      flooredToZero = true;
    } else if (payment > cap) {
      payment = money(cap);
      capped = true;
    }
    return { name: c.name, share: c.share, tier, allocation, payment, flooredToZero, capped };
  });

  const leadFeeFull = money(env * (1 - totalDeduction));
  const leadFee = a.leadEligible ? leadFeeFull : 0;
  const leadFeeWithheld = a.leadEligible ? 0 : leadFeeFull;

  const paidToContributors = contributorResults.reduce((s, c) => s + c.payment, 0);
  // The firm retains the envelope not paid out as the (earned) Lead fee or
  // contributor payments — chiefly the gap where a contributor is floored to £0.
  // Net against the EARNED lead fee (leadFeeFull): a withheld fee is deferred to
  // the lead, not retained by the firm. Clamp sub-cent rounding to zero.
  const firmRetained = money(Math.max(0, env - leadFeeFull - paidToContributors));

  // Commission — protected, independent of the gates and of Part 1.
  const selfGenerated = a.bd.trim().toLowerCase() === a.leadSource.trim().toLowerCase();
  const rate = selfGenerated
    ? cfg.commissionSelfGenerated
    : cfg.commissionReferred;
  // Projects: full net revenue. Retainers: first three months of the half, once.
  const base =
    a.type === "RET"
      ? net * (cfg.retainerCommissionMonths / cfg.cycleMonths)
      : net;
  const commission: CommissionResult = {
    earner: a.bd,
    rate,
    selfGenerated,
    base: money(base),
    amount: money(base * rate),
  };

  return {
    client: a.client,
    type: a.type,
    payable: true,
    grossProfit: money(gp),
    grossMarginPct: marginPct,
    marginGatePassed,
    netRevenue: money(net),
    envelope: env,
    totalDeduction,
    leadName: a.leadName,
    leadFee,
    leadFeeWithheld,
    leadEligible: a.leadEligible,
    contributors: contributorResults,
    firmRetained,
    commission,
  };
}

/**
 * Profit Share entitlement (PROPOSED, NOT ADOPTED). Kept computable so the tool
 * can show it, but it is excluded from released totals.
 *
 * Entitlement = (Net Margin ÷ 30%) × one month net salary,
 * floored at 15% (nothing below) and ceilinged at one month (30% and above).
 */
export function profitShareEntitlement(
  netMarginPct: number,
  monthlyNetSalary: number,
  cfg: RuleConfig = INCENTIVE_RULES
): number {
  const { floorMargin, targetMargin, ceilingMonths } = cfg.profitShare;
  if (netMarginPct < floorMargin) return 0;
  const months = Math.min(netMarginPct / targetMargin, ceilingMonths);
  return money(months * monthlyNetSalary);
}
