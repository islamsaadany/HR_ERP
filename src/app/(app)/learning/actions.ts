"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { courseAccessFor } from "@/lib/learning/access";
import { ImpersonationWriteRefused, requireLearner } from "@/lib/learning/actor";
import { computeProgressPercent, firstIncompleteLessonId, type LessonRef } from "@/lib/learning/progress";
import { ensureEnrollment } from "@/lib/learning/enrollment";

/**
 * Learning writes (spec 038 US1/US3).
 *
 * TWO RULES HOLD THIS FILE TOGETHER, and both are structural rather than remembered:
 *
 *  1. Every action starts with `requireLearner()`, which refuses while an admin is impersonating
 *     (FR-026). NOTHING here takes a user id as a parameter — the learner is only ever what that
 *     resolver returns — so a new action cannot be written that skips the guard, because there is
 *     no other way to find out who is learning.
 *
 *  2. Every action then asks `courseAccessFor()`. That is THE access derivation; this file never
 *     re-decides any part of it.
 */

export type LearnResult = { ok: true } | { ok: false; error: string };

/** Turn the impersonation refusal into the house result shape rather than letting it escape. */
async function guard<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ImpersonationWriteRefused) return { ok: false, error: e.message };
    throw e;
  }
}

/** The lesson rows a course's progress is measured over — soft-deleted lessons excluded. */
async function liveLessons(courseId: string): Promise<Array<LessonRef & { sectionOrder: number; order: number }>> {
  const sections = await prisma.courseSection.findMany({
    where: { courseId, deletedAt: null },
    orderBy: { order: "asc" },
    select: {
      order: true,
      lessons: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        select: { id: true, isRequired: true, order: true },
      },
    },
  });
  return sections.flatMap((s) =>
    s.lessons.map((l) => ({
      id: l.id,
      isRequired: l.isRequired,
      sectionOrder: s.order,
      order: l.order,
    }))
  );
}

/**
 * Open a course — the moment "assigned" becomes "started".
 *
 * Creating the enrollment HERE rather than at assignment is what makes FR-045 expressible: someone
 * who never opened a course has no enrollment, so when their last route is removed there is
 * nothing to grandfather and they lose it immediately. It is also what makes FR-042 free.
 */
export async function openCourse(courseId: string): Promise<LearnResult> {
  return guard(async () => {
    const learner = await requireLearner();
    const access = await courseAccessFor(learner.id, courseId);
    if (!access.allowed) return { ok: false as const, error: "You don't have access to this course." };

    await ensureEnrollment(learner.id, courseId);

    // Only an ACTION may revalidate. The page does the same work by calling `ensureEnrollment`
    // directly — calling this function from a render would drag these two lines into it, which
    // Next.js refuses.
    revalidatePath("/learning");
    revalidatePath(`/learning/${courseId}`);
    return { ok: true as const };
  });
}

/**
 * Recompute a course's completion from its lesson rows, inside the caller's transaction.
 *
 * `completedAt` is a stored FACT (the roster shows the date, and a reopen supersedes it), but the
 * percentage it derives from is not stored anywhere — it is computed from LessonProgress every
 * time, so the two can never disagree.
 */
async function syncCompletion(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  enrollmentId: string,
  courseId: string
) {
  const lessons = await liveLessons(courseId);
  const done = await tx.lessonProgress.findMany({
    where: { enrollmentId, completedAt: { not: null } },
    select: { lessonId: true },
  });
  const percent = computeProgressPercent(lessons, done.map((d) => d.lessonId));

  const enrollment = await tx.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    select: { completedAt: true, firstCompletedAt: true },
  });
  if (!enrollment) return;

  if (percent >= 100 && enrollment.completedAt === null) {
    await tx.courseEnrollment.update({
      where: { id: enrollmentId },
      data: {
        completedAt: new Date(),
        firstCompletedAt: enrollment.firstCompletedAt ?? new Date(),
        completionCount: { increment: 1 },
      },
    });
  } else if (percent < 100 && enrollment.completedAt !== null) {
    // Un-completing a lesson, or a required lesson being added, puts the course back in progress.
    await tx.courseEnrollment.update({
      where: { id: enrollmentId },
      data: { completedAt: null },
    });
  }
}

async function loadForWrite(learnerId: string, lessonId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null },
    select: {
      id: true,
      minWatchPercent: true,
      section: { select: { courseId: true, deletedAt: true } },
      blocks: { select: { type: true, videoSource: true } },
    },
  });
  if (!lesson || lesson.section.deletedAt) return null;

  const courseId = lesson.section.courseId;
  const access = await courseAccessFor(learnerId, courseId);
  if (!access.allowed) return null;

  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { courseId_userId: { courseId, userId: learnerId } },
    select: { id: true },
  });
  return { lesson, courseId, enrollment };
}

/**
 * Mark a lesson complete.
 *
 * The watch gate is checked against the STORED `videoWatchedSec`, never a figure the client sends
 * (SC-005). The disabled button on the player is a courtesy; this is what actually holds when
 * somebody re-enables it in devtools.
 */
export async function markLessonComplete(lessonId: string): Promise<LearnResult> {
  return guard(async () => {
    const learner = await requireLearner();
    const loaded = await loadForWrite(learner.id, lessonId);
    if (!loaded?.enrollment) {
      return { ok: false as const, error: "You don't have access to this lesson." };
    }
    const { lesson, courseId, enrollment } = loaded;

    if (lesson.minWatchPercent > 0) {
      const progress = await prisma.lessonProgress.findUnique({
        where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
        select: { videoWatchedSec: true, videoDurationSec: true },
      });
      const watched = progress?.videoWatchedSec ?? 0;
      const duration = progress?.videoDurationSec ?? 0;
      // The gate, decided HERE from stored figures — never from anything the page sends with the
      // request. Re-enabling the disabled button in devtools changes nothing.
      //
      // A duration of 0 means the player has never reported one (nothing watched, or a source we
      // cannot measure). Treated as NOT satisfied: failing closed is the only safe reading, since
      // the alternative lets an unplayed video count as watched.
      //
      // The honest limit, stated so nobody later mistakes this for more than it is: the duration
      // ORIGINATES from the player, so a learner determined to under-report it can pass. Closing
      // that would mean asking Vimeo/YouTube for the true length — a network call and a new
      // dependency, neither of which this release takes. This stops people clicking past training;
      // it is not an adversarial control.
      // A 2-second allowance on top of the client's end-of-video crediting. Between a player
      // reporting a duration a fraction longer than it plays, and the last tick landing just
      // short, an exact comparison can refuse someone who genuinely watched the whole thing —
      // and being told "you've watched 99%" after sitting through all of it is the kind of thing
      // that makes people stop trusting the platform.
      const required = Math.max(0, Math.ceil((duration * lesson.minWatchPercent) / 100) - 2);
      if (duration <= 0 || watched < required) {
        const soFar = duration > 0 ? Math.floor((watched / duration) * 100) : 0;
        return {
          ok: false as const,
          error: `You've watched ${soFar}% of this video. Watch ${lesson.minWatchPercent}% to complete the lesson.`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
        create: { enrollmentId: enrollment.id, lessonId, completedAt: new Date() },
        update: { completedAt: new Date() },
      });
      await tx.courseEnrollment.update({
        where: { id: enrollment.id },
        data: { lastLessonId: lessonId },
      });
      await syncCompletion(tx, enrollment.id, courseId);
    });

    revalidatePath("/learning");
    revalidatePath(`/learning/${courseId}`);
    return { ok: true as const };
  });
}

export async function markLessonIncomplete(lessonId: string): Promise<LearnResult> {
  return guard(async () => {
    const learner = await requireLearner();
    const loaded = await loadForWrite(learner.id, lessonId);
    if (!loaded?.enrollment) {
      return { ok: false as const, error: "You don't have access to this lesson." };
    }
    const { courseId, enrollment } = loaded;

    await prisma.$transaction(async (tx) => {
      await tx.lessonProgress.updateMany({
        where: { enrollmentId: enrollment.id, lessonId },
        data: { completedAt: null },
      });
      await syncCompletion(tx, enrollment.id, courseId);
    });

    revalidatePath("/learning");
    revalidatePath(`/learning/${courseId}`);
    return { ok: true as const };
  });
}

/**
 * Persist playback state (FR-028, US3).
 *
 * `videoWatchedSec` is advanced with a SQL `GREATEST`, not a read-then-`Math.max` in application
 * code. The difference matters: with the lesson open in two tabs, read-then-max loses whichever
 * update lands second, so a learner can watch the whole video and be credited with less. One
 * statement makes that race impossible.
 */
export async function saveVideoProgress(
  lessonId: string,
  positionSec: number,
  watchedSec: number,
  durationSec = 0
): Promise<LearnResult> {
  return guard(async () => {
    const learner = await requireLearner();
    const loaded = await loadForWrite(learner.id, lessonId);
    if (!loaded?.enrollment) {
      return { ok: false as const, error: "You don't have access to this lesson." };
    }
    const { enrollment } = loaded;

    const position = Math.max(0, Math.round(positionSec));
    const watched = Math.max(0, Math.round(watchedSec));
    const duration = Math.max(0, Math.round(durationSec));

    // Duration is maxed too, not overwritten: a player that reports 0 on an early tick (before
    // metadata loads) must not wipe a real figure and quietly re-open the gate.
    await prisma.$executeRaw`
      INSERT INTO "LessonProgress" ("id", "enrollmentId", "lessonId", "lastPositionSec", "videoWatchedSec", "videoDurationSec", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${enrollment.id}, ${lessonId}, ${position}, ${watched}, NULLIF(${duration}, 0), NOW(), NOW())
      ON CONFLICT ("enrollmentId", "lessonId") DO UPDATE
        SET "lastPositionSec" = ${position},
            "videoWatchedSec" = GREATEST("LessonProgress"."videoWatchedSec", ${watched}),
            "videoDurationSec" = GREATEST(COALESCE("LessonProgress"."videoDurationSec", 0), ${duration}),
            "updatedAt" = NOW()
    `;
    return { ok: true as const };
  });
}

/** Where to drop the learner when they open a course (FR-024). */
export async function resumeLessonId(
  courseId: string,
  enrollmentId: string
): Promise<string | null> {
  const [lessons, done] = await Promise.all([
    liveLessons(courseId),
    prisma.lessonProgress.findMany({
      where: { enrollmentId, completedAt: { not: null } },
      select: { lessonId: true },
    }),
  ]);
  return firstIncompleteLessonId(lessons, done.map((d) => d.lessonId)) ?? lessons[0]?.id ?? null;
}
