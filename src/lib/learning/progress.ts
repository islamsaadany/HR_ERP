/**
 * Pure progress computation (spec 038 FR-022, FR-023, SC-004).
 *
 * Progress is the fraction of REQUIRED lessons a learner has completed, keyed by
 * stable lesson id — never by position. Soft-deleted lessons are excluded by the
 * caller (they are not passed in), so reordering or editing a curriculum can
 * never corrupt a learner's percentage.
 */

export type LessonRef = { id: string; isRequired: boolean };

/** Percentage (0–100, integer) of required lessons completed. */
export function computeProgressPercent(
  lessons: LessonRef[],
  completedLessonIds: Iterable<string>,
): number {
  const required = lessons.filter((l) => l.isRequired);
  if (required.length === 0) return 100; // nothing required → trivially complete
  const completed = new Set(completedLessonIds);
  const done = required.filter((l) => completed.has(l.id)).length;
  return Math.round((done / required.length) * 100);
}

/**
 * The id of the first incomplete lesson in curriculum order, or null when all
 * lessons are complete. Used for "resume where you left off" (spec 038 FR-024). Considers
 * ALL lessons (required or not) so the learner is walked through everything, but
 * skips already-completed ones.
 */
export function firstIncompleteLessonId(
  orderedLessons: LessonRef[],
  completedLessonIds: Iterable<string>,
): string | null {
  const completed = new Set(completedLessonIds);
  for (const lesson of orderedLessons) {
    if (!completed.has(lesson.id)) return lesson.id;
  }
  return null;
}

/** Whether the course is complete for a learner given a completion threshold. */
export function isCourseComplete(
  lessons: LessonRef[],
  completedLessonIds: Iterable<string>,
  completionThreshold: number,
): boolean {
  return computeProgressPercent(lessons, completedLessonIds) >= completionThreshold;
}
