import { prisma } from "@/lib/prisma";

/**
 * Which courses does this person hold because of a track (spec 043)?
 *
 * This module answers ONE question and nothing else: it gathers a FACT. It does not decide access.
 * The decision belongs to `resolveRoutes` in `access.ts` with the other four routes — a track being
 * the fifth is precisely why it must not get its own rule.
 *
 * Both routes into a track are covered here: an assignment naming the person, and an assignment to
 * a group they belong to. Revoked assignments grant nothing.
 */

/** Every course id this person holds through a live track assignment, plus their own additions. */
export async function trackCourseIdsFor(userId: string): Promise<Set<string>> {
  const [memberships, personal] = await Promise.all([
    prisma.learnerGroupMember.findMany({ where: { userId }, select: { groupId: true } }),
    prisma.learningPersonalStep.findMany({
      where: { userId, removedAt: null },
      select: { courseId: true },
    }),
  ]);
  const groupIds = memberships.map((m) => m.groupId);

  const steps = await prisma.learningTrackStep.findMany({
    where: {
      track: {
        assignments: {
          some: {
            revokedAt: null,
            OR: [{ userId }, ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : [])],
          },
        },
      },
    },
    select: { courseId: true },
  });

  return new Set([...steps.map((s) => s.courseId), ...personal.map((p) => p.courseId)]);
}

/**
 * The same question for ONE course — used by `courseAccessFor`, which is per-course by design.
 *
 * Kept as its own query rather than calling the set version and testing membership: the per-course
 * reader runs on every lesson open and every file stream, and pulling the person's whole track
 * catalogue to answer one yes/no would make the cheapest path the most expensive.
 */
export async function holdsCourseViaTrack(userId: string, courseId: string): Promise<boolean> {
  const memberships = await prisma.learnerGroupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);

  const [viaTrack, viaPersonal] = await Promise.all([
    prisma.learningTrackStep.findFirst({
      where: {
        courseId,
        track: {
          assignments: {
            some: {
              revokedAt: null,
              OR: [{ userId }, ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : [])],
            },
          },
        },
      },
      select: { id: true },
    }),
    prisma.learningPersonalStep.findFirst({
      where: { userId, courseId, removedAt: null },
      select: { id: true },
    }),
  ]);

  return viaTrack !== null || viaPersonal !== null;
}

/**
 * Everybody who holds ONE course because of a track — for the roster.
 *
 * The roster builds a candidate list by unioning the people each existing route reaches, and only
 * then asks the rule about each. So a fifth route needs its people ADDED TO THAT UNION as well as
 * a fact set on them: setting the fact alone would leave somebody who holds the course only through
 * a track missing from the candidate list entirely, and the roster would report them as not having
 * it — a silent omission, in the screen whose whole job is to answer "who has this course?".
 */
export async function trackHolderIdsForCourse(courseId: string): Promise<Set<string>> {
  const [steps, personal] = await Promise.all([
    prisma.learningTrackStep.findMany({
      where: { courseId },
      select: {
        track: {
          select: {
            assignments: {
              where: { revokedAt: null },
              select: { userId: true, groupId: true },
            },
          },
        },
      },
    }),
    prisma.learningPersonalStep.findMany({
      where: { courseId, removedAt: null },
      select: { userId: true },
    }),
  ]);

  const holders = new Set<string>(personal.map((p) => p.userId));
  const groupIds: string[] = [];
  for (const step of steps) {
    for (const assignment of step.track.assignments) {
      if (assignment.userId) holders.add(assignment.userId);
      if (assignment.groupId) groupIds.push(assignment.groupId);
    }
  }

  if (groupIds.length > 0) {
    const members = await prisma.learnerGroupMember.findMany({
      where: { groupId: { in: groupIds } },
      select: { userId: true },
    });
    for (const member of members) holders.add(member.userId);
  }

  return holders;
}
