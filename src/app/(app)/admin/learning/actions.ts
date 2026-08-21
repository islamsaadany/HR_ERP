"use server";

import { revalidatePath } from "next/cache";
import type { LessonBlockType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { courseRoster } from "@/lib/learning/access";
import { isTrackableSource, normalizeVideoUrl, untrackableReason, videoSourceFor } from "@/lib/learning/video";

/**
 * Course authoring (spec 038 US1). HR Admin + Super User only — there is no instructor role, so
 * there is no ownership dimension: an admin may edit any course.
 *
 * A note on rich text: TEXT blocks store **markdown**, rendered with `react-markdown` the way
 * Knowledge articles already are. FFLMS sanitised HTML server-side and rendered it with
 * `dangerouslySetInnerHTML`; markdown removes that whole class of problem instead of guarding it,
 * and needs no new dependency.
 */

export type CourseResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Returned when a curriculum edit would supersede existing completions and the author has not yet
 * said what should happen to them (FR-039). The dialog is an affordance; THIS is the guarantee.
 */
export type NeedsCompletionDecision = {
  ok: false;
  needsDecision: true;
  affected: number;
  error: string;
};

export type CompletionChoice = "REOPEN" | "KEEP";

function revalidate(courseId?: string) {
  revalidatePath("/admin/learning");
  if (courseId) revalidatePath(`/admin/learning/${courseId}`);
  revalidatePath("/learning");
}

const clean = (v: FormDataEntryValue | null | undefined) =>
  typeof v === "string" ? v.trim() : "";

// ─── Course ─────────────────────────────────────────────────────────────

export async function createCourse(formData: FormData): Promise<CourseResult> {
  const admin = await requireAdmin();
  const title = clean(formData.get("title"));
  if (!title) return { ok: false, error: "Give the course a title." };

  const max = await prisma.course.aggregate({ _max: { order: true } });
  const course = await prisma.course.create({
    data: {
      title,
      summary: clean(formData.get("summary")) || null,
      order: (max._max.order ?? 0) + 1,
      createdById: admin.id,
      updatedById: admin.id,
    },
    select: { id: true },
  });
  revalidate();
  return { ok: true, id: course.id };
}

export async function updateCourse(courseId: string, formData: FormData): Promise<CourseResult> {
  const admin = await requireAdmin();
  const title = clean(formData.get("title"));
  if (!title) return { ok: false, error: "Give the course a title." };

  await prisma.course.update({
    where: { id: courseId },
    data: {
      title,
      summary: clean(formData.get("summary")) || null,
      category: clean(formData.get("category")) || null,
      updatedById: admin.id,
    },
  });
  revalidate(courseId);
  return { ok: true };
}

/**
 * The completeness gate (FR-006). Names the FIRST specific gap rather than refusing generically —
 * "it isn't ready" sends the operator hunting; "Section 2 has no lessons" does not.
 */
async function firstPublishGap(courseId: string): Promise<string | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      sections: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        select: {
          title: true,
          lessons: {
            where: { deletedAt: null },
            orderBy: { order: "asc" },
            select: {
              title: true,
              minWatchPercent: true,
              blocks: { select: { type: true, videoSource: true } },
              checkpoints: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!course) return "That course no longer exists.";
  if (course.sections.length === 0) return "Add at least one section before publishing.";

  for (const section of course.sections) {
    if (section.lessons.length === 0) {
      return `“${section.title}” has no lessons yet.`;
    }
    for (const lesson of section.lessons) {
      if (lesson.blocks.length === 0) {
        return `“${lesson.title}” has no content yet.`;
      }
      // Re-check the untrackable-video invariant here too: a lesson could have been given a gate
      // while its video was a Vimeo link and then had the link swapped for a Drive one.
      const video = lesson.blocks.find((b) => b.type === "VIDEO" && b.videoSource);
      if (video?.videoSource && !isTrackableSource(video.videoSource)) {
        if (lesson.minWatchPercent > 0 || lesson.checkpoints.length > 0) {
          return `“${lesson.title}” has a watch requirement or a checkpoint, but its video is on Google Drive, which can't report playback. Remove the requirement or move the video.`;
        }
      }
    }
  }
  return null;
}

export async function publishCourse(courseId: string): Promise<CourseResult> {
  const admin = await requireAdmin();
  const gap = await firstPublishGap(courseId);
  if (gap) return { ok: false, error: gap };

  await prisma.course.update({
    where: { id: courseId },
    data: { status: "PUBLISHED", publishedAt: new Date(), updatedById: admin.id },
  });
  revalidate(courseId);
  return { ok: true };
}

/** Back to draft: invisible to employees immediately, nobody's progress touched (FR-007). */
export async function unpublishCourse(courseId: string): Promise<CourseResult> {
  const admin = await requireAdmin();
  await prisma.course.update({
    where: { id: courseId },
    data: { status: "DRAFT", updatedById: admin.id },
  });
  revalidate(courseId);
  return { ok: true };
}

export async function deleteCourse(courseId: string): Promise<CourseResult> {
  await requireAdmin();
  const enrolled = await prisma.courseEnrollment.count({ where: { courseId } });
  if (enrolled > 0) {
    return {
      ok: false,
      error: `${enrolled} ${enrolled === 1 ? "person has" : "people have"} started this course, so deleting it would destroy their record. Unpublish it instead.`,
    };
  }
  await prisma.course.delete({ where: { id: courseId } });
  revalidate();
  return { ok: true };
}

// ─── Sections ───────────────────────────────────────────────────────────

export async function upsertSection(
  courseId: string,
  sectionId: string | null,
  title: string
): Promise<CourseResult> {
  await requireAdmin();
  const clean_ = title.trim();
  if (!clean_) return { ok: false, error: "Give the section a title." };

  if (sectionId) {
    await prisma.courseSection.update({ where: { id: sectionId }, data: { title: clean_ } });
  } else {
    const max = await prisma.courseSection.aggregate({
      where: { courseId },
      _max: { order: true },
    });
    await prisma.courseSection.create({
      data: { courseId, title: clean_, order: (max._max.order ?? 0) + 1 },
    });
  }
  revalidate(courseId);
  return { ok: true };
}

/** Soft delete — a hard delete would cascade away lesson progress people earned. */
export async function deleteSection(courseId: string, sectionId: string): Promise<CourseResult> {
  await requireAdmin();
  await prisma.$transaction([
    prisma.lesson.updateMany({
      where: { sectionId, deletedAt: null },
      data: { deletedAt: new Date() },
    }),
    prisma.courseSection.update({ where: { id: sectionId }, data: { deletedAt: new Date() } }),
  ]);
  revalidate(courseId);
  return { ok: true };
}

// ─── Lessons ────────────────────────────────────────────────────────────

/**
 * How many people the course still reaches AND who have already completed it — the population a
 * reopen would touch (FR-041). Read-only; used by the dialog. It is NEVER the authority: the write
 * below re-takes the count inside its own transaction, because this one can go stale between the
 * dialog opening and the operator pressing Add.
 */
export async function countAffectedByRequiredChange(courseId: string): Promise<number> {
  await requireAdmin();
  const roster = await courseRoster(courseId);
  return roster.filter((r) => r.enrollment?.completedAt != null).length;
}

type LessonInput = {
  sectionId: string;
  lessonId: string | null;
  title: string;
  isRequired: boolean;
  estimatedMinutes: number | null;
  minWatchPercent: number;
};

/**
 * Create or edit a lesson.
 *
 * When the edit INCREASES the set of lessons a published course requires — a new required lesson,
 * or an optional one made required — and people who still hold the course have already completed
 * it, the author must say what happens to those completions. Without a choice the edit is
 * REFUSED (FR-039), so a client that skips the dialog cannot apply either outcome silently.
 */
export async function upsertLesson(
  courseId: string,
  input: LessonInput,
  onExistingCompletions?: CompletionChoice
): Promise<CourseResult | NeedsCompletionDecision> {
  await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the lesson a title." };

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true },
  });
  if (!course) return { ok: false, error: "That course no longer exists." };

  const existing = input.lessonId
    ? await prisma.lesson.findUnique({
        where: { id: input.lessonId },
        select: { isRequired: true, blocks: { select: { type: true, videoSource: true } } },
      })
    : null;

  // A watch gate on a video we cannot measure is a lie (FR-031).
  if (input.minWatchPercent > 0 && existing) {
    const video = existing.blocks.find((b) => b.type === "VIDEO" && b.videoSource);
    if (video?.videoSource && !isTrackableSource(video.videoSource)) {
      return { ok: false, error: untrackableReason(video.videoSource) ?? "" };
    }
  }

  const raisesRequirement =
    input.isRequired && (existing === null || existing.isRequired === false);
  const needsDecision = raisesRequirement && course.status === "PUBLISHED";

  return prisma.$transaction(async (tx) => {
    if (needsDecision) {
      // Re-taken HERE, inside the write, not trusted from the dialog.
      const roster = await courseRoster(courseId);
      const completed = roster.filter((r) => r.enrollment?.completedAt != null);

      if (completed.length > 0 && !onExistingCompletions) {
        return {
          ok: false as const,
          needsDecision: true as const,
          affected: completed.length,
          error: `${completed.length} ${completed.length === 1 ? "person has" : "people have"} already completed this course. Choose whether adding required content reopens it for them.`,
        };
      }

      if (completed.length > 0 && onExistingCompletions === "REOPEN") {
        const now = new Date();
        for (const entry of completed) {
          if (!entry.enrollment) continue;
          await tx.courseEnrollment.update({
            where: { id: entry.enrollment.id },
            data: {
              // The original date is kept, never erased (FR-040).
              firstCompletedAt: entry.enrollment.firstCompletedAt ?? entry.enrollment.completedAt,
              completedAt: null,
              reopenedAt: now,
            },
          });
        }
      }
    }

    if (input.lessonId) {
      await tx.lesson.update({
        where: { id: input.lessonId },
        data: {
          title,
          isRequired: input.isRequired,
          estimatedMinutes: input.estimatedMinutes,
          minWatchPercent: input.minWatchPercent,
        },
      });
    } else {
      const max = await tx.lesson.aggregate({
        where: { sectionId: input.sectionId },
        _max: { order: true },
      });
      await tx.lesson.create({
        data: {
          sectionId: input.sectionId,
          title,
          isRequired: input.isRequired,
          estimatedMinutes: input.estimatedMinutes,
          minWatchPercent: input.minWatchPercent,
          order: (max._max.order ?? 0) + 1,
        },
      });
    }
    revalidate(courseId);
    return { ok: true as const };
  });
}

export async function deleteLesson(courseId: string, lessonId: string): Promise<CourseResult> {
  await requireAdmin();
  await prisma.lesson.update({ where: { id: lessonId }, data: { deletedAt: new Date() } });
  revalidate(courseId);
  return { ok: true };
}

// ─── Reordering ─────────────────────────────────────────────────────────
// These touch ONLY the `order` column. Progress is keyed by lesson id (FR-023), so reordering can
// never move anyone's percentage — and nothing here goes near LessonProgress.

async function applyOrder(
  ids: string[],
  update: (id: string, order: number) => Prisma.PrismaPromise<unknown>
) {
  await prisma.$transaction(ids.map((id, i) => update(id, i + 1)));
}

export async function reorderSections(courseId: string, ids: string[]): Promise<CourseResult> {
  await requireAdmin();
  await applyOrder(ids, (id, order) =>
    prisma.courseSection.update({ where: { id }, data: { order } })
  );
  revalidate(courseId);
  return { ok: true };
}

export async function reorderLessons(courseId: string, ids: string[]): Promise<CourseResult> {
  await requireAdmin();
  await applyOrder(ids, (id, order) => prisma.lesson.update({ where: { id }, data: { order } }));
  revalidate(courseId);
  return { ok: true };
}

export async function reorderBlocks(courseId: string, ids: string[]): Promise<CourseResult> {
  await requireAdmin();
  await applyOrder(ids, (id, order) =>
    prisma.lessonBlock.update({ where: { id }, data: { order } })
  );
  revalidate(courseId);
  return { ok: true };
}

// ─── Blocks ─────────────────────────────────────────────────────────────

export type BlockInput = {
  lessonId: string;
  blockId: string | null;
  type: LessonBlockType;
  /** TEXT: markdown. VIDEO: the external link. FILE: handled by the upload path, not here. */
  value: string;
};

export async function upsertLessonBlock(
  courseId: string,
  input: BlockInput
): Promise<CourseResult> {
  await requireAdmin();
  const value = input.value.trim();

  const data: Prisma.LessonBlockUncheckedCreateInput = {
    lessonId: input.lessonId,
    type: input.type,
    order: 0,
  };

  if (input.type === "TEXT") {
    if (!value) return { ok: false, error: "Write something, or remove the block." };
    data.text = value;
  } else if (input.type === "VIDEO") {
    if (!value) return { ok: false, error: "Paste a video link." };
    const url = normalizeVideoUrl(value);
    const source = videoSourceFor(url);
    data.externalUrl = url;
    data.videoSource = source;

    // Swapping a trackable video for a Drive one would leave an unenforceable gate behind, so the
    // swap is refused rather than silently disarming the lesson's rules.
    if (!isTrackableSource(source)) {
      const lesson = await prisma.lesson.findUnique({
        where: { id: input.lessonId },
        select: { minWatchPercent: true, checkpoints: { select: { id: true } } },
      });
      if (lesson && (lesson.minWatchPercent > 0 || lesson.checkpoints.length > 0)) {
        return {
          ok: false,
          error: `${untrackableReason(source)} Remove this lesson's watch requirement and checkpoints first.`,
        };
      }
    }
  } else {
    return { ok: false, error: "Use the upload control for files." };
  }

  if (input.blockId) {
    const { lessonId: _l, order: _o, ...update } = data;
    await prisma.lessonBlock.update({ where: { id: input.blockId }, data: update });
  } else {
    const max = await prisma.lessonBlock.aggregate({
      where: { lessonId: input.lessonId },
      _max: { order: true },
    });
    data.order = (max._max.order ?? 0) + 1;
    await prisma.lessonBlock.create({ data });
  }
  revalidate(courseId);
  return { ok: true };
}

export async function deleteBlock(courseId: string, blockId: string): Promise<CourseResult> {
  await requireAdmin();
  await prisma.lessonBlock.delete({ where: { id: blockId } });
  revalidate(courseId);
  return { ok: true };
}

// ─── Video checkpoints (US3) ────────────────────────────────────────────

/**
 * A checkpoint is only meaningful on a video whose playback we can observe. On a Google Drive
 * source we REFUSE rather than store one that would never fire (FR-031) — a checkpoint that
 * silently never appears is worse than none, because everyone believes the lesson was gated.
 */
export async function upsertCheckpoint(
  courseId: string,
  input: {
    lessonId: string;
    checkpointId: string | null;
    atSec: number;
    prompt: string;
    options: string[];
    correctIndex: number;
  }
): Promise<CourseResult> {
  await requireAdmin();

  const prompt = input.prompt.trim();
  const options = input.options.map((o) => o.trim()).filter(Boolean);
  if (!prompt) return { ok: false, error: "Write the question." };
  if (options.length < 2) return { ok: false, error: "Give at least two answers to choose from." };
  if (input.correctIndex < 0 || input.correctIndex >= options.length) {
    return { ok: false, error: "Mark which answer is the right one." };
  }
  if (input.atSec < 0) return { ok: false, error: "Pick a moment in the video." };

  const lesson = await prisma.lesson.findUnique({
    where: { id: input.lessonId },
    select: { blocks: { select: { type: true, videoSource: true } } },
  });
  const video = lesson?.blocks.find((b) => b.type === "VIDEO" && b.videoSource);
  if (!video?.videoSource) {
    return { ok: false, error: "Add a video to this lesson first." };
  }
  if (!isTrackableSource(video.videoSource)) {
    return { ok: false, error: untrackableReason(video.videoSource) ?? "" };
  }

  const data = { atSec: input.atSec, prompt, options, correctIndex: input.correctIndex };
  if (input.checkpointId) {
    await prisma.videoCheckpoint.update({ where: { id: input.checkpointId }, data });
  } else {
    await prisma.videoCheckpoint.create({ data: { lessonId: input.lessonId, ...data } });
  }
  revalidate(courseId);
  return { ok: true };
}

export async function deleteCheckpoint(
  courseId: string,
  checkpointId: string
): Promise<CourseResult> {
  await requireAdmin();
  await prisma.videoCheckpoint.delete({ where: { id: checkpointId } });
  revalidate(courseId);
  return { ok: true };
}
