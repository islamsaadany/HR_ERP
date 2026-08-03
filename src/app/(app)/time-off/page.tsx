import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_CLASS, dayCount, overlaps } from "@/lib/leave";
import { MarkLeaveSeen } from "@/components/MarkLeaveSeen";
import { createLeaveRequest, cancelLeaveRequest, approveLeaveRequest, declineLeaveRequest } from "./actions";

export const dynamic = "force-dynamic";

export default async function TimeOffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireUser();
  await requireModuleEnabled("timeoff");
  const { error } = await searchParams;

  const [myRequests, teamPool] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
    }),
    // The manager's team pool (their reports' approved/pending leave) drives both the
    // approval queue and the overlap warnings (FR-011).
    prisma.leaveRequest.findMany({
      where: { approverId: me.id, status: { in: ["APPROVED", "PENDING"] } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const approvals = teamPool.filter((r) => r.status === "PENDING");
  function clashesFor(r: (typeof teamPool)[number]): string[] {
    return teamPool
      .filter(
        (o) =>
          o.id !== r.id &&
          o.userId !== r.userId &&
          overlaps(r.startDate, r.endDate, o.startDate, o.endDate)
      )
      .map((o) => o.user.name);
  }

  // Decided-but-unseen → clear the nav badge now that they're on the page (FR-014).
  const hasUnseen = myRequests.some(
    (r) => (r.status === "APPROVED" || r.status === "DECLINED") && r.decisionSeenAt == null
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl">
      <MarkLeaveSeen hasUnseen={hasUnseen} />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Time-Off</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Time off</h1>
      <p className="mt-1 text-muted">Request time off; your manager approves it.</p>
      {isAdmin(me.role) ? (
        <Link href="/admin/time-off" className="mt-2 inline-block text-sm font-medium text-navy-600 hover:text-navy-800">
          View all requests (HR) →
        </Link>
      ) : null}

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {/* Request form */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-serif text-lg text-ink">Request time off</h2>
        <form action={createLeaveRequest} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1">Start date</label>
            <input name="startDate" type="date" min={today} required className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1">End date</label>
            <input name="endDate" type="date" min={today} required className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1">Note (optional)</label>
            <input name="note" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">Submit request</button>
          </div>
        </form>
      </section>

      {/* Manager approvals */}
      {approvals.length > 0 ? (
        <section className="mt-6 rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 font-serif text-lg text-ink">Requests to approve</h2>
          <ul className="space-y-3">
            {approvals.map((r) => {
              const clashes = clashesFor(r);
              return (
                <li key={r.id} className="rounded-lg border border-line p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-ink">{r.user.name}</div>
                    <div className="text-sm text-muted">{dayCount(r.startDate, r.endDate)} day(s)</div>
                  </div>
                  <div className="text-sm text-muted">{formatDate(r.startDate)} → {formatDate(r.endDate)}</div>
                  {clashes.length > 0 ? (
                    <p className="mt-1 text-xs font-medium text-gold-700">
                      ⚠ Overlaps with {clashes.join(", ")}
                    </p>
                  ) : null}
                  {r.note ? <p className="mt-1 text-sm text-ink">“{r.note}”</p> : null}
                  <form action={approveLeaveRequest} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="comment" placeholder="Comment (optional)" className="flex-1 min-w-[160px] rounded-lg border border-line px-3 py-1.5 text-sm" />
                    <button type="submit" className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-700">Approve</button>
                    <button type="submit" formAction={declineLeaveRequest} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 hover:border-red-300 hover:text-red-600">Decline</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* My requests */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-serif text-lg text-ink">My requests</h2>
        {myRequests.length === 0 ? (
          <p className="text-sm text-muted">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {myRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm text-ink">{formatDate(r.startDate)} → {formatDate(r.endDate)} · {dayCount(r.startDate, r.endDate)}d</div>
                  {r.decisionComment ? <div className="text-xs text-muted">Manager: “{r.decisionComment}”</div> : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + LEAVE_STATUS_CLASS[r.status]}>{LEAVE_STATUS_LABEL[r.status]}</span>
                  {r.status === "PENDING" ? (
                    <form action={cancelLeaveRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-muted hover:text-red-600">Cancel</button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
