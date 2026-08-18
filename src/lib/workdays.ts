// Working-day counting (spec 035). Pure, deterministic, no I/O — shared by the server
// (authoritative counts, zero-working-day refusal) and the client (the live form preview),
// exactly like the benefits proration helpers.
//
// A day counts unless it is a Friday, a Saturday, or a date on the HR public-holidays
// list. There is NO entitlement math — counts inform, they never block (the one server
// refusal is a request containing zero working days, which would book nothing).
//
// All dates are handled at UTC midnight (how `<input type="date">` values are stored),
// so day-of-week never shifts with the server's or viewer's timezone.

/** yyyy-mm-dd key for a date's UTC calendar day — the holiday-set key. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Friday (5) + Saturday (6) — the company weekend, fixed by decision 2026-08-18. */
export function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 5 || dow === 6;
}

/** Working days in [start, end] inclusive, excluding Fri/Sat and listed holidays. */
export function countWorkingDays(start: Date, end: Date, holidays: ReadonlySet<string>): number {
  if (start.getTime() > end.getTime()) return 0;
  let count = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cursor.getTime() <= last) {
    if (!isWeekend(cursor) && !holidays.has(dayKey(cursor))) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * The part of [start, end] that falls inside `year`, counted in working days. A request
 * spanning New Year contributes each year's days to that year only (spec 035 edge case).
 */
export function workingDaysInYear(
  start: Date,
  end: Date,
  year: number,
  holidays: ReadonlySet<string>
): number {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const from = start.getTime() > yearStart.getTime() ? start : yearStart;
  const to = end.getTime() < yearEnd.getTime() ? end : yearEnd;
  return countWorkingDays(from, to, holidays);
}

/**
 * Sum a person's approved working days for one calendar year. Requests are pre-filtered
 * to approved by the caller; ranges outside the year contribute nothing.
 */
export function takenInYear(
  requests: { startDate: Date; endDate: Date }[],
  year: number,
  holidays: ReadonlySet<string>
): number {
  return requests.reduce((n, r) => n + workingDaysInYear(r.startDate, r.endDate, year, holidays), 0);
}
