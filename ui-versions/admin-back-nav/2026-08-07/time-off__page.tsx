import Link from "next/link";
import type { LeaveStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_CLASS, dayCount, overlaps } from "@/lib/leave";
import { approveLeaveRequest, declineLeaveRequest } from "../../time-off/actions";

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

  const where = active === "ALL" ? {} : { status: active as LeaveStatus };

  const [requests, pool] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { startDate: "asc" }],
      include: {
        user: { select: { name: true } },
        approver: { select: { name: true } },
      },
    }),
    // Company-wide approved/pending leave, to flag date clashes between people (FR-011).
    prisma.leaveRequest.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] } },
      select: { id: true, userId: true, startDate: true, endDate: true, user: { select: { name: true } } },
    }),
  ]);

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

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Time-Off</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">All time-off requests</h1>
      <p className="mt-1 text-muted">Every request across the company. You can approve or decline pending ones as a fallback.</p>

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

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Dates</th>
              <th className="px-4 py-3 font-medium">Days</th>
              <th className="px-4 py-3 font-medium">Approver</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No requests.</td>
              </tr>
            ) : (
              requests.map((r) => {
                const clashes = r.status === "PENDING" || r.status === "APPROVED" ? clashesFor(r) : [];
                return (
                  <tr key={r.id} className="border-b border-line last:border-b-0 align-top">
                    <td className="px-4 py-3 font-medium text-ink">{r.user.name}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatDate(r.startDate)} → {formatDate(r.endDate)}
                      {clashes.length > 0 ? (
                        <div className="mt-0.5 text-xs font-medium text-gold-700">⚠ Overlaps with {clashes.join(", ")}</div>
                      ) : null}
                      {r.note ? <div className="mt-0.5 text-xs text-ink">“{r.note}”</div> : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">{dayCount(r.startDate, r.endDate)}</td>
                    <td className="px-4 py-3 text-muted">{r.approver?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + LEAVE_STATUS_CLASS[r.status]}>
                        {LEAVE_STATUS_LABEL[r.status]}
                      </span>
                      {r.decisionComment ? <div className="mt-0.5 text-xs text-muted">“{r.decisionComment}”</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "PENDING" ? (
                        <form action={approveLeaveRequest} className="flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="rounded-lg bg-navy-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-navy-700">Approve</button>
                          <button type="submit" formAction={declineLeaveRequest} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy-700 hover:border-red-300 hover:text-red-600">Decline</button>
                        </form>
                      ) : null}
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
