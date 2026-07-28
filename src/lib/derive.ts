// Derived values — computed, never stored (spec 001 · FR-015).

/** Whole years between a past date and now. */
export function yearsSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  const m = now.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) years--;
  return years < 0 ? 0 : years;
}

export const ageFromDob = (dob: Date | null | undefined) => yearsSince(dob);

/** Years of service, one decimal (e.g. 2.3). */
export function yearsOfService(startDate: Date | null | undefined): number | null {
  if (!startDate) return null;
  const now = new Date();
  const ms = now.getTime() - startDate.getTime();
  if (ms < 0) return 0;
  const years = ms / (365.25 * 24 * 60 * 60 * 1000);
  return Math.round(years * 10) / 10;
}

export const isMinor = (dob: Date | null | undefined) => {
  const a = ageFromDob(dob);
  return a !== null && a < 18;
};
