import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_CLASS, overlaps } from "@/lib/leave";
import { countWorkingDays, dayKey, takenInYear } from "@/lib/workdays";
import { getHolidaySet, expandRange } from "@/lib/holidays";
import { pendingApprovalWhere, closeLeaverPending } from "@/lib/leave-queries";
import { MarkLeaveSeen } from "@/components/MarkLeaveSeen";
import { TimeOffRequestForm, type ExistingRange } from "@/components/TimeOffRequestForm";
import { cancelLeaveRequest, approveLeaveRequest, declineLeaveRequest } from "./actions";

export const dynamic = "force-dynamic";

export default async function TimeOffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireUser();
  await requireModuleEnabled("timeoff");
  const { error } = await searchParams;

  // Idempotent sweep (spec 035, FR-008): a leaver's pending requests close on read.
  await closeLeaverPending();

  const year = new Date().getUTCFullYear();
  const [holidaySet, holidayRows, myRequests, approvals] = await Promise.all([
    getHolidaySet(),
    prisma.publicHoliday.findMany({ orderBy: { actualStart: "asc" } }).catch(() => []),
    prisma.leaveRequest.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
    }),
    // The approval queue resolves against the CURRENT org chart (spec 035, FR-007) —
    // my active reports' pending requests, not an approver snapshot.
    prisma.leaveRequest.findMany({
      where: pendingApprovalWhere(me),
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const wd = (s: Date, e: Date) => countWorkingDays(s, e, holidaySet);

  // My year count — approved working days in the current calendar year.
  const takenThisYear = takenInYear(
    myRequests.filter((r) => r.status === "APPROVED"),
    year,
    holidaySet
  );

  // Context for the manager's cards: each requester's year count + team overlap pool.
  const requesterIds = Array.from(new Set(approvals.map((r) => r.userId)));
  const contextRequests = requesterIds.length
    ? await prisma.leaveRequest.findMany({
        where: { userId: { in: requesterIds }, status: "APPROVED" },
        select: { userId: true, startDate: true, endDate: true },
      })
    : [];
  const takenByRequester = new Map<string, number>();
  for (const id of requesterIds) {
    takenByRequester.set(
      id,
      takenInYear(contextRequests.filter((r) => r.userId === id), year, holidaySet)
    );
  }
  // Overlap warnings (FR-011): the queue's requests PLUS my reports' already-approved
  // trips — a pending request clashing with a teammate's booked holiday must warn too.
  const reportApproved = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED", user: { status: "ACTIVE", reportsToId: me.id } },
    include: { user: { select: { name: true } } },
  });
  const teamPool = [
    ...approvals.map((r) => ({ id: r.id, userId: r.userId, name: r.user.name, startDate: r.startDate, endDate: r.endDate })),
    ...reportApproved.map((r) => ({ id: r.id, userId: r.userId, name: r.user.name, startDate: r.startDate, endDate: r.endDate })),
  ];
  function clashesFor(r: (typeof teamPool)[number]): string[] {
    return teamPool
      .filter((o) => o.id !== r.id && o.userId !== r.userId && overlaps(r.startDate, r.endDate, o.startDate, o.endDate))
      .map((o) => o.name);
  }

  // The form's client-side inputs: holidays (for the live preview) and my open ranges
  // (for the self-overlap warning, FR-005).
  // Every day of every holiday's ACTUAL range, so the client preview greys out the same days
  // the server counts (spec 037: a multi-day holiday is one row covering several days).
  const formHolidays = holidayRows.flatMap((h) =>
    expandRange(h.actualStart, h.actualEnd).map((iso) => ({ iso, name: h.name }))
  );
  const myOpenRanges: ExistingRange[] = myRequests
    .filter((r) => r.status === "PENDING" || r.status === "APPROVED")
    .map((r) => ({
      startISO: dayKey(r.startDate),
      endISO: dayKey(r.endDate),
      label: `${formatDate(r.startDate)} → ${formatDate(r.endDate)}`,
      status: r.status as "PENDING" | "APPROVED",
    }));

  const hasUnseen = myRequests.some(
    (r) => (r.status === "APPROVED" || r.status === "DECLINED") && r.decisionSeenAt == null
  );

  // What the nav badge counts, as this render sees it. Any submit/approve/decline/cancel
  // revalidates this page, so a changed signature is the cue for the badge to re-check
  // immediately instead of waiting out its 45s poll (stale-badge report, 2026-08-19).
  const badgeSignature = [
    approvals.length,
    myRequests.filter((r) => r.status === "PENDING").length,
    myRequests.filter((r) => (r.status === "APPROVED" || r.status === "DECLINED") && r.decisionSeenAt == null).length,
  ].join(":");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return (
    <div className="max-w-3xl">
      <MarkLeaveSeen hasUnseen={hasUnseen} signature={badgeSignature} />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Time-Off</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Time off</h1>
      <p className="mt-1 text-muted">Request time off; your manager approves it.</p>
      {isAdmin(me.role) ? (
        <Link href="/admin/time-off" className="mt-2 inline-block text-sm font-medium text-navy-600 hover:text-navy-800">
          View all requests (HR) →
        </Link>
      ) : null}

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {/* Year count + request form (spec 035, mockup section 1) */}
      <div className="mt-6 grid gap-4 sm:grid-cols-[220px_1fr]">
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Taken in {year}</p>
          <p className="mt-1 font-serif text-3xl text-navy-800 tabular-nums">
            {takenThisYear}
            <span className="ml-1.5 text-sm font-sans font-semibold text-muted">working days</span>
          </p>
          <p className="mt-1 text-[11px] text-muted">
            approved requests only · Fri/Sat &amp; public holidays don&apos;t count
          </p>
        </div>
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 font-serif text-lg text-ink">Request time off</h2>
          <TimeOffRequestForm holidays={formHolidays} existing={myOpenRanges} />
        </section>
      </div>

      {/* Manager approvals */}
      {approvals.length > 0 ? (
        <section className="mt-6 rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 font-serif text-lg text-ink">Requests to approve</h2>
          <ul className="space-y-3">
            {approvals.map((r) => {
              const clashes = clashesFor({ id: r.id, userId: r.userId, name: r.user.name, startDate: r.startDate, endDate: r.endDate });
              return (
                <li key={r.id} className="rounded-lg border border-line p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-ink">{r.user.name}</div>
                    <div className="text-sm text-muted">
                      <span className="font-semibold text-ink">{wd(r.startDate, r.endDate)}</span> working day(s)
                    </div>
                  </div>
                  <div className="text-sm text-muted">{formatDate(r.startDate)} → {formatDate(r.endDate)}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-[11px] font-bold text-navy-700">
                      {takenByRequester.get(r.userId) ?? 0} days taken in {year}
                    </span>
                    {clashes.length > 0 ? (
                      <span className="rounded-full border border-gold-300 bg-gold-100 px-2.5 py-0.5 text-[11px] font-bold text-gold-800">
                        ⚠ Overlaps with {clashes.join(", ")}
                      </span>
                    ) : null}
                  </div>
                  {r.note ? <p className="mt-1.5 text-sm text-ink">“{r.note}”</p> : null}
                  <form action={approveLeaveRequest} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="comment" placeholder="Comment (optional)" className="min-w-[160px] flex-1 rounded-lg border border-line px-3 py-1.5 text-sm" />
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
          <>
            <ul className="divide-y divide-line">
              {myRequests.map((r) => {
                const cancellable =
                  r.status === "PENDING" ||
                  (r.status === "APPROVED" && r.startDate.getTime() > startOfToday.getTime());
                const wasApprovedThenCancelled = r.status === "CANCELLED" && r.decidedAt != null;
                return (
                  <li key={r.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm text-ink">
                        {formatDate(r.startDate)} → {formatDate(r.endDate)} ·{" "}
                        <span className="font-semibold">{wd(r.startDate, r.endDate)}</span> working day(s)
                      </div>
                      {r.decisionComment ? <div className="text-xs text-muted">Manager: “{r.decisionComment}”</div> : null}
                      {wasApprovedThenCancelled && r.cancelledAt ? (
                        <div className="text-xs text-muted">Was approved — cancelled {formatDate(r.cancelledAt)}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + LEAVE_STATUS_CLASS[r.status]}>
                        {LEAVE_STATUS_LABEL[r.status]}
                      </span>
                      {cancellable ? (
                        <form action={cancelLeaveRequest}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                            {r.status === "APPROVED" ? "Cancel trip" : "Cancel"}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] text-muted">
              An approved trip can be cancelled any time before its start date — the days come off
              your count and your manager sees the cancellation. Started or past trips are history.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
