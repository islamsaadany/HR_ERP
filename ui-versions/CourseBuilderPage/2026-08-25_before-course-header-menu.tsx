import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireLearningManager } from "@/lib/learning/managers";
import { courseRoster } from "@/lib/learning/access";
import { computeProgressPercent } from "@/lib/learning/progress";
import { audienceReachByRule } from "@/lib/learning/queries";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CourseBuilder, type BuilderSection } from "@/components/learning/CourseBuilder";
import { CourseStatusControl } from "@/components/learning/CourseStatusControl";
import { AccessSetup, type FieldSpec } from "@/components/learning/AccessSetup";
import { CourseRoster, type RosterRow } from "@/components/learning/CourseRoster";
import { LearningTabs } from "@/components/learning/LearningTabs";
import { CourseMaterials } from "@/components/learning/CourseMaterials";

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
  await requireLearningManager();
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
              videoDurationSec: true,
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

  const [roster, reachByRule, departments, businessUnits, employees, groups] = await Promise.all([
    courseRoster(courseId),
    // Per RULE, not one figure reused on every row — see the query's comment. The old page fetched
    // a combined total and printed it beside every choice, so a choice reaching nobody looked
    // exactly like one that worked.
    audienceReachByRule(courseId),
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

  // Materials: the three document slots and the PUBLISHED resources. Pending suggestions are NOT
  // loaded here — they live in one queue on /admin/learning, so HR reviews them in one place
  // rather than course by course.
  const [documents, resources] = await Promise.all([
    prisma.courseDocument.findMany({
      where: { courseId },
      select: { id: true, slot: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
    }),
    prisma.courseResource.findMany({
      where: { courseId, status: "PUBLISHED" },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        name: true,
        url: true,
        suggestedBy: { select: { name: true } },
      },
    }),
  ]);

  const managerIds = await prisma.user.findMany({
    where: { status: "ACTIVE", reports: { some: { status: "ACTIVE" } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // ── The Access setup, as FIELDS rather than rows (2026-08-22) ──────────────────────────────
  //
  // Each choice carries ITS OWN count. The page this replaced computed one combined figure and
  // printed it beside every choice, so "Consulting" and an empty business unit both read the same
  // number — which defeated the one thing the column existed for.
  const nameOfBusinessUnit = (id: string | null) =>
    businessUnits.find((b) => b.id === id)?.name ?? id ?? "—";
  const nameOfManager = (id: string | null) => managerIds.find((m) => m.id === id)?.name ?? id ?? "—";

  const audienceChoices = (kind: string, label: (value: string | null) => string) =>
    course.audiences
      .filter((a) => a.kind === kind)
      .map((a) => ({
        rowId: a.id,
        label: label(a.value),
        reach: reachByRule.get(a.id) ?? 0,
      }));

  const chosenValues = (kind: string) =>
    new Set(course.audiences.filter((a) => a.kind === kind).map((a) => a.value ?? ""));

  const groupAssignments = course.assignments.filter((a) => a.group !== null);
  const personAssignments = course.assignments.filter((a) => a.user !== null);
  const chosenGroupIds = new Set(groupAssignments.map((a) => a.group!.id));
  const chosenPersonIds = new Set(personAssignments.map((a) => a.user!.id));

  // Somebody the course ALREADY reaches is offered but not tickable — adding them again would make
  // a second row that changes nothing, and then a puzzle about why removing one did nothing.
  const alreadyReached = new Set(
    roster.filter((r) => !r.access.grandfatheredOnly).map((r) => r.userId)
  );

  const accessFields: FieldSpec[] = [
    {
      field: "DEPARTMENT",
      label: "Departments",
      hint: "everyone in them, now and later",
      searchable: departments.length > 8,
      chosen: audienceChoices("DEPARTMENT", (v) => v ?? "—"),
      options: departments
        .filter((d) => !chosenValues("DEPARTMENT").has(d.name))
        .map((d) => ({ value: d.name, label: d.name })),
    },
    {
      field: "GROUP",
      label: "Groups",
      hint: "lists you made on Manage groups",
      searchable: groups.length > 8,
      chosen: groupAssignments.map((a) => ({
        rowId: a.id,
        label: a.group!.name,
        reach: a.group!._count.members,
      })),
      options: groups
        .filter((g) => !chosenGroupIds.has(g.id))
        .map((g) => ({ value: g.id, label: g.name, reach: g._count.members })),
    },
    {
      field: "PERSON",
      label: "Specific people",
      hint: "named one by one",
      searchable: true,
      chosen: personAssignments.map((a) => ({
        rowId: a.id,
        label: a.user!.name,
        reach: null,
      })),
      options: employees
        .filter((e) => !chosenPersonIds.has(e.id))
        .map((e) => ({
          value: e.id,
          label: e.name,
          hint: e.department,
          reach: null,
          covered: alreadyReached.has(e.id),
        })),
    },
    {
      field: "BUSINESS_UNIT",
      label: "Business units",
      hint: "the brand someone belongs to",
      searchable: businessUnits.length > 8,
      chosen: audienceChoices("BUSINESS_UNIT", nameOfBusinessUnit),
      options: businessUnits
        .filter((b) => !chosenValues("BUSINESS_UNIT").has(b.id))
        .map((b) => ({ value: b.id, label: b.name })),
    },
    {
      field: "TENURE_BAND",
      label: "Tenure",
      hint: "how long they have been here — worked out from their start date, live",
      searchable: false,
      chosen: audienceChoices("TENURE_BAND", (v) => TENURE_LABEL[v ?? ""] ?? v ?? "—"),
      options: Object.entries(TENURE_LABEL)
        .filter(([v]) => !chosenValues("TENURE_BAND").has(v))
        .map(([v, label]) => ({ value: v, label })),
    },
    {
      field: "EMPLOYMENT_TYPE",
      label: "Employment type",
      hint: "full-time or part-time",
      searchable: false,
      chosen: audienceChoices("EMPLOYMENT_TYPE", (v) =>
        v === "FULL_TIME" ? "Full-time" : "Part-time"
      ),
      options: [
        { value: "FULL_TIME", label: "Full-time" },
        { value: "PART_TIME", label: "Part-time" },
      ].filter((o) => !chosenValues("EMPLOYMENT_TYPE").has(o.value)),
    },
    {
      field: "REPORTS_TO",
      label: "A manager's team",
      hint: "their direct reports, as the org chart stands today",
      searchable: managerIds.length > 8,
      chosen: audienceChoices("REPORTS_TO", nameOfManager),
      options: managerIds
        .filter((m) => !chosenValues("REPORTS_TO").has(m.id))
        .map((m) => ({ value: m.id, label: m.name })),
    },
  ];

  // A course made before 2026-08-22 can carry an "Everyone" AUDIENCE from the old add-a-route box,
  // which reaches the whole company regardless of the switch. The new form cannot create one; the
  // panel offers to clear the ones that exist.
  const legacyEveryoneRule = course.audiences.some((a) => a.kind === "ALL_ACTIVE");

  const accessCount =
    accessFields.reduce((sum, f) => sum + f.chosen.length, 0) + (legacyEveryoneRule ? 1 : 0);

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
      videoDurationSec: l.videoDurationSec,
      minWatchPercent: l.minWatchPercent,
      blocks: l.blocks,
      checkpoints: l.checkpoints,
    })),
  }));

  return (
    <div>
      {/* Other admins assign courses and employees finish them while this sits open. */}
      <AutoRefresh />
      {/* Sticky on scroll (2026-08-21). A long curriculum pushes the course name, its status and
          Publish off the top, and the tabs with them — so you scroll back up just to know where you
          are. This works only because /admin/learning/[courseId] is NOT a single-scroll route in
          AppShell: an ancestor with `overflow-hidden` would silently kill `position: sticky`, which
          is exactly the trap CLAUDE.md records. If this page is ever added to that list, this
          header stops sticking and nothing will warn you.

          The tabs sit INSIDE the sticky block, because a tab bar that scrolls away from its own
          panel is worse than no sticky header at all. */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-paper/95 px-4 pb-2 pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link href="/admin/learning" className="text-sm text-muted hover:text-ink">
            ← Learning
          </Link>
          <h1 className="font-serif text-2xl text-ink">{course.title}</h1>
          {/* The status chip moved INTO CourseStatusControl (2026-08-22): it now has three states,
              and a chip here plus buttons over there is two places telling you the same thing. */}
        </div>
        <div className="flex items-center gap-3">
          <CourseStatusControl courseId={course.id} status={course.status} />
          <Link href="/admin/learning/groups" className="text-sm text-muted hover:text-ink">
            Manage groups →
          </Link>
        </div>
      </div>
      {course.summary ? (
        <p className="mt-0.5 max-w-[70ch] text-sm text-muted">{course.summary}</p>
      ) : null}
      </div>

      <div className="mt-3">
        <LearningTabs
          accessCount={accessCount}
          peopleCount={rosterRows.length}
          materialsCount={documents.length + resources.length}
          content={
            <CourseBuilder
              courseId={course.id}
              sections={sections}
              renewAfterMonths={course.renewAfterMonths}
            />
          }
          access={
            <AccessSetup
              courseId={course.id}
              visibility={course.visibility}
              fields={accessFields}
              // Distinct PEOPLE, from the roster — never the sum of the chips, which counts
              // anybody reached twice twice. Grandfathered-only people are excluded: they hold the
              // course because they started it, not because of anything chosen here.
              totalReach={roster.filter((r) => !r.access.grandfatheredOnly).length}
              legacyEveryoneRule={legacyEveryoneRule}
            />
          }
          people={<CourseRoster courseId={course.id} rows={rosterRows} />}
          materials={
            <CourseMaterials
              courseId={course.id}
              documents={documents}
              resources={resources.map((r) => ({
                id: r.id,
                kind: r.kind,
                name: r.name,
                url: r.url,
                suggestedByName: r.suggestedBy?.name ?? null,
              }))}
            />
          }
        />
      </div>
    </div>
  );
}
