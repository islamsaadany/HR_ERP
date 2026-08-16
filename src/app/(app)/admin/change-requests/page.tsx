import Link from "next/link";
import { requireAdmin } from "@/lib/roles";
import { formatDate } from "@/lib/labels";
import { pendingRequests } from "@/lib/profile/change-requests";
import { currentValue, displayValue, fieldLabel } from "@/lib/profile/requestable";
import {
  ChangeRequestQueue,
  type QueueRequest,
} from "@/components/admin/ChangeRequestQueue";

export const dynamic = "force-dynamic";

/**
 * HR's review queue (spec 029, US2). Approving IS the edit — one click writes that field to the
 * employee record, so nothing is retyped.
 *
 * The "current" value on each row is read HERE, at review time, and never taken from the request
 * (FR-010). If HR edited the record while the request was queued, they see their own value on the
 * left, so approving can't silently revert it.
 */
export default async function ChangeRequestsPage() {
  await requireAdmin();
  const requests = await pendingRequests();

  const queue: QueueRequest[] = requests.map((req) => ({
    id: req.id,
    employeeName: req.user.name,
    employeeEmail: req.user.email,
    employeeTitle: req.user.title,
    employeeHasLeft: req.user.status !== "ACTIVE",
    submittedAt: formatDate(req.createdAt) ?? "",
    reason: req.reason,
    fields: req.fields.map((f) => ({
      id: f.id,
      label: fieldLabel(f.field),
      current: displayValue(f.field, currentValue(f.field, req.user)),
      requested: displayValue(f.field, f.requestedValue),
      status: f.status,
      decisionReason: f.decisionReason,
      decidedBy: f.decidedBy?.name ?? null,
      decidedAt: f.decidedAt ? formatDate(f.decidedAt) : null,
    })),
  }));

  const waiting = queue.reduce(
    (n, r) => n + r.fields.filter((f) => f.status === "PENDING").length,
    0
  );

  return (
    <div className="max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-3xl text-ink">Change requests</h1>
        {waiting > 0 ? (
          <span className="rounded-full border border-gold-300 bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-800">
            {waiting} waiting
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-muted">
        Corrections employees have asked for. Decide each field on its own — approving writes it to
        their record immediately.
      </p>

      <ChangeRequestQueue requests={queue} />

      <Link href="/admin" className="mt-8 inline-block text-sm text-muted hover:text-ink">
        ← Back to Admin
      </Link>
    </div>
  );
}
