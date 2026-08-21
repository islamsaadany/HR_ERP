import { prisma } from "@/lib/prisma";
import { accessibleCoursesFor } from "@/lib/learning/access";
import { computeProgressPercent, firstIncompleteLessonId, type LessonRef } from "@/lib/learning/progress";
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

    return {
      courseId: h.courseId,
      title: h.title,
      summary: h.summary,
      percent: computeProgressPercent(list, done),
      nextLessonTitle: list.find((l) => l.id === nextId)?.title ?? null,
      lessonsDone: required.filter((l) => done.has(l.id)).length,
      lessonsTotal: required.length,
      startedAt: h.enrollment?.startedAt ?? null,
      completedAt: h.enrollment?.completedAt ?? null,
      firstCompletedAt: h.enrollment?.firstCompletedAt ?? null,
      reopenedAt: h.enrollment?.reopenedAt ?? null,
      grandfatheredOnly: h.access.grandfatheredOnly,
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
      select: { id: true, completedAt: true, lastLessonId: true },
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
