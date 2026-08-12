// Pure derivations from an employee's dates — no Prisma, safe to import on both
// the server and the client. Tenure band and Active/Left status are computed
// from the hire date and end date; they are never hand-entered.

import type { TenureBand, EmployeeStatus } from "@prisma/client";

/**
 * Tenure band derived from the hire date (spec: auto-calculated, not input).
 * Under 6 months → no band yet (not benefits-eligible); then the four bands,
 * capped at the top band beyond 10 years. A missing/future hire date → no band.
 */
export function deriveTenureBand(
  hire: Date | null,
  now: Date = new Date()
): { band: TenureBand | null; note?: string } {
  if (!hire) return { band: null };
  const years = (now.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 0) return { band: null, note: "future hire date — no tenure band yet" };
  if (years < 0.5) return { band: null, note: "under 6 months — not yet benefits-eligible" };
  if (years < 2) return { band: "BAND_6MO_2Y" };
  if (years < 4) return { band: "BAND_2_4Y" };
  if (years < 7) return { band: "BAND_4_7Y" };
  if (years <= 10) return { band: "BAND_7_10Y" };
  return { band: "BAND_7_10Y", note: "over 10 years — capped at the top band" };
}

/** Employment status is driven entirely by the end date: an end date ⇒ LEFT, otherwise ACTIVE. */
export function statusFromEndDate(endDate: Date | null | undefined): EmployeeStatus {
  return endDate ? "LEFT" : "ACTIVE";
}

/**
 * Years of service as a friendly string, counted from the hire date to `now`
 * (or to the end date if the employee has left). Whole years + whole months.
 * Under a month → "less than a month"; no/future hire date → "—".
 */
export function formatYearsOfService(
  hire: Date | null,
  end?: Date | null,
  now: Date = new Date()
): string {
  if (!hire || isNaN(hire.getTime())) return "—";
  const to = end && !isNaN(end.getTime()) ? end : now;
  let months =
    (to.getFullYear() - hire.getFullYear()) * 12 + (to.getMonth() - hire.getMonth());
  // Drop the current month until the day-of-month is reached.
  if (to.getDate() < hire.getDate()) months -= 1;
  if (months < 0) return "—";
  if (months < 1) return "less than a month";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const yPart = years > 0 ? `${years} year${years === 1 ? "" : "s"}` : "";
  const mPart = rem > 0 ? `${rem} month${rem === 1 ? "" : "s"}` : "";
  return [yPart, mPart].filter(Boolean).join(" ");
}
