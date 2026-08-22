import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { courseAccessFor } from "@/lib/learning/access";
import { learningWritesBlocked } from "@/lib/learning/actor";
import { coursePlayerData } from "@/lib/learning/queries";
import { computeProgressPercent, firstIncompleteLessonId } from "@/lib/learning/progress";
import { ensureEnrollment } from "@/lib/learning/enrollment";
import { CoursePlayer, type PlayerSection } from "@/components/learning/CoursePlayer";
import { LessonContent, type Block } from "@/components/learning/LessonContent";
import { isTrackableSource, videoProvider } from "@/lib/learning/video";
import { lessonLength } from "@/lib/learning/renewal";

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
  //
  // NOTE the plain function, not the `openCourse` action: an action revalidates, and revalidating
  // during a render is unsupported by Next.js — that was the "server-side exception" on this page.
  await ensureEnrollment(user.id, courseId);

  const data = await coursePlayerData(courseId, user.id);
  if (!data) notFound();
  const { course, enrollment, progress } = data;

  const doneIds = new Set(progress.filter((p) => p.completedAt).map((p) => p.lessonId));
  const progressByLesson = new Map(progress.map((p) => [p.lessonId, p]));

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
  const blocked = await learningWritesBlocked();

  const sections: PlayerSection[] = course.sections.map((s) => ({
    id: s.id,
    title: s.title,
    lessons: s.lessons.map((l) => {
      const p = progressByLesson.get(l.id);
      const videoBlock = l.blocks.find((b) => b.type === "VIDEO" && b.externalUrl);
      return {
        id: l.id,
        title: l.title,
        isRequired: l.isRequired,
        estimatedMinutes: lessonLength(l.estimatedMinutes, l.videoDurationSec)?.minutes ?? null,
        minWatchPercent: l.minWatchPercent,
        completed: doneIds.has(l.id),
        watchedSec: p?.videoWatchedSec ?? 0,
        durationSec: p?.videoDurationSec ?? 0,
        positionSec: p?.lastPositionSec ?? 0,
        video: videoBlock?.externalUrl
          ? {
              url: videoBlock.externalUrl,
              provider: videoProvider(videoBlock.externalUrl),
              trackable: videoBlock.videoSource
                ? isTrackableSource(videoBlock.videoSource)
                : true,
            }
          : null,
        checkpoints: l.checkpoints,
      };
    }),
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
        <LessonContent blocks={current.blocks as Block[]} />
      </CoursePlayer>
    </div>
  );
}
