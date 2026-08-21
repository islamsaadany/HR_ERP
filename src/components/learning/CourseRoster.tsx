"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawGrandfatheredAccess } from "@/app/(app)/admin/learning/access-actions";
import { formatDate } from "@/lib/labels";
import { ProgressBar } from "@/components/learning/ProgressBar";
import { CHIP } from "@/components/learning/ui";

export type RosterRow = {
  userId: string;
  name: string;
  department: string | null;
  routeLabel: string;
  /** True when the only thing granting access is being mid-course (FR-042). */
  grandfatheredOnly: boolean;
  percent: number;
  completedAt: Date | null;
  firstCompletedAt: Date | null;
  reopenedAt: Date | null;
  enrollmentId: string | null;
};

/**
 * Who holds this course, and why.
 *
 * ROUTE is the column that earns its place: it answers "why can this person see this?" without
 * opening anything. Gold rows are grandfathered — the course no longer reaches them, but they were
 * part-way through, so they keep it until they finish. Withdraw ends that, and is refused for
 * anyone holding the course by a real route.
 *
 * A reopened completion shows BOTH dates. Hiding the original would read as the work being erased.
 */
export function CourseRoster({ courseId, rows }: { courseId: string; rows: RosterRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const done = rows.filter((r) => r.completedAt !== null).length;

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        {rows.length === 0 ? (
          "Nobody can see this course yet — add a route on the Access tab."
        ) : (
          <>
            <b className="text-ink">{rows.length}</b> {rows.length === 1 ? "person" : "people"} hold
            this course · <b className="text-ink">{done}</b> finished
          </>
        )}
      </p>

      {error ? (
        <p role="alert" className="mb-3 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {error}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="ff-data-scroll overflow-x-auto rounded-xl border border-line">
          <table className="ff-data-table w-full text-[13px]">
            <thead>
              <tr>
                <th className="px-2.5 py-2 text-left">Employee</th>
                <th className="px-2.5 py-2 text-left">Department</th>
                <th className="px-2.5 py-2 text-left">Route</th>
                <th className="px-2.5 py-2 text-left">Progress</th>
                <th className="px-2.5 py-2 text-left">Completed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className={row.grandfatheredOnly ? "bg-gold-50/60" : undefined}>
                  <td className="px-2.5 py-2">{row.name}</td>
                  <td className="px-2.5 py-2 text-muted">{row.department ?? "—"}</td>
                  <td className="px-2.5 py-2">
                    <span className={row.grandfatheredOnly ? CHIP.attention : CHIP.navy}>
                      {row.routeLabel}
                    </span>
                  </td>
                  <td className="px-2.5 py-2">
                    <ProgressBar percent={row.percent} width={96} />
                  </td>
                  <td className="px-2.5 py-2">
                    {row.completedAt ? (
                      <span className={CHIP.done}>{formatDate(row.completedAt)}</span>
                    ) : row.reopenedAt && row.firstCompletedAt ? (
                      <span className={CHIP.muted}>
                        {formatDate(row.firstCompletedAt)} · reopened {formatDate(row.reopenedAt)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    {row.grandfatheredOnly && row.enrollmentId ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="text-xs text-red-700 hover:underline"
                        onClick={() => {
                          setError(null);
                          startTransition(async () => {
                            const r = await withdrawGrandfatheredAccess(courseId, row.enrollmentId!);
                            if (!r.ok) setError(r.error);
                            else router.refresh();
                          });
                        }}
                      >
                        Withdraw
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {rows.some((r) => r.grandfatheredOnly) ? (
        <p className="mt-2.5 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12.5px] text-gold-800">
          <b>Gold rows are mid-course.</b> No route reaches these people any more — they moved
          department, left a group, or an audience changed — but they had already started, so they
          keep the course until they finish. <b>Withdraw</b> ends that.
        </p>
      ) : null}
    </div>
  );
}
