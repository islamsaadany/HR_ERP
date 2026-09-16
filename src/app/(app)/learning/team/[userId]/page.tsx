import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { refuseUnlessManages } from "@/lib/learning/manager-access";
import { learnerPlan } from "@/lib/learning/tracks";
import { deadlinesFor } from "@/lib/learning/overdue";
import { isOverdue } from "@/lib/learning/deadlines";
import { BackLink } from "@/components/admin/BackLink";
import { AutoRefresh } from "@/components/AutoRefresh";
import { LearnerPlan, type PlanRow } from "@/components/learning/LearnerPlan";

export const dynamic = "force-dynamic";

/**
 * One of my people's learning (spec 043 US3, mockup-approved 2026-09-16).
 *
 * A manager may add courses here and order what they added. They may NOT remove or move what a
 * company track requires — and that is structural rather than a check: a requirement lives on the
 * track, and nothing this page can reach writes to a track. The rows say so anyway, because an
 * absent control is indistinguishable from a bug.
 */
export default async function LearnerPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireModuleEnabled("learning");
  const me = await requireUser();
  const { userId } = await params;

  // Resolved against the CURRENT org chart, every time — like time-off approvals, never a snapshot.
  const refusal = await refuseUnlessManages(me, userId);
  if (refusal) redirect("/learning/team");

  const [learner, plan, deadlines, published] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, title: true },
    }),
    learnerPlan(userId),
    deadlinesFor(userId),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ order: "asc" }, { title: "asc" }],
      select: { id: true, title: true },
    }),
  ]);
  if (!learner) notFound();

  const completed = await prisma.courseEnrollment.findMany({
    where: { userId, completedAt: { not: null } },
    select: { courseId: true },
  });
  const done = new Set(completed.map((c) => c.courseId));
  const now = new Date();

  const row = (
    id: string,
    courseId: string,
    title: string,
    source: PlanRow["source"],
    trackName: string | null,
    addedByName: string | null
  ): PlanRow => {
    const due = deadlines.get(courseId)?.due ?? null;
    return {
      id,
      courseId,
      title,
      source,
      trackName,
      addedByName,
      due,
      overdue: isOverdue(due, done.has(courseId) ? now : null, now),
      completed: done.has(courseId),
    };
  };

  const rows: PlanRow[] = [
    ...plan.trackSteps.map((s) =>
      row(s.id, s.courseId, s.course.title, "TRACK", s.track.name, null)
    ),
    ...plan.personal.map((p) =>
      row(p.id, p.courseId, p.course.title, "ADDED", null, p.addedBy?.name ?? null)
    ),
  ];

  const held = new Set(rows.map((r) => r.courseId));
  const addable = published.filter((c) => !held.has(c.id));

  return (
    <div>
      <AutoRefresh />
      <BackLink href="/learning/team" label="My team's training" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        My team · Learning
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">{learner.name}</h1>
      {learner.title ? <p className="mt-1 text-muted">{learner.title}</p> : null}

      <LearnerPlan learnerId={learner.id} rows={rows} addable={addable} />
    </div>
  );
}
