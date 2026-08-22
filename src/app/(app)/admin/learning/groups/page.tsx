import { prisma } from "@/lib/prisma";
import { requireLearningManager } from "@/lib/learning/managers";
import { BackLink } from "@/components/admin/BackLink";
import { GroupManager, type GroupRow } from "@/components/learning/GroupManager";

export const dynamic = "force-dynamic";

export default async function LearnerGroupsPage() {
  await requireLearningManager();

  const [groups, employees] = await Promise.all([
    prisma.learnerGroup.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        members: {
          orderBy: { user: { name: "asc" } },
          select: { user: { select: { id: true, name: true, department: true } } },
        },
        _count: { select: { assignments: true } },
      },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, department: true },
    }),
  ]);

  const rows: GroupRow[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    members: g.members.map((m) => m.user),
    courseCount: g._count.assignments,
  }));

  return (
    <div>
      <BackLink href="/admin/learning" label="Learning" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Learner groups</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        Named cohorts for the cases no department or tenure band describes. Membership is live —
        adding someone gives them every course currently assigned to the group.
      </p>
      <div className="mt-5">
        <GroupManager groups={rows} employees={employees} />
      </div>
    </div>
  );
}
