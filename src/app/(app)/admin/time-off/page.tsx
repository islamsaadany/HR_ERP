import Link from "next/link";
import type { LeaveStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_CLASS, overlaps } from "@/lib/leave";
import { countWorkingDays } from "@/lib/workdays";
import { getHolidaySet } from "@/lib/holidays";
import { closeLeaverPending, takenByUserForYear } from "@/lib/leave-queries";
import { approveLeaveRequest, declineLeaveRequest } from "../../time-off/actions";
import { BackLink } from "@/components/admin/BackLink";
import { DeleteLeaveRequestButton } from "@/components/admin/DeleteLeaveRequestButton";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "DECLINED", label: "Declined" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default async function AdminTimeOffPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const active = FILTERS.some((f) => f.key === status) ? status! : "ALL";

  // Idempotent sweep (spec 035, FR-008): a leaver's pending requests close on read.
  await closeLeaverPending();

  const where = active === "ALL" ? {} : { status: active as LeaveStatus };
  const year = new Date().getUTCFullYear();

  const [holidaySet, requests, pool] = await Promise.all([
    getHolidaySet(),
    prisma.leaveRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { startDate: "asc" }],
      include: {
        // reportsTo = the CURRENT approver of a pending request (spec 035, FR-007);
        // approver = the snapshot / eventual decider, shown on decided rows.
        user: { select: { name: true, reportsTo: { select: { name: true, status: true } } } },
        approver: { select: { name: true } },
      },
    }),
    // Company-wide approved/pending leave, to flag date clashes between people (FR-011).
    prisma.leaveRequest.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] } },
      select: { id: true, userId: true, startDate: true, endDate: true, user: { select: { name: true } } },
    }),
  ]);
  const takenByUser = await takenByUserForYear(year, holidaySet);

  function clashesFor(r: { id: string; userId: string; startDate: Date; endDate: Date }): string[] {
    return pool
      .filter(
        (o) =>
          o.id !== r.id &&
          o.userId !== r.userId &&
          overlaps(r.startDate, r.endDate, o.startDate, o.endDate)
      )
      .map((o) => o.user.name);
  }

  /** Who this request sits with / was decided by. Pending → the current org chart. */
  function approverLabel(r: (typeof requests)[number]): string {
    if (r.status === "PENDING") {
      return r.user.reportsTo?.status === "ACTIVE"
        ? r.user.reportsTo.name
        : "Super User (fallback)";
    }
    return r.approver?.name ?? "—";
  }

  return (
    // Full-height flex column (desktop) so the table is the only scroller.
    <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
      <BackLink href="/admin" label="Admin" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Time-Off</p>
          <h1 className="mt-1 font-serif text-3xl text-ink">All time-off requests</h1>
          <p className="mt-1 text-muted">
            Every request across the company, counted in working days (Fri/Sat &amp; public
            holidays excluded). You can approve or decline pending ones as a fallback.
          </p>
        </div>
        <a
          href="/admin/time-off/holidays"
          className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
        >
          Public holidays…
        </a>
      </div>

      {/* Status filter */}
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "ALL" ? "/admin/time-off" : `/admin/time-off?status=${f.key}`}
            className={
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition " +
              (active === f.key
                ? "border-navy-800 bg-navy-800 text-white"
                : "border-line bg-surface text-navy-700 hover:bg-navy-50")
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 ff-data-scroll rounded-xl border border-line bg-surface md:flex-1 md:min-h-0 md:!max-h-none">
        <table className="ff-data-table text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Dates</th>
              <th className="px-4 py-3 font-medium text-right">Working days</th>
              <th className="px-4 py-3 font-medium text-right">Taken {year}</th>
              <th className="px-4 py-3 font-medium">Approver</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No requests.</td>
              </tr>
            ) : (
              requests.map((r) => {
                const clashes = r.status === "PENDING" || r.status === "APPROVED" ? clashesFor(r) : [];
                const wasApprovedThenCancelled = r.status === "CANCELLED" && r.decidedAt != null;
                return (
                  <tr key={r.id} className="border-b border-line last:border-b-0 align-top">
                    <td className="px-4 py-3 font-medium text-ink">{r.user.name}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatDate(r.startDate)} → {formatDate(r.endDate)}
                      {clashes.length > 0 ? (
                        <div className="mt-0.5 text-xs font-medium text-gold-700">⚠ Overlaps with {clashes.join(", ")}</div>
                      ) : null}
                      {r.note ? <div className="mt-0.5 text-xs text-ink">“{r.note}”</div> : null}
                      {r.cancelledAt ? (
                        <div className="mt-0.5 text-xs text-muted">
                          {wasApprovedThenCancelled ? "was approved · " : ""}cancelled by employee {formatDate(r.cancelledAt)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {countWorkingDays(r.startDate, r.endDate, holidaySet)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{takenByUser.get(r.userId) ?? 0}</td>
                    <td className="px-4 py-3 text-muted">{approverLabel(r)}</td>
                    <td className="px-4 py-3">
                      <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + LEAVE_STATUS_CLASS[r.status]}>
                        {LEAVE_STATUS_LABEL[r.status]}
                      </span>
                      {r.decisionComment ? <div className="mt-0.5 text-xs text-muted">“{r.decisionComment}”</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.status === "PENDING" ? (
                          <form action={approveLeaveRequest} className="flex flex-wrap items-center gap-1.5">
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="rounded-lg bg-navy-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-navy-700">Approve</button>
                            <button type="submit" formAction={declineLeaveRequest} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy-700 hover:border-red-300 hover:text-red-600">Decline</button>
                          </form>
                        ) : null}
                        {/* Mistaken entries are removable on any status (requested 2026-08-18). */}
                        <DeleteLeaveRequestButton
                          id={r.id}
                          who={r.user.name}
                          dates={`${formatDate(r.startDate)} → ${formatDate(r.endDate)}`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
