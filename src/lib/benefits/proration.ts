// Mid-year starter proration (spec 019). Pure, deterministic, no I/O.
//
// Shared by the SERVER benefits rules (authoritative — enforced at claim/commit
// time) and the CLIENT board (display mirror only). All money enforcement that
// relies on these values happens server-side; the client is never trusted.
//
// Rule: an employee who first becomes eligible partway through a plan year gets a
// prorated allowance for the remaining WHOLE months of that year:
//   prorated = round(annual × remainingWholeMonths ÷ 12)
// Full amount once eligible from the plan year's first day; nothing before then.

import { addMonths } from "@/lib/derive";

/** The plan year's proration window, or null when either date is unset. */
export type PlanYearWindow = { start: Date; end: Date } | null;

export type EligibilityStatus = "FULL" | "PRORATED" | "NOT_YET";

export type Eligibility = {
  status: EligibilityStatus;
  /** 0..12 — whole months of the plan year the employee is eligible for. */
  remainingWholeMonths: number;
  /** remainingWholeMonths / 12. FULL → 1, NOT_YET → 0. */
  fraction: number;
};

/** startDate + thresholdMonths of service; null when the start date is unknown. */
export function eligibilityDate(
  startDate: Date | null | undefined,
  thresholdMonths: number
): Date | null {
  if (!startDate) return null;
  return addMonths(startDate, thresholdMonths);
}

/**
 * Count of COMPLETE calendar months within [from, end] (inclusive end), UNCAPPED.
 * A month counts only if its whole span sits inside the window, so a partial first
 * month (from not on the 1st) and a partial last month are both excluded.
 * Examples: 1 Oct → 31 Dec = 3; 15 Oct → 31 Dec = 2; 1 Jun 2026 → 31 May 2027 = 12.
 *
 * Used for MEDICAL POLICY TERMS (spec 027), whose length is whatever HR configures —
 * a term of 13 months must count 13, not be silently rounded to a year. Pool proration
 * uses {@link remainingWholeMonths}, which caps this at 12; see the note there.
 */
export function wholeMonthsBetween(from: Date, end: Date): number {
  if (from.getTime() > end.getTime()) return 0;
  let year = from.getFullYear();
  // A partial first month doesn't count: start at the 1st of the next month.
  let month = from.getDate() > 1 ? from.getMonth() + 1 : from.getMonth();
  let count = 0;
  for (;;) {
    const monthEnd = new Date(year, month + 1, 0); // last day of (year, month)
    if (monthEnd.getTime() > end.getTime()) break; // month not fully inside the window
    count += 1;
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return count;
}

/**
 * Whole months within [from, end], CAPPED AT 12 — the plan-year view.
 *
 * The cap is a business rule, not an implementation detail: a benefits cycle grants at
 * most one year's entitlement, so a window longer than twelve months must not yield a
 * proration fraction above 1 (that would hand every employee more than their pool
 * ceiling). It used to be enforced incidentally, by the counting loop's bound; it is now
 * explicit here, and `cycleFraction` clamps as well so neither relies on the other.
 */
export function remainingWholeMonths(from: Date, end: Date): number {
  return Math.min(12, wholeMonthsBetween(from, end));
}

const FULL: Eligibility = { status: "FULL", remainingWholeMonths: 12, fraction: 1 };
const NOT_YET: Eligibility = { status: "NOT_YET", remainingWholeMonths: 0, fraction: 0 };

/**
 * Classify an employee for the active plan year against a service threshold.
 *
 * Fail-safe fallbacks (toward paying the full, known-good amount):
 *  - window null (no dates set) → FULL
 *  - startDate null (unknown eligibility date) → FULL
 * Otherwise:
 *  - eligibility date ≤ window.start → FULL
 *  - window.start < eligibility date ≤ window.end → PRORATED
 *  - eligibility date > window.end → NOT_YET
 */
export function classifyEligibility(
  startDate: Date | null | undefined,
  thresholdMonths: number,
  window: PlanYearWindow
): Eligibility {
  if (!window) return FULL;
  const elig = eligibilityDate(startDate, thresholdMonths);
  if (!elig) return FULL;

  if (elig.getTime() <= window.start.getTime()) return FULL;
  if (elig.getTime() > window.end.getTime()) return NOT_YET;

  const months = remainingWholeMonths(elig, window.end);
  return { status: "PRORATED", remainingWholeMonths: months, fraction: months / 12 };
}

/** round(annual × fraction) — nearest whole EGP. Never negative. */
export function prorate(annual: number, fraction: number): number {
  if (annual <= 0 || fraction <= 0) return 0;
  return Math.round(annual * fraction);
}

/**
 * Whole calendar months the plan-year cycle itself spans (spec 019 — cycle-length
 * proration). A full-year cycle → 12; a half-year cycle (e.g. 1 Jan – 30 Jun) → 6.
 * No window set → 12 (fail-safe to full amounts, matching classifyEligibility).
 */
export function cycleWholeMonths(window: PlanYearWindow): number {
  if (!window) return 12;
  return remainingWholeMonths(window.start, window.end);
}

/**
 * cycleWholeMonths ÷ 12 — the fraction of a full year the cycle spans. 1 when no window.
 * Clamped to 1: a cycle longer than a year still grants at most a full year's pool, and a
 * fraction above 1 would mean every employee had been handed more than their ceiling.
 */
export function cycleFraction(window: PlanYearWindow): number {
  return Math.min(1, cycleWholeMonths(window) / 12);
}

/**
 * The proration fraction for the flexible pool and Professional development under
 * cycle-length proration (spec 019, revised): scaled to the CYCLE's length for every
 * eligible employee — existing staff and mid-cycle joiners alike, with no extra
 * reduction for joining partway through the cycle. A not-yet-eligible employee still
 * gets nothing. (Medical is unaffected — it keeps its own mid-joiner fraction.)
 */
export function poolCycleFraction(eligibility: Eligibility, window: PlanYearWindow): number {
  if (eligibility.status === "NOT_YET") return 0;
  return cycleFraction(window);
}
