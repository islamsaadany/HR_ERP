import type { EmploymentType, Prisma, TenureBand } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveTenureBand } from "@/lib/tenure";
import {
  classifyEligibility,
  hasKnownStartDate,
  poolCycleFraction,
  prorate,
  type PlanYearWindow,
} from "@/lib/benefits/proration";
import { medicalCycleCharge, planYearWindow } from "@/lib/benefits/config";

/**
 * THE pool ceiling and THE pool balance — one definition, used by every path that reads or
 * spends the pool (2026-08-20).
 *
 * WHY THIS EXISTS
 * The ceiling was being derived independently in three places and they did not agree:
 * `report.ts` derived the band from the hire date and prorated on the cycle, `claim-actions.ts`
 * did the same but only for the banded case, and `flatAllocation` (HR's Record entry) used the
 * RAW un-prorated ceiling with the STORED tenure band. Three derivations of one money rule means
 * the strictest path blocks and the loosest path pays — which is exactly how someone ends up over
 * their ceiling. Everything now calls in here.
 *
 * The other half of the same bug: `remaining` here is SIGNED. The report used to floor it at zero,
 * so an employee 2,093 over their pool rendered as "Remaining 0 · Pool exhausted" — indistinguishable
 * from someone who had spent it exactly. Callers that need a spendable figure clamp it themselves;
 * callers that need the truth (the report, the over-pool list) read it as-is.
 */

/** Why an employee has no pool at all this cycle — shown verbatim in the report. */
export type NoPoolReason =
  | "no employment type set"
  | "no start date on file"
  | "no pool ceiling configured"
  | "not yet benefits-eligible"
  | "under 3 months — nothing unlocked yet";

export type CeilingResult =
  | { ceiling: number; proratedFrom: number | null; band: TenureBand | null; reason: null }
  | { ceiling: null; proratedFrom: null; band: TenureBand | null; reason: NoPoolReason };

/**
 * The employee's ceiling for this cycle, prorated.
 *
 * Two branches, and they use DIFFERENT gates on purpose:
 *  - Banded (6+ months): the pool unlocks at 6 months and is scaled to the CYCLE's length.
 *  - Sub-6-month (no band yet): only medical has unlocked, at 3 months, so the ceiling is the
 *    entry tier at that person's mid-joiner fraction — otherwise a new starter who is allowed
 *    to buy medical would be measured against a ceiling of zero.
 *
 * Pure: the caller supplies the configured amounts, so the same function serves a per-employee
 * check and a whole-company report without one query per row.
 */
export function poolCeiling(
  employee: { employmentType: EmploymentType | null; startDate: Date | null },
  ceilingFor: (t: EmploymentType, band: TenureBand) => number | null,
  window: PlanYearWindow
): CeilingResult {
  const band = deriveTenureBand(employee.startDate).band;
  const none = (reason: NoPoolReason): CeilingResult => ({
    ceiling: null,
    proratedFrom: null,
    band,
    reason,
  });

  if (!employee.employmentType) return none("no employment type set");
  if (!hasKnownStartDate(employee.startDate)) return none("no start date on file");

  if (band) {
    const annual = ceilingFor(employee.employmentType, band);
    if (annual == null) return none("no pool ceiling configured");
    const fraction = poolCycleFraction(classifyEligibility(employee.startDate, 6, window), window);
    if (fraction <= 0) return none("not yet benefits-eligible");
    return {
      ceiling: prorate(annual, fraction),
      proratedFrom: fraction < 1 ? annual : null,
      band,
      reason: null,
    };
  }

  const entry = ceilingFor(employee.employmentType, "BAND_6MO_2Y");
  if (entry == null) return none("no pool ceiling configured");
  const medical = classifyEligibility(employee.startDate, 3, window);
  if (medical.status === "NOT_YET") return none("under 3 months — nothing unlocked yet");
  return {
    ceiling: prorate(entry, medical.fraction),
    proratedFrom: medical.fraction < 1 ? entry : null,
    band,
    reason: null,
  };
}

export type PoolState = {
  /** Prorated ceiling for the cycle, or null when this person has no pool (see `reason`). */
  ceiling: number | null;
  reason: NoPoolReason | null;
  band: TenureBand | null;
  /** The un-prorated annual figure, when the ceiling was prorated down from it. */
  proratedFrom: number | null;
  /** This cycle's medical charge — what the pool is actually carrying, not the whole premium. */
  medical: number;
  /** Non-rejected flexible (catalog) claims in this cycle. */
  flex: number;
  /** medical + flex. */
  used: number;
  /**
   * ceiling − used. SIGNED: negative means the pool has been overdrawn. Null when there is no
   * ceiling to measure against. Never floor this at zero — that is what hid the overruns.
   */
  remaining: number | null;
  /** True when this person is currently past their ceiling. */
  over: boolean;
};

/** How much of the pool a write may still consume — 0 when overdrawn or unmeasurable. */
export function spendable(state: PoolState): number {
  return state.remaining == null ? 0 : Math.max(0, state.remaining);
}

/**
 * Read one employee's live pool position for a cycle.
 *
 * `excludeMedicalCommitmentId` lets a RE-PRICE measure itself: the commitment being re-priced is
 * already counted in `medical`, so without excluding it every re-price would compare the new
 * premium against a pool that still holds the old one and refuse a change of a single pound.
 */
export async function poolStateFor(
  userId: string,
  planYear: { id: string; startDate: Date | null; endDate: Date | null },
  opts: {
    excludeMedicalCommitmentId?: string;
    /**
     * Read through a transaction client instead of the global one. A caller that is about to
     * SPEND the pool must re-read it inside the same transaction as its write — otherwise two
     * concurrent claims each read the same free pool and both pass.
     */
    db?: Prisma.TransactionClient;
  } = {}
): Promise<PoolState> {
  const db = opts.db ?? prisma;
  const [user, ceilings, claims, commitments] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { employmentType: true, startDate: true },
    }),
    db.poolCeiling.findMany(),
    db.benefitClaim.findMany({
      where: {
        userId,
        planYearId: planYear.id,
        catalogItemId: { not: null },
        // Every non-rejected claim reserves pool money — a pending one included, or two
        // submissions in a row would each see the other as free.
        status: { not: "REJECTED" },
      },
      select: { amount: true },
    }),
    db.medicalCommitment.findMany({
      where: {
        userId,
        OR: [{ cycleCharges: { some: { planYearId: planYear.id } } }, { planYearId: planYear.id }],
      },
      include: { cycleCharges: true },
      orderBy: { committedAt: "desc" },
    }),
  ]);

  const empty: PoolState = {
    ceiling: null,
    reason: "no employment type set",
    band: null,
    proratedFrom: null,
    medical: 0,
    flex: 0,
    used: 0,
    remaining: null,
    over: false,
  };
  if (!user) return empty;

  const ceilingFor = (t: EmploymentType, band: TenureBand): number | null =>
    ceilings.find((c) => c.employmentType === t && c.tenureBand === band)?.amount ?? null;
  const derived = poolCeiling(user, ceilingFor, planYearWindow(planYear));

  const counted = opts.excludeMedicalCommitmentId
    ? commitments.filter((c) => c.id !== opts.excludeMedicalCommitmentId)
    : commitments;
  // "Latest wins" matches the report and getMedicalCommitment — a person has one live
  // commitment per term; a second is a correction, not a second premium.
  const medical = medicalCycleCharge(counted[0] ?? null, planYear.id);
  const flex = claims.reduce((sum, c) => sum + c.amount, 0);
  const used = medical + flex;
  const remaining = derived.ceiling == null ? null : derived.ceiling - used;

  return {
    ceiling: derived.ceiling,
    reason: derived.reason,
    band: derived.band,
    proratedFrom: derived.proratedFrom,
    medical,
    flex,
    used,
    remaining,
    over: remaining != null && remaining < 0,
  };
}
