// Break shapes around a holiday (spec 037). Pure, deterministic, no I/O — the same posture
// as lib/workdays.ts, so the announcement drafter, the dashboard banner and the prefill link
// all describe the calendar from ONE implementation instead of three.
//
// Definitions, fixed by the 2026-08-19 alignment:
//  - a day is OFF when it is a Friday, a Saturday, or listed in the holiday set;
//  - a BRIDGE is EXACTLY ONE working day between two off-days ("1 day is the classic").
//    A two-day gap is not a bridge and is never suggested;
//  - a LONG WEEKEND is a run of 3+ consecutive off-days that includes the Fri/Sat weekend.
//
// All dates are handled at UTC midnight, matching how `<input type="date">` values are
// stored, so nothing shifts with the server's or viewer's timezone.

import { dayKey, isWeekend } from "@/lib/workdays";

/** A day n days from `d`, at UTC midnight. Negative walks backwards. */
export function addDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

/** Whole days between two dates, inclusive of both ends. */
function inclusiveDays(start: Date, end: Date): number {
  const ms = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) -
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  return Math.floor(ms / 86_400_000) + 1;
}

/** Is this a non-working day — weekend or listed holiday? */
export function isOffDay(d: Date, holidays: ReadonlySet<string>): boolean {
  return isWeekend(d) || holidays.has(dayKey(d));
}

export type BreakShape = {
  /** First and last day of the contiguous run of off-days containing the holiday. */
  breakStart: Date;
  breakEnd: Date;
  /** Calendar days in that run. */
  totalDaysOff: number;
  /** Single working days adjoining the run — at most one on each side, by definition. */
  bridges: Date[];
  /** True when the run is 3+ days and includes the Friday/Saturday weekend. */
  longWeekend: boolean;
  /**
   * The range worth suggesting in the "request this" call to action: the bridge day(s).
   * Null when the calendar offers no bridge — we never invent one to have something to link.
   */
  suggested: { start: Date; end: Date } | null;
  /** The whole stretch a person is away if they take the bridges: run + bridges + any run beyond. */
  stretchStart: Date;
  stretchEnd: Date;
  /** Calendar days in that stretch — the "nine days straight" figure. */
  stretchDays: number;
};

/**
 * Describe the break around one holiday's ACTUAL date range.
 *
 * `holidays` must already contain this holiday's own days (it comes from `getHolidaySet`,
 * which expands every stored range), so the walk outward treats them as off like any other.
 */
export function describeBreak(
  holidayStart: Date,
  holidayEnd: Date,
  holidays: ReadonlySet<string>
): BreakShape {
  // Grow the run of off-days outward from the holiday itself.
  let breakStart = new Date(Date.UTC(holidayStart.getUTCFullYear(), holidayStart.getUTCMonth(), holidayStart.getUTCDate()));
  let breakEnd = new Date(Date.UTC(holidayEnd.getUTCFullYear(), holidayEnd.getUTCMonth(), holidayEnd.getUTCDate()));
  while (isOffDay(addDays(breakStart, -1), holidays)) breakStart = addDays(breakStart, -1);
  while (isOffDay(addDays(breakEnd, 1), holidays)) breakEnd = addDays(breakEnd, 1);

  // A bridge exists on a side when the ONE day beyond the run is a working day and the day
  // after that is off again. Two working days in a row is a working week, not a bridge.
  const bridges: Date[] = [];
  const before = addDays(breakStart, -1);
  if (!isOffDay(before, holidays) && isOffDay(addDays(before, -1), holidays)) bridges.push(before);
  const after = addDays(breakEnd, 1);
  if (!isOffDay(after, holidays) && isOffDay(addDays(after, 1), holidays)) bridges.push(after);
  bridges.sort((a, b) => a.getTime() - b.getTime());

  // The stretch someone actually gets by taking the bridges: keep walking past each bridge
  // through whatever off-days follow it.
  let stretchStart = breakStart;
  let stretchEnd = breakEnd;
  if (bridges.some((d) => d.getTime() === before.getTime())) {
    stretchStart = addDays(before, -1);
    while (isOffDay(addDays(stretchStart, -1), holidays)) stretchStart = addDays(stretchStart, -1);
  }
  if (bridges.some((d) => d.getTime() === after.getTime())) {
    stretchEnd = addDays(after, 1);
    while (isOffDay(addDays(stretchEnd, 1), holidays)) stretchEnd = addDays(stretchEnd, 1);
  }

  const totalDaysOff = inclusiveDays(breakStart, breakEnd);
  const runTouchesWeekend = (() => {
    for (let d = breakStart; d.getTime() <= breakEnd.getTime(); d = addDays(d, 1)) {
      if (isWeekend(d)) return true;
    }
    return false;
  })();

  return {
    breakStart,
    breakEnd,
    totalDaysOff,
    bridges,
    longWeekend: totalDaysOff >= 3 && runTouchesWeekend,
    suggested: bridges.length
      ? { start: bridges[0], end: bridges[bridges.length - 1] }
      : null,
    stretchStart,
    stretchEnd,
    stretchDays: inclusiveDays(stretchStart, stretchEnd),
  };
}
