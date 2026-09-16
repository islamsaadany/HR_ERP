import { prisma } from "@/lib/prisma";
import {
  earliestDeadline,
  isOverdue,
  resolveDeadline,
  type StepDeadline,
} from "@/lib/learning/deadlines";

/**
 * Who is overdue on what (spec 043).
 *
 * ONE bounded sweep, not a query per person: live track assignments with their steps, the group
 * memberships that expand them, the managers' personal additions, and the enrollments that say what
 * is finished. Everything after that is the pure derivation in `deadlines.ts` — this module gathers,
 * it does not decide.
 *
 * It is used by the daily job AND by the screens, so a person is never told one thing and chased
 * on another.
 */

export type OverdueCourse = {
  userId: string;
  userName: string;
  userEmail: string;
  courseId: string;
  courseTitle: string;
  trackName: string | null;
  due: Date;
  managerId: string | null;
};

/** Every course with a deadline that this person holds, resolved to real dates. */
export type PersonalDeadline = {
  courseId: string;
  trackId: string | null;
  trackName: string | null;
  due: Date | null;
};

type StepRow = StepDeadline & {
  courseId: string;
  courseTitle: string;
  trackId: string | null;
  trackName: string | null;
  /** The day THIS person joined — what a period counts from. */
  joinedAt: Date;
};

/**
 * Every deadline-bearing step each named person holds, with the join date a period counts from.
 *
 * For a GROUP assignment the period counts from the LATER of the track reaching the group and the
 * person joining it. Both are "when this became theirs", and taking the earlier would make somebody
 * who joined the group last week instantly overdue on a path assigned to it last year.
 */
async function stepsByUser(userIds: string[] | null): Promise<Map<string, StepRow[]>> {
  const userFilter = userIds ? { in: userIds } : undefined;

  const [assignments, personal] = await Promise.all([
    prisma.learningTrackAssignment.findMany({
      where: {
        revokedAt: null,
        OR: [
          { userId: userFilter ? { in: userIds! } : { not: null } },
          { groupId: { not: null } },
        ],
      },
      select: {
        assignedAt: true,
        userId: true,
        groupId: true,
        track: {
          select: {
            id: true,
            name: true,
            steps: {
              select: {
                courseId: true,
                dueDays: true,
                dueOn: true,
                course: { select: { title: true, status: true } },
              },
            },
          },
        },
      },
    }),
    prisma.learningPersonalStep.findMany({
      where: { removedAt: null, ...(userFilter ? { userId: userFilter } : {}) },
      select: {
        userId: true,
        courseId: true,
        dueDays: true,
        dueOn: true,
        addedAt: true,
        course: { select: { title: true, status: true } },
      },
    }),
  ]);

  const groupIds = [
    ...new Set(assignments.map((a) => a.groupId).filter((id): id is string => id !== null)),
  ];
  const members =
    groupIds.length > 0
      ? await prisma.learnerGroupMember.findMany({
          where: {
            groupId: { in: groupIds },
            ...(userFilter ? { userId: userFilter } : {}),
          },
          select: { groupId: true, userId: true, addedAt: true },
        })
      : [];
  const byGroup = new Map<string, { userId: string; addedAt: Date }[]>();
  for (const m of members) {
    byGroup.set(m.groupId, [...(byGroup.get(m.groupId) ?? []), { userId: m.userId, addedAt: m.addedAt }]);
  }

  const out = new Map<string, StepRow[]>();
  const push = (userId: string, row: StepRow) =>
    out.set(userId, [...(out.get(userId) ?? []), row]);

  for (const assignment of assignments) {
    // Only PUBLISHED courses are held at all — a draft or paused course on a track reaches nobody,
    // so it cannot be overdue either.
    const steps = assignment.track.steps.filter((s) => s.course.status === "PUBLISHED");
    if (steps.length === 0) continue;

    const subjects: { userId: string; joinedAt: Date }[] = assignment.userId
      ? [{ userId: assignment.userId, joinedAt: assignment.assignedAt }]
      : (byGroup.get(assignment.groupId!) ?? []).map((m) => ({
          userId: m.userId,
          joinedAt: m.addedAt > assignment.assignedAt ? m.addedAt : assignment.assignedAt,
        }));

    for (const subject of subjects) {
      for (const step of steps) {
        push(subject.userId, {
          courseId: step.courseId,
          courseTitle: step.course.title,
          trackId: assignment.track.id,
          trackName: assignment.track.name,
          dueDays: step.dueDays,
          dueOn: step.dueOn,
          joinedAt: subject.joinedAt,
        });
      }
    }
  }

  for (const step of personal) {
    if (step.course.status !== "PUBLISHED") continue;
    push(step.userId, {
      courseId: step.courseId,
      courseTitle: step.course.title,
      trackId: null,
      trackName: null,
      dueDays: step.dueDays,
      dueOn: step.dueOn,
      joinedAt: step.addedAt,
    });
  }

  return out;
}

/** One person's deadlines, resolved — for their own page and their manager's. */
export async function deadlinesFor(userId: string): Promise<Map<string, PersonalDeadline>> {
  const steps = (await stepsByUser([userId])).get(userId) ?? [];
  const byCourse = new Map<string, PersonalDeadline>();

  for (const step of steps) {
    const due = resolveDeadline(step, step.joinedAt);
    const existing = byCourse.get(step.courseId);
    if (!existing) {
      byCourse.set(step.courseId, {
        courseId: step.courseId,
        trackId: step.trackId,
        trackName: step.trackName,
        due,
      });
      continue;
    }
    // The same course through two paths: the earlier date governs, both already resolved.
    const winner = earliestDeadline([existing.due, due]);
    byCourse.set(step.courseId, {
      ...existing,
      due: winner,
      ...(winner !== null && due !== null && winner.getTime() === due.getTime() && existing.due === null
        ? { trackId: step.trackId, trackName: step.trackName }
        : {}),
    });
  }

  return byCourse;
}

/**
 * Everything overdue right now, across everybody — the daily job's one sweep.
 *
 * Completion is what removes somebody from this list, which is how "the chasing stops the moment
 * the obligation is met" is true with nothing written and no event to miss.
 */
export async function overdueNow(now: Date = new Date()): Promise<OverdueCourse[]> {
  const steps = await stepsByUser(null);
  if (steps.size === 0) return [];

  const userIds = [...steps.keys()];
  const [users, enrollments] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, status: "ACTIVE" },
      select: { id: true, name: true, email: true, reportsToId: true },
    }),
    prisma.courseEnrollment.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, courseId: true, completedAt: true },
    }),
  ]);

  const completed = new Set(
    enrollments.filter((e) => e.completedAt !== null).map((e) => `${e.userId}:${e.courseId}`)
  );

  const out: OverdueCourse[] = [];
  for (const user of users) {
    const byCourse = new Map<string, { row: StepRow; due: Date }>();
    for (const step of steps.get(user.id) ?? []) {
      const due = resolveDeadline(step, step.joinedAt);
      if (due === null) continue;
      const existing = byCourse.get(step.courseId);
      if (!existing || due.getTime() < existing.due.getTime()) {
        byCourse.set(step.courseId, { row: step, due });
      }
    }

    for (const { row, due } of byCourse.values()) {
      if (completed.has(`${user.id}:${row.courseId}`)) continue;
      if (!isOverdue(due, null, now)) continue;
      out.push({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        courseId: row.courseId,
        courseTitle: row.courseTitle,
        trackName: row.trackName,
        due,
        managerId: user.reportsToId,
      });
    }
  }

  return out;
}
