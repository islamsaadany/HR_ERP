import Link from "next/link";
import { formatDate } from "@/lib/labels";
import { ProgressBar } from "@/components/learning/ProgressBar";
import { BTN_NAVY, CHIP } from "@/components/learning/ui";

export type CourseCardData = {
  courseId: string;
  title: string;
  summary: string | null;
  percent: number;
  nextLessonTitle: string | null;
  lessonsDone: number;
  lessonsTotal: number;
  startedAt: Date | null;
  completedAt: Date | null;
  firstCompletedAt: Date | null;
  reopenedAt: Date | null;
  /** True when the ONLY thing granting access is being mid-course (FR-042). */
  grandfatheredOnly: boolean;
};

/**
 * One course on "My learning".
 *
 * Two states carry real meaning and are worth not flattening:
 *
 *  - GRANDFATHERED (gold border): the course is no longer assigned to them, but they were part-way
 *    through, so they keep it until they finish. Saying that plainly beats leaving someone to
 *    wonder why a course they were told to do is still sitting there.
 *  - REOPENED: they DID finish, and HR later added required content. The original completion date
 *    stays on the card, because the work was really done and hiding that reads as it being erased.
 */
export function CourseCard({ course }: { course: CourseCardData }) {
  const complete = course.completedAt !== null;
  const notStarted = course.startedAt === null;
  const reopened = course.reopenedAt !== null && !complete;

  return (
    <div
      className={`mb-3 flex items-center gap-4 rounded-xl border bg-surface p-4 ${
        course.grandfatheredOnly ? "border-gold-300" : "border-line"
      }`}
    >
      <div
        aria-hidden
        className="h-[50px] w-[74px] flex-none rounded-lg bg-gradient-to-br from-navy-700 to-navy-900"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-bold text-navy-800">{course.title}</span>
          {complete ? (
            <span className={CHIP.done}>✓ Completed {formatDate(course.completedAt)}</span>
          ) : null}
          {course.grandfatheredOnly && !complete ? (
            <span className={CHIP.attention}>Finish by</span>
          ) : null}
        </div>

        <p className="mt-0.5 text-xs text-muted">
          {reopened ? (
            <>
              Completed {formatDate(course.firstCompletedAt)} — reopened{" "}
              {formatDate(course.reopenedAt)} because a lesson was added
            </>
          ) : course.grandfatheredOnly && !complete ? (
            <>
              {course.lessonsDone} of {course.lessonsTotal} lessons · this course is no longer
              assigned to you — you can still finish it
            </>
          ) : notStarted ? (
            <>Not started · {course.lessonsTotal} lessons</>
          ) : complete ? (
            <>All {course.lessonsTotal} lessons done</>
          ) : (
            <>
              {course.lessonsDone} of {course.lessonsTotal} lessons
              {course.nextLessonTitle ? <> · next up: {course.nextLessonTitle}</> : null}
            </>
          )}
        </p>

        <div className="mt-2">
          <ProgressBar percent={course.percent} />
        </div>
      </div>

      <Link href={`/learning/${course.courseId}`} className={BTN_NAVY}>
        {complete ? "Review" : reopened ? "Finish it" : notStarted ? "Start" : "Continue"}
      </Link>
    </div>
  );
}
