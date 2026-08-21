import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { courseRoster } from "@/lib/learning/access";
import { computeProgressPercent } from "@/lib/learning/progress";
import { audienceReach } from "@/app/(app)/admin/learning/access-actions";
import { BackLink } from "@/components/admin/BackLink";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CourseBuilder, type BuilderSection } from "@/components/learning/CourseBuilder";
import { AudiencePicker, type RouteRow } from "@/components/learning/AudiencePicker";
import { CourseRoster, type RosterRow } from "@/components/learning/CourseRoster";
import { LearningTabs } from "@/components/learning/LearningTabs";

export const dynamic = "force-dynamic";

const TENURE_LABEL: Record<string, string> = {
  BAND_6MO_2Y: "6 months – 2 years",
  BAND_2_4Y: "2 – 4 years",
  BAND_4_7Y: "4 – 7 years",
  BAND_7_10Y: "7 years and over",
};

/** How the route each person holds is described on the roster — the "why can they see this?" column. */
function describeRoute(routes: string[]): string {
  if (routes.includes("OPEN")) return "Open to everyone";
  if (routes.includes("DIRECT")) return "Direct";
  if (routes.includes("AUDIENCE")) return "Audience";
  if (routes.includes("GROUP")) return "Group";
  if (routes.includes("IN_PROGRESS")) return "Mid-course only";
  return "—";
}

export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requireAdmin();
  const { courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      summary: true,
      status: true,
      visibility: true,
      renewAfterMonths: true,
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
                select: { id: true, type: true, text: true, externalUrl: true, videoSource: true, fileName: true },
              },
              checkpoints: {
                orderBy: { atSec: "asc" },
                select: { id: true, atSec: true, prompt: true, options: true, correctIndex: true },
              },
            },
          },
        },
      },
      audiences: {
        orderBy: { createdAt: "asc" },
        select: { id: true, kind: true, value: true },
      },
      assignments: {
        where: { revokedAt: null },
        select: {
          id: true,
          user: { select: { id: true, name: true } },
          group: { select: { id: true, name: true, _count: { select: { members: true } } } },
        },
      },
    },
  });
  if (!course) notFound();

  const [roster, reach, departments, businessUnits, employees, groups] = await Promise.all([
    courseRoster(courseId),
    audienceReach(courseId),
    prisma.department.findMany({ orderBy: { order: "asc" }, select: { name: true } }),
    prisma.businessUnit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, department: true },
    }),
    prisma.learnerGroup.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { members: true } } },
    }),
  ]);

  const managerIds = await prisma.user.findMany({
    where: { status: "ACTIVE", reports: { some: { status: "ACTIVE" } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Per-route reach, so a rule that reaches nobody is visibly different from one that works.
  const audienceRows: RouteRow[] = await Promise.all(
    course.audiences.map(async (a) => {
      const detail =
        a.kind === "ALL_ACTIVE"
          ? "Every active employee"
          : a.kind === "TENURE_BAND"
            ? (TENURE_LABEL[a.value ?? ""] ?? a.value ?? "—")
            : a.kind === "BUSINESS_UNIT"
              ? (businessUnits.find((b) => b.id === a.value)?.name ?? a.value ?? "—")
              : a.kind === "REPORTS_TO"
                ? (managerIds.find((m) => m.id === a.value)?.name ?? a.value ?? "—")
                : a.kind === "EMPLOYMENT_TYPE"
                  ? a.value === "FULL_TIME" ? "Full-time" : "Part-time"
                  : (a.value ?? "—");
      const label =
        a.kind === "ALL_ACTIVE" ? "Everyone"
        : a.kind === "DEPARTMENT" ? "Department"
        : a.kind === "BUSINESS_UNIT" ? "Business unit"
        : a.kind === "EMPLOYMENT_TYPE" ? "Employment type"
        : a.kind === "TENURE_BAND" ? "Tenure band"
        : "Reports to";
      const rows = roster.filter((r) => r.access.routes.includes("AUDIENCE"));
      return { id: a.id, kind: "AUDIENCE" as const, label, detail, reach: rows.length };
    })
  );

  const assignmentRows: RouteRow[] = course.assignments.map((a) =>
    a.group
      ? { id: a.id, kind: "GROUP" as const, label: "Group", detail: a.group.name, reach: a.group._count.members }
      : { id: a.id, kind: "DIRECT" as const, label: "Direct", detail: a.user?.name ?? "—", reach: 1 }
  );

  // Progress per person for the roster, in one query rather than one per row.
  const flat = course.sections.flatMap((s) => s.lessons).map((l) => ({ id: l.id, isRequired: l.isRequired }));
  const progress = await prisma.lessonProgress.findMany({
    where: { completedAt: { not: null }, enrollment: { courseId } },
    select: { lessonId: true, enrollment: { select: { userId: true } } },
  });
  const doneByUser = new Map<string, Set<string>>();
  for (const p of progress) {
    const set = doneByUser.get(p.enrollment.userId) ?? new Set<string>();
    set.add(p.lessonId);
    doneByUser.set(p.enrollment.userId, set);
  }

  const rosterRows: RosterRow[] = roster.map((r) => ({
    userId: r.userId,
    name: r.name,
    department: r.department,
    routeLabel: describeRoute(r.access.routes),
    grandfatheredOnly: r.access.grandfatheredOnly,
    percent: computeProgressPercent(flat, doneByUser.get(r.userId) ?? new Set()),
    completedAt: r.enrollment?.completedAt ?? null,
    firstCompletedAt: r.enrollment?.firstCompletedAt ?? null,
    reopenedAt: r.enrollment?.reopenedAt ?? null,
    enrollmentId: r.enrollment?.id ?? null,
  }));

  const sections: BuilderSection[] = course.sections.map((s) => ({
    id: s.id,
    title: s.title,
    lessons: s.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      isRequired: l.isRequired,
      estimatedMinutes: l.estimatedMinutes,
      minWatchPercent: l.minWatchPercent,
      blocks: l.blocks,
      checkpoints: l.checkpoints,
    })),
  }));

  return (
    <div>
      {/* Other admins assign courses and employees finish them while this sits open. */}
      <AutoRefresh />
      <BackLink href="/admin/learning" label="Learning" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl text-ink">{course.title}</h1>
        <Link href="/admin/learning/groups" className="text-sm text-muted hover:text-ink">
          Manage groups →
        </Link>
      </div>
      {course.summary ? <p className="mt-1 max-w-[70ch] text-muted">{course.summary}</p> : null}

      <div className="mt-5">
        <LearningTabs
          accessCount={audienceRows.length + assignmentRows.length}
          peopleCount={rosterRows.length}
          content={
            <CourseBuilder
              courseId={course.id}
              status={course.status}
              sections={sections}
              renewAfterMonths={course.renewAfterMonths}
            />
          }
          access={
            <AudiencePicker
              courseId={course.id}
              visibility={course.visibility}
              routes={[...audienceRows, ...assignmentRows]}
              totalReach={rosterRows.length}
              options={{
                departments: departments.map((d) => d.name),
                businessUnits,
                managers: managerIds,
                groups: groups.map((g) => ({ id: g.id, name: g.name, memberCount: g._count.members })),
                employees,
              }}
            />
          }
          people={<CourseRoster courseId={course.id} rows={rosterRows} />}
        />
      </div>
    </div>
  );
}
