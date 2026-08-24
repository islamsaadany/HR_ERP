// Calendar quarters (spec 039). Pure, no I/O.
//
// There is no ReviewCycle table and nothing opens or closes a quarter: this
// module has no operator and no admin screen, so a stored cycle row would both
// invite that screen and be able to drift from the calendar it mirrors.
//
// Quarters follow the calendar year, consistent with Time-Off's per-calendar-year
// counting. All dates are UTC midnight, matching `workdays.ts`.

export type Quarter = 1 | 2 | 3 | 4;

export type QuarterRef = { year: number; quarter: Quarter };

export function isQuarter(n: number): n is Quarter {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

/** The quarter a date falls in. */
export function quarterOf(d: Date): QuarterRef {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return { year: d.getUTCFullYear(), quarter: q as Quarter };
}

/** Inclusive [start, end] at UTC midnight. */
export function quarterRange(ref: QuarterRef): { start: Date; end: Date } {
  const firstMonth = (ref.quarter - 1) * 3;
  const start = new Date(Date.UTC(ref.year, firstMonth, 1));
  // Day 0 of the month after the quarter's last month = that month's last day.
  const end = new Date(Date.UTC(ref.year, firstMonth + 3, 0));
  return { start, end };
}

export function previousQuarter(ref: QuarterRef): QuarterRef {
  return ref.quarter === 1
    ? { year: ref.year - 1, quarter: 4 }
    : { year: ref.year, quarter: (ref.quarter - 1) as Quarter };
}

export function nextQuarter(ref: QuarterRef): QuarterRef {
  return ref.quarter === 4
    ? { year: ref.year + 1, quarter: 1 }
    : { year: ref.year, quarter: (ref.quarter + 1) as Quarter };
}

/** "Q3 2026" — the label used everywhere the quarter is named. */
export function quarterLabel(ref: QuarterRef): string {
  return `Q${ref.quarter} ${ref.year}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "Jul – Sep 2026" — the months a quarter covers, for the sheet header. */
export function quarterMonths(ref: QuarterRef): string {
  const firstMonth = (ref.quarter - 1) * 3;
  return `${MONTHS[firstMonth]} – ${MONTHS[firstMonth + 2]} ${ref.year}`;
}

export function isCurrentQuarter(ref: QuarterRef, now = new Date()): boolean {
  const current = quarterOf(now);
  return current.year === ref.year && current.quarter === ref.quarter;
}

/** Whether a quarter has finished. A past quarter can no longer be written to. */
export function hasEnded(ref: QuarterRef, now = new Date()): boolean {
  return now.getTime() > quarterRange(ref).end.getTime() + 24 * 60 * 60 * 1000 - 1;
}

/** The most recent quarters, newest first — the reviews list's spine. */
export function recentQuarters(count: number, now = new Date()): QuarterRef[] {
  const out: QuarterRef[] = [];
  let ref = quarterOf(now);
  for (let i = 0; i < count; i++) {
    out.push(ref);
    ref = previousQuarter(ref);
  }
  return out;
}
