import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { learningManagers, requireLearningManager } from "@/lib/learning/managers";
import { BackLink } from "@/components/admin/BackLink";
import {
  LearningManagers,
  type AlwaysRow,
  type ManagerRow,
} from "@/components/learning/LearningManagers";

export const dynamic = "force-dynamic";

/**
 * Learning → Setup: who runs this module (spec 038 follow-up, 2026-08-22).
 *
 * Readable by anyone who runs Learning, EDITABLE only by HR. The read/write split is enforced
 * twice on purpose — `canEdit` here so a learning manager is not shown a button that would be
 * refused, and `requireAdmin()` inside `settings-actions.ts`, which is what actually holds.
 */
export default async function LearningSettingsPage() {
  const actor = await requireLearningManager();
  const canEdit = isAdmin(actor.role);

  const [appointed, admins, employees] = await Promise.all([
    learningManagers(),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { in: ["HR_ADMIN", "SUPER_USER"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    // Everyone EXCEPT the admin roles. An HR Admin already runs Learning, so offering to
    // "appoint" them would be offering a no-op — the action refuses it for the same reason. A
    // Finance person is offered, because Finance is not an admin role here and holds nothing.
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { notIn: ["HR_ADMIN", "SUPER_USER"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, department: true },
    }),
  ]);

  const managers: ManagerRow[] = appointed.map((m) => ({
    userId: m.userId,
    name: m.name,
    department: m.department,
    appointedByName: m.appointedByName,
    createdAt: m.createdAt,
  }));

  const always: AlwaysRow[] = admins.map((a) => ({
    userId: a.id,
    name: a.name,
    role: a.role === "SUPER_USER" ? "Super User" : "HR Admin",
  }));

  return (
    <div>
      <BackLink href="/admin/learning" label="Learning" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Learning · Setup
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Who runs Learning</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        A learning manager builds and runs courses without becoming an HR Admin. They reach Admin →
        Learning and nothing else — no employee records, no salaries, no benefits, no leave. Their
        own employee record and role do not change.
      </p>

      <div className="mt-5 max-w-[720px]">
        <LearningManagers
          managers={managers}
          always={always}
          options={employees}
          canEdit={canEdit}
        />
      </div>

      <div className="mt-4 max-w-[720px] rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[13px] font-bold text-navy-800">What a learning manager can do</h2>
        <ul className="mt-2 space-y-1.5 text-[12.5px] text-muted">
          <li>
            <b className="text-ink">Yes</b> — create, edit and publish courses; set who each course
            reaches; manage materials, resources and suggestions; see the roster of who has
            finished what.
          </li>
          <li>
            <b className="text-ink">No</b> — employee records, salaries, benefits, time-off,
            handbook, announcements, or anything else in the admin.
          </li>
          <li>
            <b className="text-ink">No</b> — appointing another learning manager. Only HR changes
            the list above.
          </li>
        </ul>
        <p className="mt-2.5 text-[11.5px] text-muted">
          HR keeps everything it has today. Appointing someone adds a pair of hands; it does not
          hand anything over. Nothing a manager does waits for approval — HR can see all of it and
          remove the appointment at any time.
        </p>
      </div>
    </div>
  );
}
