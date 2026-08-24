// The system pack (spec 040) — the facts the platform already holds about a
// person's quarter, so a review starts from the same picture rather than from
// memory.
//
// TWO RULES THIS FILE EXISTS TO KEEP
//
//   1. FACTS ONLY. No score, rating, ranking, traffic light, or comparison with
//      another employee. A review is the worst possible place for a number that
//      implies a judgement nobody agreed to.
//
//   2. COMPUTED THROUGH THE SAME DERIVATION THE REAL THING USES. The working-day
//      figure goes through `countWorkingDays` and the same holiday set Time-Off
//      uses, via `takenInWindow`. A second counter written to "look right" would
//      eventually disagree with what Time-Off shows for the same dates — the
//      lesson `audienceReachByRule` taught us in Learning (2026-08-22), where a
//      separately-written count printed 23 beside every rule.
//
// WHAT IS DELIBERATELY ABSENT
//   Data-request responsiveness: it measures chasing paperwork, not work, and in
//   front of a manager it turns a chore tracker into a character note.
//   Money of any kind: pool figures, claims, salary. Not on this surface, ever.

import { prisma } from "@/lib/prisma";
import { getHolidaySet } from "@/lib/holidays";
import { takenInWindow } from "@/lib/workdays";
import { quarterRange, type QuarterRef } from "@/lib/reviews/quarters";

export type SystemPack = {
  /** Approved leave, counted in working days, clipped to the quarter. */
  workingDaysTaken: number;
  /** Only while onboarding is still in progress — otherwise null, not "100%". */
  onboarding: { done: number; total: number } | null;
  /** Courses finished within the quarter, and how many are still open. */
  learning: { completedInQuarter: number; inProgress: number };
};

export async function buildSystemPack(
  employeeId: string,
  ref: QuarterRef
): Promise<SystemPack> {
  const { start, end } = quarterRange(ref);

  const [holidays, leave, onboarding, learning] = await Promise.all([
    getHolidaySet(),
    prisma.leaveRequest.findMany({
      where: {
        userId: employeeId,
        status: "APPROVED",
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { startDate: true, endDate: true },
    }),
    onboardingProgress(employeeId),
    learningActivity(employeeId, start, end),
  ]);

  return {
    workingDaysTaken: takenInWindow(leave, start, end, holidays),
    onboarding,
    learning,
  };
}

/**
 * Null once onboarding is finished — a finished tracker is not a fact about the
 * quarter, it is clutter. Null too when there is nothing assigned, rather than
 * showing "0 of 0", which reads as a failure.
 */
async function onboardingProgress(
  employeeId: string
): Promise<{ done: number; total: number } | null> {
  const [total, done] = await Promise.all([
    prisma.onboardingActivity.count(),
    prisma.activityCompletion.count({ where: { userId: employeeId } }),
  ]);
  if (total === 0 || done >= total) return null;
  return { done, total };
}

async function learningActivity(
  employeeId: string,
  start: Date,
  end: Date
): Promise<{ completedInQuarter: number; inProgress: number }> {
  const [completedInQuarter, inProgress] = await Promise.all([
    prisma.courseEnrollment.count({
      where: {
        userId: employeeId,
        completedAt: { gte: start, lte: endOfDay(end) },
      },
    }),
    prisma.courseEnrollment.count({
      where: {
        userId: employeeId,
        completedAt: null,
        accessWithdrawnAt: null,
        startedAt: { lte: endOfDay(end) },
      },
    }),
  ]);
  return { completedInQuarter, inProgress };
}

/** Quarter ends are UTC midnight; a completion at 14:00 that day still counts. */
function endOfDay(d: Date): Date {
  return new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** True when the pack has nothing to say — the sheet then omits it entirely. */
export function packIsEmpty(pack: SystemPack): boolean {
  return (
    pack.workingDaysTaken === 0 &&
    pack.onboarding === null &&
    pack.learning.completedInQuarter === 0 &&
    pack.learning.inProgress === 0
  );
}
