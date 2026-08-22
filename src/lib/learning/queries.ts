import { prisma } from "@/lib/prisma";
import { accessibleCoursesFor } from "@/lib/learning/access";
import { audienceWhere, type AudienceRule } from "@/lib/learning/audience";
import { computeProgressPercent, firstIncompleteLessonId, type LessonRef } from "@/lib/learning/progress";
import { renewalState, type RenewalState } from "@/lib/learning/renewal";
import type { CourseCardData } from "@/components/learning/CourseCard";

/**
 * Readers built on top of the access derivation. These assemble what a screen needs; they never
 * decide who may see what — that is `access.ts`, always.
 */

/** The live lesson list for a set of courses, in curriculum order, keyed by course. */
type TitledLesson = LessonRef & { title: string };

async function lessonsByCourse(courseIds: string[]) {
  if (courseIds.length === 0) return new Map<string, TitledLesson[]>();
  const sections = await prisma.courseSection.findMany({
    where: { courseId: { in: courseIds }, deletedAt: null },
    orderBy: { order: "asc" },
    select: {
      courseId: true,
      lessons: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        select: { id: true, title: true, isRequired: true },
      },
    },
  });
  const map = new Map<string, TitledLesson[]>();
  for (const section of sections) {
    const list = map.get(section.courseId) ?? [];
    list.push(...section.lessons);
    map.set(section.courseId, list);
  }
  return map;
}

/**
 * "My learning": every course this employee holds, with progress.
 *
 * Bounded queries regardless of how many courses exist — the lessons for every held course are
 * fetched in one go, and so are the learner's completed-lesson rows. The percentage is COMPUTED
 * here from those rows rather than read from a stored column, so it can never be stale.
 */
export async function myLearning(userId: string): Promise<CourseCardData[]> {
  const held = await accessibleCoursesFor(userId);
  if (held.length === 0) return [];

  const courseIds = held.map((h) => h.courseId);
  const [lessons, progress] = await Promise.all([
    lessonsByCourse(courseIds),
    prisma.lessonProgress.findMany({
      where: {
        completedAt: { not: null },
        enrollment: { userId, courseId: { in: courseIds } },
      },
      select: { lessonId: true, enrollment: { select: { courseId: true } } },
    }),
  ]);

  const doneByCourse = new Map<string, Set<string>>();
  for (const row of progress) {
    const set = doneByCourse.get(row.enrollment.courseId) ?? new Set<string>();
    set.add(row.lessonId);
    doneByCourse.set(row.enrollment.courseId, set);
  }

  return held.map((h) => {
    const list: TitledLesson[] = lessons.get(h.courseId) ?? [];
    const done = doneByCourse.get(h.courseId) ?? new Set<string>();
    const nextId = firstIncompleteLessonId(list, done);
    const required = list.filter((l) => l.isRequired);

    // Renewal is computed from the STORED completion date, then the card's completion is cleared
    // if it has lapsed. Both halves matter: computing renewal from an already-cleared date would
    // report PERMANENT for every lapsed course, and leaving the date in place would show "✓
    // Completed" next to "Due again" and file the course under finished.
    const renewal = renewalState(h.enrollment?.completedAt ?? null, h.renewAfterMonths);
    const lapsed = renewal.kind === "LAPSED";

    return {
      courseId: h.courseId,
      title: h.title,
      summary: h.summary,
      // A lapsed course reads as 0% — its ticks are cleared the moment the learner reopens it, and
      // showing 100% in the meantime would say "nothing to do" about the one thing they must redo.
      percent: lapsed ? 0 : computeProgressPercent(list, done),
      nextLessonTitle: list.find((l) => l.id === nextId)?.title ?? null,
      lessonsDone: lapsed ? 0 : required.filter((l) => done.has(l.id)).length,
      lessonsTotal: required.length,
      startedAt: h.enrollment?.startedAt ?? null,
      completedAt: lapsed ? null : (h.enrollment?.completedAt ?? null),
      firstCompletedAt: h.enrollment?.firstCompletedAt ?? null,
      reopenedAt: h.enrollment?.reopenedAt ?? null,
      grandfatheredOnly: h.access.grandfatheredOnly,
      renewal,
    };
  });
}

/** How many courses this employee still owes — for the nav badge and the dashboard tile. */
export async function outstandingCourseCount(userId: string): Promise<number> {
  const courses = await myLearning(userId);
  return courses.filter((c) => c.completedAt === null).length;
}

/** The full curriculum of one course, for the player. */
export async function coursePlayerData(courseId: string, userId: string) {
  const [course, enrollment] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        sections: {
          where: { deletedAt: null },
          orderBy: { order: "asc" },
          select: {
            id: true,
            title: true,
            lessons: {
              where: { deletedAt: null },
              orderBy: { order: "asc" },
              select: {
                id: true,
                title: true,
                isRequired: true,
                estimatedMinutes: true,
                videoDurationSec: true,
                minWatchPercent: true,
                blocks: {
                  orderBy: { order: "asc" },
                  select: {
                    id: true,
                    type: true,
                    text: true,
                    externalUrl: true,
                    videoSource: true,
                    fileName: true,
                    fileSizeBytes: true,
                  },
                },
                checkpoints: {
                  orderBy: { atSec: "asc" },
                  select: { id: true, atSec: true, prompt: true, options: true, correctIndex: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.courseEnrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
      // completionCount + ratingPromptDoneCount drive the finish panel: it shows while the
      // former is ahead of the latter, so skipping is durable and a renewal asks again by itself.
      select: {
        id: true,
        completedAt: true,
        lastLessonId: true,
        completionCount: true,
        ratingPromptDoneCount: true,
      },
    }),
  ]);
  if (!course) return null;

  const progress = enrollment
    ? await prisma.lessonProgress.findMany({
        where: { enrollmentId: enrollment.id },
        select: {
          lessonId: true,
          completedAt: true,
          lastPositionSec: true,
          videoWatchedSec: true,
          videoDurationSec: true,
        },
      })
    : [];

  return { course, enrollment, progress };
}

export type TeamMemberLearning = {
  userId: string;
  name: string;
  title: string | null;
  courses: Array<{
    courseId: string;
    title: string;
    percent: number;
    completedAt: Date | null;
    grandfatheredOnly: boolean;
  }>;
  outstanding: number;
};

/**
 * A manager's direct reports and where each of them has got to.
 *
 * Scoped to CURRENT direct reports (`reportsToId`), matching how Time-Off resolves approvals —
 * the org chart as it stands, never a stored snapshot, so a reporting-line change takes effect
 * immediately in both directions.
 *
 * Direct reports only, not the whole tree below them. A manager seeing their reports' reports
 * would be a bigger decision than "can I see my team", and nobody has asked for it.
 *
 * Deliberately narrower than the HR roster: a manager sees TITLES and PROGRESS, and no route
 * information. Whether someone holds a course because of their department, a group, or a personal
 * assignment is an HR matter, not their manager's.
 */
export async function teamLearning(managerId: string): Promise<TeamMemberLearning[]> {
  const reports = await prisma.user.findMany({
    where: { reportsToId: managerId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, title: true },
  });
  if (reports.length === 0) return [];

  // One myLearning pass per report. At this scale (a handful of reports) that is honest and
  // simple; it also means a manager sees EXACTLY what their report sees, by construction, rather
  // than a parallel query that could drift from it.
  const rows = await Promise.all(
    reports.map(async (person) => {
      const courses = await myLearning(person.id);
      return {
        userId: person.id,
        name: person.name,
        title: person.title,
        courses: courses.map((c) => ({
          courseId: c.courseId,
          title: c.title,
          percent: c.percent,
          completedAt: c.completedAt,
          grandfatheredOnly: c.grandfatheredOnly,
        })),
        outstanding: courses.filter((c) => c.completedAt === null).length,
      };
    })
  );
  return rows;
}

/**
 * How many active employees this course's audience rules reach right now.
 *
 * A PLAIN query, deliberately not exported from a `"use server"` file. It used to live in
 * `access-actions.ts`, which made it a publicly callable endpoint — and it carried no
 * `requireAdmin()`, so anyone who knew the shape of the request could have enumerated audience
 * sizes. Nothing here is dangerous on its own, but "every export in this file is a public POST
 * endpoint" is exactly the property that is easy to forget, so the query moved instead of gaining
 * a guard. Callers do their own authorisation, as they already do for every other query here.
 */
export async function audienceReach(courseId: string): Promise<number> {
  const rules = await prisma.courseAudience.findMany({
    where: { courseId },
    select: { kind: true, value: true },
  });
  const where = audienceWhere(rules as AudienceRule[]);
  return where ? prisma.user.count({ where }) : 0;
}
