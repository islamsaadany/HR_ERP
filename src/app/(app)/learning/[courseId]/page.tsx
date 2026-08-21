import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { courseAccessFor } from "@/lib/learning/access";
import { learningWritesBlocked } from "@/lib/learning/actor";
import { coursePlayerData } from "@/lib/learning/queries";
import { computeProgressPercent, firstIncompleteLessonId } from "@/lib/learning/progress";
import { openCourse } from "@/app/(app)/learning/actions";
import { CoursePlayer, type PlayerSection } from "@/components/learning/CoursePlayer";
import { LessonContent, type Block } from "@/components/learning/LessonContent";
import { VideoFrame } from "@/components/learning/VideoFrame";

export const dynamic = "force-dynamic";

/**
 * The course player.
 *
 * Access is decided HERE, server-side, by the one derivation — so a draft course, or one this
 * employee has no route to, is refused on a direct link rather than merely hidden from the list
 * (FR-005, FR-016).
 */
export default async function CoursePlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  await requireModuleEnabled("learning");
  const user = await requireUser();
  const { courseId } = await params;
  const { lesson: requestedLessonId } = await searchParams;

  const access = await courseAccessFor(user.id, courseId);
  if (!access.allowed) notFound();

  // Opening the course is what starts it. Doing this before the read means the first paint already
  // shows the enrollment rather than an empty state that fills in on the next refresh.
  await openCourse(courseId);

  const data = await coursePlayerData(courseId, user.id);
  if (!data) notFound();
  const { course, enrollment, progress } = data;

  const doneIds = new Set(progress.filter((p) => p.completedAt).map((p) => p.lessonId));
  const watchedByLesson = new Map(progress.map((p) => [p.lessonId, p.videoWatchedSec]));

  const flat = course.sections.flatMap((s) => s.lessons);
  if (flat.length === 0) {
    return (
      <div>
        <Link href="/learning" className="mb-3 inline-block text-sm text-muted hover:text-ink">
          ← My learning
        </Link>
        <h1 className="font-serif text-3xl text-ink">{course.title}</h1>
        <p className="mt-2 text-muted">This course has no lessons yet.</p>
      </div>
    );
  }

  const resumeId = firstIncompleteLessonId(flat, doneIds) ?? flat[0].id;
  const currentId = flat.some((l) => l.id === requestedLessonId) ? requestedLessonId! : resumeId;
  if (!requestedLessonId) redirect(`/learning/${courseId}?lesson=${currentId}`);

  const current = flat.find((l) => l.id === currentId)!;
  const video = current.blocks.find((b) => b.type === "VIDEO" && b.externalUrl);
  const blocked = await learningWritesBlocked();

  const sections: PlayerSection[] = course.sections.map((s) => ({
    id: s.id,
    title: s.title,
    lessons: s.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      isRequired: l.isRequired,
      estimatedMinutes: l.estimatedMinutes,
      minWatchPercent: l.minWatchPercent,
      completed: doneIds.has(l.id),
      watchedSec: watchedByLesson.get(l.id) ?? 0,
    })),
  }));

  return (
    <div>
      <Link href="/learning" className="mb-3 inline-block text-sm text-muted hover:text-ink">
        ← My learning
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="font-serif text-3xl text-ink">{course.title}</h1>
        {enrollment?.completedAt ? (
          <span className="inline-block rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[10px] font-bold text-green-700">
            ✓ Completed
          </span>
        ) : null}
      </div>

      <CoursePlayer
        courseId={courseId}
        sections={sections}
        currentLessonId={currentId}
        percent={computeProgressPercent(flat, doneIds)}
        writesBlocked={blocked}
      >
        {video?.externalUrl ? (
          <VideoFrame url={video.externalUrl} source={video.videoSource} title={current.title} />
        ) : null}
        <LessonContent blocks={current.blocks as Block[]} />
      </CoursePlayer>
    </div>
  );
}
