/**
 * Optional per-course renewal — pure, no database.
 *
 * A course may carry a renewal period in months. NULL means completion is permanent, which is the
 * default and what every course did before this existed.
 *
 * LAPSING IS DERIVED, never stored and never swept by a scheduled job. A completion that is older
 * than the period simply *reads* as lapsed, everywhere, from the same two facts. That is the whole
 * design: there is no flag to set, so nothing can be missed; no job to run, so nothing can run
 * twice or half-finish; and a course whose period is changed re-evaluates everyone instantly
 * rather than waiting for the next sweep.
 */

/** Add whole months, clamping the day so 31 Jan + 1 month is 28/29 Feb rather than 3 March. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetDay = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months, 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(targetDay, lastDay));
  return d;
}

/** When this completion falls due again, or null when the course never expires. */
export function dueAgainAt(
  completedAt: Date | null,
  renewAfterMonths: number | null
): Date | null {
  if (!completedAt || !renewAfterMonths || renewAfterMonths <= 0) return null;
  return addMonths(completedAt, renewAfterMonths);
}

/** Has this completion lapsed? False whenever the course doesn't renew, or isn't complete. */
export function hasLapsed(
  completedAt: Date | null,
  renewAfterMonths: number | null,
  now: Date = new Date()
): boolean {
  const due = dueAgainAt(completedAt, renewAfterMonths);
  return due !== null && now.getTime() >= due.getTime();
}

/**
 * What a learner is told about a renewing course. Deliberately three states, not two: "due in a
 * while" and "due soon" read very differently to someone deciding what to do this week.
 */
export type RenewalState =
  | { kind: "PERMANENT" }
  | { kind: "DUE"; dueAt: Date; daysLeft: number }
  | { kind: "DUE_SOON"; dueAt: Date; daysLeft: number }
  | { kind: "LAPSED"; dueAt: Date };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Inside a month, "due soon" — enough notice to plan around, not so much it becomes wallpaper. */
export const DUE_SOON_DAYS = 30;

export function renewalState(
  completedAt: Date | null,
  renewAfterMonths: number | null,
  now: Date = new Date()
): RenewalState {
  const due = dueAgainAt(completedAt, renewAfterMonths);
  if (!due) return { kind: "PERMANENT" };
  if (now.getTime() >= due.getTime()) return { kind: "LAPSED", dueAt: due };
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
  return daysLeft <= DUE_SOON_DAYS
    ? { kind: "DUE_SOON", dueAt: due, daysLeft }
    : { kind: "DUE", dueAt: due, daysLeft };
}

/** Month options an operator actually thinks in. */
export const RENEWAL_CHOICES = [
  { months: null, label: "Never — completing it once is enough" },
  { months: 6, label: "Every 6 months" },
  { months: 12, label: "Every year" },
  { months: 24, label: "Every 2 years" },
  { months: 36, label: "Every 3 years" },
] as const;

/**
 * A lesson's length for display: the author's estimate if they set one, otherwise the real length
 * the platform learned from the first playback. Null when neither is known — a lesson with no
 * video that nobody has estimated genuinely has no length, and inventing one would be worse.
 */
export function lessonLength(
  estimatedMinutes: number | null,
  videoDurationSec: number | null
): { minutes: number; learned: boolean } | null {
  if (estimatedMinutes && estimatedMinutes > 0) {
    return { minutes: estimatedMinutes, learned: false };
  }
  if (videoDurationSec && videoDurationSec > 0) {
    // Round up: a 90-second video is "2 min" to a learner deciding whether to start it now.
    return { minutes: Math.max(1, Math.ceil(videoDurationSec / 60)), learned: true };
  }
  return null;
}
