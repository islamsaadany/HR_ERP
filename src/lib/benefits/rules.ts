import type { EmploymentType } from "@prisma/client";
import { formatEGP } from "@/lib/labels";
import { coveredAmount } from "@/lib/benefits/coverage";

/**
 * Claim-based living allowance (spec 018). There is no basket to submit and no per-benefit
 * allocation. Employees claim as they spend; two server-authoritative limits govern spend:
 *  - a 50%-of-pool cap per benefit (cumulative covered claims), for FULL_TIME and PART_TIME;
 *  - the pool ceiling across the committed medical premium plus all covered flexible claims.
 */

// Selection-count limit — RETAINED but DORMANT (spec 018). With the claim-based allowance the
// 50% cap + pool ceiling govern variety, so the count limit is off by default. Flip this flag to
// re-enable server-side enforcement (constants kept for that future case).
export const COUNT_LIMIT_ENABLED = false;
export const MAX_SELECT_FULL_TIME = 5;
export const MAX_SELECT_PART_TIME = 3;

export function maxSelect(employmentType: EmploymentType): number {
  return employmentType === "FULL_TIME" ? MAX_SELECT_FULL_TIME : MAX_SELECT_PART_TIME;
}

// Medical premium is priced per-person by age band (spec 023) — see `src/lib/benefits/rates.ts`
// (`sumMedicalPremium`). The old relationship-based `computeMedicalPremium`/`MedicalRate`/`MedicalConfig`
// were removed with that change.

/** The per-benefit ceiling (50% of the pool) — the only cap on a single flexible benefit. */
export function flexCap(ceiling: number): number {
  return Math.floor(ceiling * 0.5);
}

export type AllowanceContext = {
  ceiling: number;
  /** Committed medical premium (already capped at the ceiling); 0 if not committed. Exempt from the 50% cap. */
  medicalPremium: number;
  /** Covered totals (pending + released) per catalog item key. */
  claimedByBenefit: Record<string, number>;
  /** Only consulted when COUNT_LIMIT_ENABLED is true. */
  employmentType: EmploymentType;
};

export type ProposedClaim = {
  key: string;
  name: string;
  fullCost: number; // exact receipt value (no rounding)
  coverageRate: number; // 1–100
};

export type ClaimEvaluation = {
  covered: number;
  cap: number;
  benefitRemaining: number;
  poolRemaining: number;
  errors: string[];
};

/** Total company share already used: committed medical premium + all covered flexible claims. */
export function poolUsed(ctx: AllowanceContext): number {
  const flex = Object.values(ctx.claimedByBenefit).reduce((s, n) => s + n, 0);
  return ctx.medicalPremium + flex;
}

/** Server-authoritative evaluation of one proposed flexible claim against the allowance rules. */
export function evaluateClaim(ctx: AllowanceContext, claim: ProposedClaim): ClaimEvaluation {
  const cap = flexCap(ctx.ceiling);
  const covered = coveredAmount(claim.fullCost, claim.coverageRate);
  const benefitUsed = ctx.claimedByBenefit[claim.key] ?? 0;
  const benefitRemaining = Math.max(0, cap - benefitUsed);
  const poolRemaining = Math.max(0, ctx.ceiling - poolUsed(ctx));

  const errors: string[] = [];
  if (!Number.isFinite(claim.fullCost) || claim.fullCost <= 0) {
    errors.push("Enter the amount you paid (the full price on your receipt).");
  }
  if (covered > benefitRemaining) {
    errors.push(
      `${claim.name}: exceeds the 50% cap — only ${formatEGP(benefitRemaining)} left to claim on this benefit.`
    );
  }
  if (covered > poolRemaining) {
    errors.push("Your pool is fully used — contact HR.");
  }
  if (COUNT_LIMIT_ENABLED) {
    const distinct = new Set(
      Object.keys(ctx.claimedByBenefit).filter((k) => (ctx.claimedByBenefit[k] ?? 0) > 0)
    );
    if (!distinct.has(claim.key) && distinct.size >= maxSelect(ctx.employmentType)) {
      errors.push(`Too many benefits selected (max ${maxSelect(ctx.employmentType)}).`);
    }
  }
  return { covered, cap, benefitRemaining, poolRemaining, errors };
}
