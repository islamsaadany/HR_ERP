import { prisma } from "@/lib/prisma";
import {
  BAD_DUE_DAYS,
  NOT_PUBLISHED,
  TRACK_CHANGED,
  TWO_DEADLINES,
  type TrackResult,
} from "@/lib/learning/track-results";

/**
 * Learning tracks — the reads, and the raw writes (spec 043).
 *
 * A PLAIN MODULE, not part of `actions.ts`, because every export from a `"use server"` file is an
 * endpoint the browser can post to. These writes decide who holds which courses, so they do not
 * live at a URL: the action is the access check, the validation, and a call into here (the
 * 2026-08-25 rule). It also means the verify script can exercise the writes without going through
 * an action that would need a session.
 */

export type TrackSummary = {
  id: string;
  name: string;
  description: string | null;
  courseCount: number;
  withDeadline: number;
  /** How many PEOPLE are on it — groups expanded, revocations excluded, duplicates counted once. */
  peopleCount: number;
  courseTitles: string[];
};

export type TrackStep = {
  id: string;
  courseId: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "HIDDEN";
  order: number;
  dueDays: number | null;
  dueOn: Date | null;
};

// ─── Reads ──────────────────────────────────────────────────────────────

/**
 * Every track with its headline figures.
 *
 * `peopleCount` is computed by EXPANDING the groups, not by counting assignment rows. The number
 * sits beside the decision "is this path actually reaching anybody", so it has to be the number of
 * people — a row count would report a track assigned to one 40-person group as reaching 1, which is
 * the same fault as a count that is not its own choice's count (2026-08-22).
 */
export async function listTracks(): Promise<TrackSummary[]> {
  const tracks = await prisma.learningTrack.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      steps: {
        orderBy: { order: "asc" },
        select: { dueDays: true, dueOn: true, course: { select: { title: true } } },
      },
      assignments: {
        where: { revokedAt: null },
        select: { userId: true, groupId: true },
      },
    },
  });

  // One query for every group membership referenced across all tracks, rather than one per track.
  const groupIds = [
    ...new Set(
      tracks.flatMap((t) => t.assignments.map((a) => a.groupId).filter((id): id is string => !!id))
    ),
  ];
  const members =
    groupIds.length > 0
      ? await prisma.learnerGroupMember.findMany({
          where: { groupId: { in: groupIds } },
          select: { groupId: true, userId: true },
        })
      : [];
  const byGroup = new Map<string, string[]>();
  for (const m of members) byGroup.set(m.groupId, [...(byGroup.get(m.groupId) ?? []), m.userId]);

  return tracks.map((track) => {
    const people = new Set<string>();
    for (const a of track.assignments) {
      if (a.userId) people.add(a.userId);
      if (a.groupId) for (const id of byGroup.get(a.groupId) ?? []) people.add(id);
    }
    return {
      id: track.id,
      name: track.name,
      description: track.description,
      courseCount: track.steps.length,
      withDeadline: track.steps.filter((s) => s.dueDays !== null || s.dueOn !== null).length,
      peopleCount: people.size,
      courseTitles: track.steps.map((s) => s.course.title),
    };
  });
}

/** One track with its steps in order. */
export async function trackWithSteps(trackId: string) {
  return prisma.learningTrack.findUnique({
    where: { id: trackId },
    select: {
      id: true,
      name: true,
      description: true,
      steps: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          dueDays: true,
          dueOn: true,
          courseId: true,
          course: { select: { id: true, title: true, status: true } },
        },
      },
    },
  });
}

/** Who is on a track — people named directly, and the groups, unexpanded for display. */
export async function trackAssignments(trackId: string) {
  return prisma.learningTrackAssignment.findMany({
    where: { trackId, revokedAt: null },
    orderBy: { assignedAt: "asc" },
    select: {
      id: true,
      assignedAt: true,
      user: { select: { id: true, name: true, email: true } },
      group: { select: { id: true, name: true, _count: { select: { members: true } } } },
    },
  });
}

// ─── Writes ─────────────────────────────────────────────────────────────

export async function createTrack(name: string, description: string | null, actorId: string) {
  const clean = name.trim();
  if (!clean) return { ok: false as const, error: "Give the track a name." };
  const existing = await prisma.learningTrack.findUnique({ where: { name: clean } });
  if (existing) return { ok: false as const, error: `There is already a track called "${clean}".` };

  const track = await prisma.learningTrack.create({
    data: { name: clean, description, createdById: actorId, updatedById: actorId },
    select: { id: true },
  });
  return { ok: true as const, id: track.id };
}

/**
 * A field the form did not carry is LEFT ALONE, never read as an empty string and written as null
 * — the fault that would have silently thrown away a course's category on rename (2026-08-25).
 */
export async function updateTrack(
  trackId: string,
  patch: { name?: string; description?: string | null },
  actorId: string
): Promise<TrackResult> {
  const data: { name?: string; description?: string | null; updatedById: string } = {
    updatedById: actorId,
  };
  if (patch.name !== undefined) {
    const clean = patch.name.trim();
    if (!clean) return { ok: false, error: "Give the track a name." };
    const clash = await prisma.learningTrack.findFirst({
      where: { name: clean, id: { not: trackId } },
      select: { id: true },
    });
    if (clash) return { ok: false, error: `There is already a track called "${clean}".` };
    data.name = clean;
  }
  if (patch.description !== undefined) data.description = patch.description;

  await prisma.learningTrack.update({ where: { id: trackId }, data });
  return { ok: true };
}

/**
 * Deleting a track takes its steps and assignments with it (cascade) and touches NO enrollment.
 *
 * That is what keeps somebody mid-course from losing it: their enrollment is itself an access
 * route, so it outlives the track that introduced them to the course. Nothing here has to remember
 * to grandfather anybody — the rule in `access.ts` does it by construction.
 */
export async function deleteTrack(trackId: string): Promise<TrackResult> {
  await prisma.learningTrack.delete({ where: { id: trackId } });
  return { ok: true };
}

export async function addStep(trackId: string, courseId: string): Promise<TrackResult> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true },
  });
  if (!course) return { ok: false, error: "That course no longer exists." };
  if (course.status !== "PUBLISHED") return { ok: false, error: NOT_PUBLISHED };

  const existing = await prisma.learningTrackStep.findUnique({
    where: { trackId_courseId: { trackId, courseId } },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "That course is already in this track." };

  const max = await prisma.learningTrackStep.aggregate({
    where: { trackId },
    _max: { order: true },
  });
  await prisma.learningTrackStep.create({
    data: { trackId, courseId, order: (max._max.order ?? 0) + 1 },
  });
  return { ok: true };
}

export async function removeStep(stepId: string): Promise<TrackResult> {
  await prisma.learningTrackStep.delete({ where: { id: stepId } });
  return { ok: true };
}

/**
 * Put a track's steps into the given order.
 *
 * THE GUARD STARTS FROM WHAT IT PROTECTS, the same shape proven for the course list: it iterates
 * the steps the DATABASE says are in this track and demands the submitted list account for all of
 * them. Written the other way round it would have a hole exactly where it matters — a step added
 * in another tab is absent from the submitted list, produces nothing to check, and would keep a
 * stale number that places it somewhere nobody chose.
 */
export async function reorderSteps(trackId: string, stepIds: string[]): Promise<TrackResult> {
  if (new Set(stepIds).size !== stepIds.length) return { ok: false, error: TRACK_CHANGED };

  return prisma.$transaction(async (tx) => {
    const stored = await tx.learningTrackStep.findMany({
      where: { trackId },
      select: { id: true, order: true },
    });
    const submitted = new Set(stepIds);
    if (stored.length !== stepIds.length || stored.some((s) => !submitted.has(s.id))) {
      return { ok: false, error: TRACK_CHANGED };
    }

    const current = new Map(stored.map((s) => [s.id, s.order]));
    for (const [index, id] of stepIds.entries()) {
      if (current.get(id) === index + 1) continue;
      await tx.learningTrackStep.update({ where: { id }, data: { order: index + 1 } });
    }
    return { ok: true };
  });
}

/**
 * Set — or clear — a step's deadline.
 *
 * Exactly one kind, or none. Refused here in words; the check constraint in migration 078 is the
 * backstop, because a rule that only one write path knows is a rule the next write path breaks.
 */
export async function setStepDeadline(
  stepId: string,
  deadline: { dueDays: number | null; dueOn: Date | null }
): Promise<TrackResult> {
  if (deadline.dueDays !== null && deadline.dueOn !== null) {
    return { ok: false, error: TWO_DEADLINES };
  }
  if (deadline.dueDays !== null && (!Number.isInteger(deadline.dueDays) || deadline.dueDays < 1)) {
    return { ok: false, error: BAD_DUE_DAYS };
  }
  await prisma.learningTrackStep.update({
    where: { id: stepId },
    data: { dueDays: deadline.dueDays, dueOn: deadline.dueOn },
  });
  return { ok: true };
}

export async function assignTrack(
  trackId: string,
  subject: { userId?: string; groupId?: string },
  actorId: string
): Promise<TrackResult> {
  const { userId, groupId } = subject;
  if ((userId ? 1 : 0) + (groupId ? 1 : 0) !== 1) {
    return { ok: false, error: "Choose either a person or a group." };
  }

  // A previously revoked assignment is REVIVED rather than duplicated — the unique constraint is
  // on (track, subject) regardless of revocation, so a second row could never exist anyway, and
  // reviving keeps the history in one row.
  const existing = await prisma.learningTrackAssignment.findFirst({
    where: { trackId, ...(userId ? { userId } : { groupId }) },
    select: { id: true, revokedAt: true },
  });
  if (existing) {
    if (existing.revokedAt === null) return { ok: false, error: "They are already on this track." };
    await prisma.learningTrackAssignment.update({
      where: { id: existing.id },
      // The clock restarts: a period deadline counts from when they joined, and they are joining
      // now. Keeping the original date would make a newly-assigned person instantly overdue.
      data: { revokedAt: null, assignedAt: new Date(), assignedById: actorId },
    });
    return { ok: true, id: existing.id };
  }

  const created = await prisma.learningTrackAssignment.create({
    data: { trackId, userId, groupId, assignedById: actorId },
    select: { id: true },
  });
  return { ok: true, id: created.id };
}

/** Revocation, never deletion — so who was on what, and when, survives. */
export async function revokeTrackAssignment(assignmentId: string): Promise<TrackResult> {
  await prisma.learningTrackAssignment.update({
    where: { id: assignmentId },
    data: { revokedAt: new Date() },
  });
  return { ok: true };
}

// ─── A manager's own additions (spec 043, US3) ──────────────────────────
//
// Everything below writes ONLY to `LearningPersonalStep`. That is what makes "a manager can never
// remove a company requirement" structural rather than merely checked: a company requirement lives
// in `LearningTrackStep`, and no function here touches it. The action checks as well, because a
// rule with one enforcement point is a rule the next code path breaks.

export async function addPersonalStep(
  userId: string,
  courseId: string,
  actorId: string
): Promise<TrackResult> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true },
  });
  if (!course) return { ok: false, error: "That course no longer exists." };
  if (course.status !== "PUBLISHED") return { ok: false, error: NOT_PUBLISHED };

  const existing = await prisma.learningPersonalStep.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true, removedAt: true },
  });

  const max = await prisma.learningPersonalStep.aggregate({
    where: { userId, removedAt: null },
    _max: { order: true },
  });
  const order = (max._max.order ?? 0) + 1;

  if (existing) {
    if (existing.removedAt === null) return { ok: false, error: "They already have that course." };
    // Re-adding revives the row rather than making a second one — the unique constraint means a
    // second could not exist anyway, and reviving keeps who added it and when in one place.
    await prisma.learningPersonalStep.update({
      where: { id: existing.id },
      data: { removedAt: null, addedAt: new Date(), addedById: actorId, order },
    });
    return { ok: true, id: existing.id };
  }

  const created = await prisma.learningPersonalStep.create({
    data: { userId, courseId, order, addedById: actorId },
    select: { id: true },
  });
  return { ok: true, id: created.id };
}

export async function removePersonalStep(stepId: string): Promise<TrackResult> {
  await prisma.learningPersonalStep.update({
    where: { id: stepId },
    data: { removedAt: new Date() },
  });
  return { ok: true };
}

/**
 * Order one person's own additions.
 *
 * The same guard shape as everywhere else: start from what the DATABASE says this person has and
 * refuse a list that does not account for all of it. A company requirement has no id that could
 * appear in this list — the query only ever returns personal steps — so the manager's ordering
 * cannot reach one even by naming it.
 */
export async function reorderPersonalSteps(
  userId: string,
  stepIds: string[]
): Promise<TrackResult> {
  if (new Set(stepIds).size !== stepIds.length) return { ok: false, error: TRACK_CHANGED };

  return prisma.$transaction(async (tx) => {
    const stored = await tx.learningPersonalStep.findMany({
      where: { userId, removedAt: null },
      select: { id: true, order: true },
    });
    const submitted = new Set(stepIds);
    if (stored.length !== stepIds.length || stored.some((s) => !submitted.has(s.id))) {
      return { ok: false, error: TRACK_CHANGED };
    }
    const current = new Map(stored.map((s) => [s.id, s.order]));
    for (const [index, id] of stepIds.entries()) {
      if (current.get(id) === index + 1) continue;
      await tx.learningPersonalStep.update({ where: { id }, data: { order: index + 1 } });
    }
    return { ok: true };
  });
}

/** What one person holds, split by where it came from — for the manager's view of them. */
export async function learnerPlan(userId: string) {
  const [trackSteps, personal] = await Promise.all([
    prisma.learningTrackStep.findMany({
      where: {
        track: {
          assignments: {
            some: {
              revokedAt: null,
              OR: [
                { userId },
                { group: { members: { some: { userId } } } },
              ],
            },
          },
        },
        course: { status: "PUBLISHED" },
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        dueDays: true,
        dueOn: true,
        courseId: true,
        course: { select: { title: true } },
        track: { select: { id: true, name: true } },
      },
    }),
    prisma.learningPersonalStep.findMany({
      where: { userId, removedAt: null, course: { status: "PUBLISHED" } },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        dueDays: true,
        dueOn: true,
        courseId: true,
        addedAt: true,
        course: { select: { title: true } },
        addedBy: { select: { name: true } },
      },
    }),
  ]);
  return { trackSteps, personal };
}
