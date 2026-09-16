/**
 * Learning deadlines (spec 043) — the ONE place a deadline becomes a date.
 *
 * A step carries EITHER a period in days, counted from when that person joined the track, OR a
 * fixed calendar date. Both are real cases: an onboarding path assigned all year round can only
 * mean "within N days of starting", and a compliance deadline can only mean a day. Two kinds is the
 * one place this feature buys real complexity, and this module is what contains it — past
 * `resolveDeadline`, nothing knows there were ever two.
 *
 * That containment is the whole point (FR-019a). A second resolution written for a screen is how a
 * person ends up told one date and chased on another, and nobody would notice until somebody
 * complained about an email that disagreed with their own page.
 *
 * Pure: no Prisma, no I/O, no `now` read from inside. Every caller passes what it knows.
 */

export type StepDeadline = {
  dueDays: number | null;
  dueOn: Date | null;
};

/**
 * How many messages one overdue course may produce, and when.
 *
 * Day 0 is the day it goes overdue, then weekly for four weeks, then silence — at most five.
 * A CONST, never a column and never a setting: the constitution (v2.0.0) states the bound as a
 * requirement precisely because a bound living in a settings box is a decision nobody made, and the
 * first person frustrated that work is unfinished widens it to daily-forever. The verify script
 * asserts `LearningSettings` has no cadence column, so this cannot quietly become configurable.
 */
export const REMINDER_SCHEDULE = [0, 7, 14, 21, 28] as const;

/** The last day anybody is chased about one course. */
export const REMINDER_LAST_DAY = REMINDER_SCHEDULE[REMINDER_SCHEDULE.length - 1];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the day this instant falls in — deadlines are days, not moments. */
function startOfDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * When is this step due FOR THIS PERSON?
 *
 * `joinedAt` is the day they joined the track — passed IN rather than read here, because for a
 * GROUP assignment it is the later of the track being given to the group and that person joining
 * the group, and that is a question about assignments, not about deadlines. Keeping it a parameter
 * is what stops this module growing a second opinion about it.
 *
 * Returns null when the step has no deadline. NULL IS NOT OVERDUE — a step without a deadline has
 * none, and reading its absence as "due now" would chase the whole company about everything.
 */
export function resolveDeadline(step: StepDeadline, joinedAt: Date): Date | null {
  if (step.dueOn !== null) return startOfDay(step.dueOn);
  if (step.dueDays !== null) return new Date(startOfDay(joinedAt).getTime() + step.dueDays * DAY_MS);
  return null;
}

/**
 * When a track became THIS person's — the day a period counts from.
 *
 * For an assignment naming the person it is simply when it was made. For a group it is the LATER of
 * the track reaching the group and the person joining the group: both are "when this became theirs",
 * and taking the earlier would make somebody who joined the group last week instantly overdue on a
 * path assigned to it last year.
 *
 * A one-line rule with its own function because THREE readers need it — the daily sweep, the
 * employee's own page and the track roster — and a second copy is how a roster comes to disagree
 * with the email about whether somebody is late.
 */
export function joinedTrackAt(assignedAt: Date, joinedGroupAt: Date | null): Date {
  if (joinedGroupAt === null) return assignedAt;
  return joinedGroupAt > assignedAt ? joinedGroupAt : assignedAt;
}

/**
 * The earliest of several deadlines — for a course that sits in more than one track.
 *
 * Every candidate must ALREADY be resolved: comparing a period against a fixed date is meaningless
 * until both are real dates for this person. A deadline must never be pushed later by adding more
 * work, so the earliest wins.
 */
export function earliestDeadline(candidates: (Date | null)[]): Date | null {
  const real = candidates.filter((d): d is Date => d !== null);
  if (real.length === 0) return null;
  return real.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

/**
 * Overdue is DERIVED, never stored.
 *
 * Same choice as course-renewal lapsing: nothing writes a flag, so nothing can be stale, no job can
 * miss a row, and completing a course stops it being overdue with no write at all.
 */
export function isOverdue(due: Date | null, completedAt: Date | null, now: Date): boolean {
  if (due === null) return false;
  if (completedAt !== null) return false;
  return startOfDay(now).getTime() > due.getTime();
}

/** Whole days since the deadline passed. 0 on the day itself, negative before it. */
export function daysOverdue(due: Date, now: Date): number {
  return Math.round((startOfDay(now).getTime() - due.getTime()) / DAY_MS);
}

/**
 * Should a reminder go out today for a course this many days overdue?
 *
 * The schedule is exact rather than "at least": a job that misses a day does NOT catch up the next
 * one. Catching up would mean a week's outage producing five emails in one morning, which is the
 * behaviour that gets a sender filtered — and the person is looking at an overdue row on their own
 * page the whole time regardless.
 */
export function isReminderDay(days: number): boolean {
  return (REMINDER_SCHEDULE as readonly number[]).includes(days);
}
