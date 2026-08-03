import { requireUser } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_CLASS, dayCount } from "@/lib/leave";
import { createLeaveRequest, cancelLeaveRequest, decideLeaveRequest } from "./actions";

export const dynamic = "force-dynamic";

export default async function TimeOffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireUser();
  await requireModuleEnabled("timeoff");
  const { error } = await searchParams;

  const [myRequests, approvals] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.leaveRequest.findMany({
      where: { approverId: me.id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Time-Off</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Time off</h1>
      <p className="mt-1 text-muted">Request time off; your manager approves it.</p>

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
            {approvals.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-ink">{r.user.name}</div>
                  <div className="text-sm text-muted">{dayCount(r.startDate, r.endDate)} day(s)</div>
                </div>
                <div className="text-sm text-muted">{formatDate(r.startDate)} → {formatDate(r.endDate)}</div>
                {r.note ? <p className="mt-1 text-sm text-ink">“{r.note}”</p> : null}
                <form action={decideLeaveRequest} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="comment" placeholder="Comment (optional)" className="flex-1 min-w-[160px] rounded-lg border border-line px-3 py-1.5 text-sm" />
                  <button name="decision" value="APPROVED" className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-700">Approve</button>
                  <button name="decision" value="DECLINED" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 hover:border-red-300 hover:text-red-600">Decline</button>
                </form>
              </li>
            ))}
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
