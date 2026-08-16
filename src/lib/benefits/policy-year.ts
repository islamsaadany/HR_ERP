/**
 * Medical policy year — splitting a committed premium across the benefits cycles it covers
 * (spec 027). Pure, deterministic, no I/O, so the exact-sum invariant is cheaply provable.
 *
 * The insurance term runs on its own schedule (1 Jun → 31 May) while the benefits cycle is the
 * calendar year, so a premium committed in June buys cover that reaches into the NEXT cycle.
 * Committing to a premium and consuming a pool are therefore two different events: the employee
 * commits once to the whole term, but each cycle's pool absorbs only the months of that term
 * falling inside it.
 */

import { wholeMonthsBetween } from "@/lib/benefits/proration";

export type DateRange = { start: Date; end: Date };

/** Whole calendar months common to two ranges. 0 when they don't overlap. */
export function overlapWholeMonths(a: DateRange, b: DateRange): number {
  const start = a.start.getTime() > b.start.getTime() ? a.start : b.start;
  const end = a.end.getTime() < b.end.getTime() ? a.end : b.end;
  if (start.getTime() > end.getTime()) return 0;
  return wholeMonthsBetween(start, end);
}

export type CycleShare<T> = {
  cycle: T;
  /** Whole months of the policy term inside this cycle. */
  overlapMonths: number;
  /** The share of the premium this cycle's pool absorbs. */
  amount: number;
};

export type PremiumSplit<T> = {
  shares: CycleShare<T>[];
  /** Whole months the policy term spans. */
  policyMonths: number;
  /** Months of the term covered by the supplied cycles. */
  allocatedMonths: number;
  /**
   * Premium not yet attributed to any cycle, because the supplied cycles don't span the whole
   * term. Zero once the covering cycles exist. NOT silently folded into the last share — doing
   * so would charge one cycle for months it doesn't cover.
   */
  unallocated: number;
};

/**
 * Split `premium` across the cycles a policy term overlaps.
 *
 * Each cycle takes `floor(premium × itsMonths ÷ policyMonths)`; the reconciling remainder goes
 * to the LAST overlapping cycle, so the shares sum to the premium exactly rather than drifting
 * by a unit or two — but only when the cycles actually span the whole term. When they don't
 * (the covering cycle hasn't been created yet), the shortfall is reported as `unallocated`
 * instead, and picked up when that cycle exists.
 *
 * Cycles are processed in the order given; callers pass them chronologically.
 */
export function splitPremium<T extends DateRange>(
  premium: number,
  policy: DateRange,
  cycles: T[]
): PremiumSplit<T> {
  const policyMonths = wholeMonthsBetween(policy.start, policy.end);
  const safePremium = Number.isFinite(premium) && premium > 0 ? Math.floor(premium) : 0;

  // A term spanning no whole month can't be apportioned by month. Attribute it to the first
  // overlapping cycle rather than inventing a division — a sub-month term is a data-entry
  // artefact, and losing the money would be worse than putting it somewhere defensible.
  if (policyMonths <= 0) {
    const first = cycles.find((c) => overlapDays(policy, c));
    return {
      shares: first ? [{ cycle: first, overlapMonths: 0, amount: safePremium }] : [],
      policyMonths: 0,
      allocatedMonths: 0,
      unallocated: first ? 0 : safePremium,
    };
  }

  const overlapping = cycles
    .map((cycle) => ({ cycle, overlapMonths: overlapWholeMonths(policy, cycle) }))
    .filter((c) => c.overlapMonths > 0);

  const shares: CycleShare<T>[] = overlapping.map(({ cycle, overlapMonths }) => ({
    cycle,
    overlapMonths,
    amount: Math.floor((safePremium * overlapMonths) / policyMonths),
  }));

  const allocatedMonths = shares.reduce((n, s) => n + s.overlapMonths, 0);
  const allocated = shares.reduce((n, s) => n + s.amount, 0);
  const shortfall = safePremium - allocated;

  if (allocatedMonths === policyMonths && shares.length > 0) {
    // The cycles span the term: the shortfall is pure rounding, so give it to the last share
    // and the set now sums to the premium exactly.
    shares[shares.length - 1].amount += shortfall;
    return { shares, policyMonths, allocatedMonths, unallocated: 0 };
  }

  return { shares, policyMonths, allocatedMonths, unallocated: shortfall };
}

/** Whether two ranges share any day at all — used only for the sub-month term above. */
function overlapDays(a: DateRange, b: DateRange): boolean {
  return a.start.getTime() <= b.end.getTime() && b.start.getTime() <= a.end.getTime();
}

/**
 * The period of a policy term for which premium is recoverable from the insurer after an
 * employee's cover ends (spec 027, research D7). It starts at the leave date, NOT at a cycle
 * boundary — so it can include months sitting inside a charge that has already been applied,
 * which is why the cancelled charge alone understates what comes back.
 *
 * Returns null when cover ended at or after the term's end (nothing to recover).
 */
export function recoverablePeriod(policy: DateRange, coverEndedOn: Date): DateRange | null {
  if (coverEndedOn.getTime() >= policy.end.getTime()) return null;
  const start = coverEndedOn.getTime() < policy.start.getTime() ? policy.start : dayAfter(coverEndedOn);
  if (start.getTime() > policy.end.getTime()) return null;
  return { start, end: policy.end };
}

function dayAfter(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
