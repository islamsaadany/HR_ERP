import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import {
  audienceWhere,
  subjectMatchesAudience,
  type AudienceRule,
  type AudienceSubject,
} from "@/lib/learning/audience";

/**
 * THE course-access derivation — one definition, used by every path that reads or writes anything
 * in the Learning module (spec 038 FR-015, FR-016, FR-042).
 *
 * WHY THIS EXISTS
 * Access to a course arrives by FOUR routes that have nothing to do with each other: a direct
 * assignment, a group the person belongs to, an audience rule matched live against the registry,
 * and simply being part-way through the course already. Each of those is removed by a different
 * action, in a different screen, by a different person. If every call site assembled its own
 * answer, the strictest path would hide a course someone was entitled to and the loosest would
 * show one they were not — which is precisely how the benefits pool ended up with three
 * disagreeing ceilings and an overrun nobody could see (`src/lib/benefits/pool.ts`).
 *
 * So: `resolveRoutes` below is pure and is the ONLY statement of the rule. The three exported
 * readers differ only in how they gather facts to feed it — per person, per person across all
 * courses, and per course across all people. None of them re-decides anything.
 *
 * THE ROUTE WORTH UNDERSTANDING is IN_PROGRESS. Being mid-course is modelled as a route in its own
 * right rather than an exception bolted onto the others. That single choice is what makes the
 * grandfathering requirements fall out instead of needing maintenance:
 *   FR-042 keep access mid-course      → the enrollment IS a route; nothing is written when the
 *                                        other routes disappear, so none of the six paths that can
 *                                        remove one has to remember to grandfather anybody.
 *   FR-043 ends on completion/withdrawal → `completedAt` or `accessWithdrawnAt` set stops the route
 *                                        granting. No cleanup job, no event to miss.
 *   FR-045 never started ⇒ lose it now  → no enrollment row exists, so there is nothing to grant.
 */

/** How a person reaches a course. Order is the order they are reported in. */
export type AccessRoute =
  | "ADMIN" // HR Admin / Super User — may see any course, including drafts they are authoring
  | "OPEN" // the course is published and open to every active employee
  | "DIRECT" // a live CourseAssignment naming this person
  | "GROUP" // a live CourseAssignment to a LearnerGroup they belong to
  | "AUDIENCE" // they match one of the course's live audience rules
  | "IN_PROGRESS"; // started and not finished — grandfathered (FR-042)

export type AccessFacts = {
  course: { status: "DRAFT" | "PUBLISHED"; visibility: "OPEN" | "RESTRICTED" };
  /** The viewer is an HR Admin or Super User. */
  viewerIsAdmin: boolean;
  /** The viewer is an ACTIVE employee. A leaver reaches nothing (FR-017). */
  viewerIsActive: boolean;
  hasDirectAssignment: boolean;
  hasGroupAssignment: boolean;
  matchesAudience: boolean;
  /** Null when they have never opened the course. */
  enrollment: { completedAt: Date | null; accessWithdrawnAt: Date | null } | null;
};

export type AccessResult = {
  allowed: boolean;
  routes: AccessRoute[];
  /**
   * True when the ONLY thing granting access is being mid-course. This is what the roster tints
   * gold and offers Withdraw on, and the one state `withdrawGrandfatheredAccess` may act against
   * (FR-044) — so it is derived here rather than re-inferred by the caller.
   */
  grandfatheredOnly: boolean;
};

/**
 * The rule. Pure — facts in, decision out, no database handle — so the whole matrix is testable
 * without a request context (`tests/learning-access.test.ts`).
 */
export function resolveRoutes(facts: AccessFacts): AccessResult {
  const routes: AccessRoute[] = [];

  // Admins may see anything, including drafts — they author them. This is the only route that
  // survives DRAFT, which is what makes "invisible to employees" (FR-005) true without a separate
  // preview back door that would then be a second access rule.
  if (facts.viewerIsAdmin) routes.push("ADMIN");

  const published = facts.course.status === "PUBLISHED";

  if (published && facts.viewerIsActive) {
    if (facts.course.visibility === "OPEN") routes.push("OPEN");
    if (facts.hasDirectAssignment) routes.push("DIRECT");
    if (facts.hasGroupAssignment) routes.push("GROUP");
    if (facts.matchesAudience) routes.push("AUDIENCE");

    // Grandfathering: started, not finished, not withdrawn. Deliberately NOT conditional on any
    // other route — its whole purpose is to outlive them.
    const e = facts.enrollment;
    if (e && e.completedAt === null && e.accessWithdrawnAt === null) routes.push("IN_PROGRESS");
  }

  const learnerRoutes = routes.filter((r) => r !== "ADMIN");
  return {
    allowed: routes.length > 0,
    routes,
    grandfatheredOnly: learnerRoutes.length === 1 && learnerRoutes[0] === "IN_PROGRESS",
  };
}

// ─── Fact gathering ─────────────────────────────────────────────────────
// Everything below only assembles `AccessFacts` and hands them to `resolveRoutes`. If you find
// yourself writing `if (assignment && !assignment.revokedAt)` outside this file, stop — that is
// the second copy of the rule this module exists to prevent.

/** The employee columns the audience rules read, plus the two the access rule reads. */
const SUBJECT_SELECT = {
  id: true,
  role: true,
  status: true,
  department: true,
  businessUnitId: true,
  employmentType: true,
  tenureBand: true,
  startDate: true,
  reportsToId: true,
} satisfies Prisma.UserSelect;

type Subject = Prisma.UserGetPayload<{ select: typeof SUBJECT_SELECT }>;

const asAudienceSubject = (u: Subject): AudienceSubject => ({
  status: u.status,
  department: u.department,
  businessUnitId: u.businessUnitId,
  employmentType: u.employmentType,
  tenureBand: u.tenureBand,
  startDate: u.startDate,
  reportsToId: u.reportsToId,
});

/**
 * Can this person open this course, and by which routes? The per-person reader — used by the
 * player, by every learning write, and by the file-streaming routes so a blob URL is never handed
 * to someone who could not open the course it belongs to.
 */
export async function courseAccessFor(
  userId: string,
  courseId: string,
  now: Date = new Date()
): Promise<AccessResult> {
  const [user, course] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: SUBJECT_SELECT }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        status: true,
        visibility: true,
        audiences: { select: { kind: true, value: true } },
        assignments: {
          where: { revokedAt: null },
          select: { userId: true, groupId: true },
        },
        enrollments: {
          where: { userId },
          select: { completedAt: true, accessWithdrawnAt: true },
        },
      },
    }),
  ]);

  if (!user || !course) return { allowed: false, routes: [], grandfatheredOnly: false };

  const groupIds = course.assignments
    .map((a) => a.groupId)
    .filter((id): id is string => id !== null);

  const groupMembership =
    groupIds.length === 0
      ? 0
      : await prisma.learnerGroupMember.count({
          where: { userId, groupId: { in: groupIds } },
        });

  return resolveRoutes({
    course: { status: course.status, visibility: course.visibility },
    viewerIsAdmin: isAdmin(user.role),
    viewerIsActive: user.status === "ACTIVE",
    hasDirectAssignment: course.assignments.some((a) => a.userId === userId),
    hasGroupAssignment: groupMembership > 0,
    matchesAudience: subjectMatchesAudience(
      asAudienceSubject(user),
      course.audiences as AudienceRule[],
      now
    ),
    enrollment: course.enrollments[0] ?? null,
  });
}

export type HeldCourse = {
  courseId: string;
  title: string;
  summary: string | null;
  coverBlobUrl: string | null;
  access: AccessResult;
  enrollment: {
    startedAt: Date;
    completedAt: Date | null;
    firstCompletedAt: Date | null;
    reopenedAt: Date | null;
    lastLessonId: string | null;
  } | null;
};

/**
 * Every course this employee currently holds — the "My learning" reader.
 *
 * A bounded number of queries whatever the headcount or course count: the employee's own record,
 * every published course with its rules and live assignments, the employee's group memberships,
 * and the employee's enrollments. The audience rules are then applied in memory via the predicate
 * twin in `audience.ts`, because issuing a query per course to ask the same question would be
 * absurd — see that file's note on why two encodings are tolerated and what keeps them honest.
 */
export async function accessibleCoursesFor(
  userId: string,
  now: Date = new Date()
): Promise<HeldCourse[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: SUBJECT_SELECT,
  });
  if (!user) return [];

  const [courses, memberships] = await Promise.all([
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ order: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        summary: true,
        coverBlobUrl: true,
        status: true,
        visibility: true,
        audiences: { select: { kind: true, value: true } },
        assignments: {
          where: { revokedAt: null },
          select: { userId: true, groupId: true },
        },
        enrollments: {
          where: { userId },
          select: {
            startedAt: true,
            completedAt: true,
            firstCompletedAt: true,
            reopenedAt: true,
            lastLessonId: true,
            accessWithdrawnAt: true,
          },
        },
      },
    }),
    prisma.learnerGroupMember.findMany({ where: { userId }, select: { groupId: true } }),
  ]);

  const myGroups = new Set(memberships.map((m) => m.groupId));
  const subject = asAudienceSubject(user);

  const held: HeldCourse[] = [];
  for (const course of courses) {
    const enrollment = course.enrollments[0] ?? null;
    const access = resolveRoutes({
      course: { status: course.status, visibility: course.visibility },
      // The admin route is deliberately NOT applied here: "My learning" is the employee's list of
      // obligations, not a catalogue of everything an admin may open. An admin sees the courses
      // they actually hold, like anyone else.
      viewerIsAdmin: false,
      viewerIsActive: user.status === "ACTIVE",
      hasDirectAssignment: course.assignments.some((a) => a.userId === userId),
      hasGroupAssignment: course.assignments.some(
        (a) => a.groupId !== null && myGroups.has(a.groupId)
      ),
      matchesAudience: subjectMatchesAudience(subject, course.audiences as AudienceRule[], now),
      enrollment,
    });
    if (!access.allowed) continue;

    held.push({
      courseId: course.id,
      title: course.title,
      summary: course.summary,
      coverBlobUrl: course.coverBlobUrl,
      access,
      enrollment: enrollment
        ? {
            startedAt: enrollment.startedAt,
            completedAt: enrollment.completedAt,
            firstCompletedAt: enrollment.firstCompletedAt,
            reopenedAt: enrollment.reopenedAt,
            lastLessonId: enrollment.lastLessonId,
          }
        : null,
    });
  }
  return held;
}

export type RosterEntry = {
  userId: string;
  name: string;
  email: string;
  department: string | null;
  access: AccessResult;
  enrollment: {
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    firstCompletedAt: Date | null;
    reopenedAt: Date | null;
  } | null;
};

/**
 * Everyone who currently holds this course, with the route each holds it by — the HR roster
 * reader, and the list `REOPEN` targets so a reopen reaches only people the course still reaches
 * (FR-041).
 *
 * Bounded queries: the course with its rules and assignments, the members of any assigned group,
 * the people the audience clause selects, the people with an enrollment, and one lookup of that
 * union. Never one query per employee.
 */
export async function courseRoster(
  courseId: string,
  now: Date = new Date()
): Promise<RosterEntry[]> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      status: true,
      visibility: true,
      audiences: { select: { kind: true, value: true } },
      assignments: { where: { revokedAt: null }, select: { userId: true, groupId: true } },
      enrollments: {
        select: {
          id: true,
          userId: true,
          startedAt: true,
          completedAt: true,
          firstCompletedAt: true,
          reopenedAt: true,
          accessWithdrawnAt: true,
        },
      },
    },
  });
  if (!course) return [];

  const directIds = course.assignments
    .map((a) => a.userId)
    .filter((id): id is string => id !== null);
  const groupIds = course.assignments
    .map((a) => a.groupId)
    .filter((id): id is string => id !== null);

  const rules = course.audiences as AudienceRule[];
  const where = rules.length > 0 ? audienceWhere(rules, now) : null;

  // Audience membership and the OPEN reach are asked SEPARATELY and never merged. Merging them
  // would let an OPEN course report every employee as route AUDIENCE, which is not what is
  // granting them access — the roster's whole job is to answer "why can this person see this?"
  // truthfully.
  const [groupMembers, audienceMatches, openMatches] = await Promise.all([
    groupIds.length > 0
      ? prisma.learnerGroupMember.findMany({
          where: { groupId: { in: groupIds } },
          select: { userId: true },
        })
      : Promise.resolve([]),
    where ? prisma.user.findMany({ where, select: { id: true } }) : Promise.resolve([]),
    course.visibility === "OPEN"
      ? prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } })
      : Promise.resolve([]),
  ]);

  const groupMemberIds = new Set(groupMembers.map((m) => m.userId));
  const audienceIds = new Set(audienceMatches.map((u) => u.id));
  const enrollmentByUser = new Map(course.enrollments.map((e) => [e.userId, e]));

  const candidateIds = new Set<string>([
    ...directIds,
    ...groupMemberIds,
    ...audienceIds,
    ...openMatches.map((u) => u.id),
    ...course.enrollments.map((e) => e.userId),
  ]);
  if (candidateIds.size === 0) return [];

  const people = await prisma.user.findMany({
    where: { id: { in: [...candidateIds] } },
    select: { ...SUBJECT_SELECT, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const roster: RosterEntry[] = [];
  for (const person of people) {
    const enrollment = enrollmentByUser.get(person.id) ?? null;
    const access = resolveRoutes({
      course: { status: course.status, visibility: course.visibility },
      // A roster reports LEARNERS, so nobody is listed merely for being an admin.
      viewerIsAdmin: false,
      viewerIsActive: person.status === "ACTIVE",
      hasDirectAssignment: directIds.includes(person.id),
      hasGroupAssignment: groupMemberIds.has(person.id),
      matchesAudience: audienceIds.has(person.id),
      enrollment,
    });
    if (!access.allowed) continue;

    roster.push({
      userId: person.id,
      name: person.name,
      email: person.email,
      department: person.department,
      access,
      enrollment: enrollment
        ? {
            id: enrollment.id,
            startedAt: enrollment.startedAt,
            completedAt: enrollment.completedAt,
            firstCompletedAt: enrollment.firstCompletedAt,
            reopenedAt: enrollment.reopenedAt,
          }
        : null,
    });
  }
  return roster;
}
