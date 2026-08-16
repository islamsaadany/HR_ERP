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

/**
 * The per-benefit ceiling — normally 50% of the pool, the only cap on a single flexible benefit.
 *
 * A cycle may switch the cap OFF (spec 031): when a plan year is prorated to a few months, half of
 * a small ceiling is a trivial amount, and the rule meant to encourage variety instead stops the
 * employee using the pool at all. With the cap off, a single benefit is bounded by the POOL
 * CEILING instead — not by nothing. Returning the ceiling rather than `Infinity` is deliberate:
 * `benefitRemaining` stays a real number, the pool keeps binding, and the benefit-vs-pool tie-break
 * in `clampCovered` still names the right limiting rule.
 */
export function flexCap(ceiling: number, capEnabled: boolean = true): number {
  return capEnabled ? Math.floor(ceiling * 0.5) : ceiling;
}

export type AllowanceContext = {
  ceiling: number;
  /** Committed medical premium (already capped at the ceiling); 0 if not committed. Exempt from the 50% cap. */
  medicalPremium: number;
  /** Covered totals (pending + released) per catalog item key. */
  claimedByBenefit: Record<string, number>;
  /** Only consulted when COUNT_LIMIT_ENABLED is true. */
  employmentType: EmploymentType;
  /**
   * Whether the 50%-per-benefit cap applies to THIS cycle (spec 031). Read from the claim's own
   * plan year on the server; the client never supplies it. Defaults to true so a caller that
   * predates the switch keeps the rule.
   */
  flexCapEnabled?: boolean;
};

export type ProposedClaim = {
  key: string;
  name: string;
  fullCost: number; // exact receipt value (no rounding)
  coverageRate: number; // 1–100
  /**
   * A fixed per-band allowance (spec 028 — travel allowance), already prorated to the cycle.
   * When set, this benefit is an ENTITLEMENT: there is no receipt and no coverage rate to
   * apply — the employee requests what remains of the allowance and is paid it in full.
   * `fullCost` is ignored. Null/undefined for every ordinary receipt-based benefit.
   */
  allocation?: number | null;
};

/** Which limit reduced the payout below the coverage-rate share, if any. */
export type ClampedBy = "benefit" | "pool" | null;

export type ClaimEvaluation = {
  /** What will actually be reimbursed — the coverage share after clamping. */
  covered: number;
  /** The coverage-rate share before clamping (fullCost × rate). */
  requested: number;
  cap: number;
  benefitRemaining: number;
  poolRemaining: number;
  clampedBy: ClampedBy;
  errors: string[];
};

/**
 * Reimbursement is the smallest of: the coverage share, what's left on this benefit under the
 * 50% cap, and what's left in the pool.
 *
 * A receipt whose coverage share overshoots what's left is NOT refused — the employee still
 * enters the full price (it has to match their proof) and is paid the remainder, which lands
 * below the headline coverage rate. The 50% cap overrides the coverage rate: a 10,000 receipt
 * at 80% with 7,000 left pays 7,000, an effective 70%. (Refusing it instead paid them nothing
 * and pushed them to understate the receipt to fit — the opposite of what the proof is for.)
 *
 * Shared by the server rules and the client preview so the figure the employee sees before
 * submitting is the figure the server pays.
 */
export function clampCovered(
  requested: number,
  benefitRemaining: number,
  poolRemaining: number
): { covered: number; clampedBy: ClampedBy } {
  const limit = Math.min(benefitRemaining, poolRemaining);
  if (requested <= limit) return { covered: requested, clampedBy: null };
  // Name the tighter limit — they can be equal, and the benefit cap is the one the
  // employee can act on (claim a different benefit), so it wins the tie.
  return { covered: Math.max(0, limit), clampedBy: benefitRemaining <= poolRemaining ? "benefit" : "pool" };
}

/** Total company share already used: committed medical premium + all covered flexible claims. */
export function poolUsed(ctx: AllowanceContext): number {
  const flex = Object.values(ctx.claimedByBenefit).reduce((s, n) => s + n, 0);
  return ctx.medicalPremium + flex;
}

/** Server-authoritative evaluation of one proposed flexible claim against the allowance rules. */
export function evaluateClaim(ctx: AllowanceContext, claim: ProposedClaim): ClaimEvaluation {
  const capEnabled = ctx.flexCapEnabled !== false;
  const cap = flexCap(ctx.ceiling, capEnabled);
  const isAllowance = claim.allocation != null;
  // A fixed allowance is bounded by the allowance itself; the 50% cap still applies on top so
  // the rule stays universal (it won't bind in practice — a band amount sits well below half a pool).
  // This `min` is also why lifting the cap doesn't inflate an allowance (spec 031, FR-008): with
  // `cap` raised to the full ceiling the band amount still wins, so an entitlement never grows
  // because a different limit was lifted.
  const benefitCeiling = isAllowance ? Math.min(claim.allocation!, cap) : cap;
  const benefitUsed = ctx.claimedByBenefit[claim.key] ?? 0;
  const benefitRemaining = Math.max(0, benefitCeiling - benefitUsed);
  const poolRemaining = Math.max(0, ctx.ceiling - poolUsed(ctx));
  // An allowance is requested in full — what's left of it IS the ask. A receipt-based claim
  // asks for its coverage share.
  const requested = isAllowance ? benefitRemaining : coveredAmount(claim.fullCost, claim.coverageRate);
  const { covered, clampedBy } = clampCovered(requested, benefitRemaining, poolRemaining);

  const errors: string[] = [];
  if (!isAllowance && (!Number.isFinite(claim.fullCost) || claim.fullCost <= 0)) {
    errors.push("Enter the amount you paid (the full price on your receipt).");
  }
  // Exceeding a limit is no longer a failure — it's paid down to what's left. Only a limit
  // with NOTHING left is a refusal, because there is no amount to reimburse.
  if (benefitRemaining <= 0) {
    errors.push(
      isAllowance
        ? `${claim.name}: you've already claimed your full allowance for this cycle.`
        : capEnabled
          ? `${claim.name}: you've used the full 50% cap (${formatEGP(cap)}) on this benefit.`
          // With the cap off the pool is the only limit, so naming a "50% cap" would be a lie.
          : `${claim.name}: you've used your full pool (${formatEGP(cap)}) on this benefit.`
    );
  } else if (poolRemaining <= 0) {
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
  return { covered, requested, cap, benefitRemaining, poolRemaining, clampedBy, errors };
}
