"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPersonalStepAction,
  removePersonalStepAction,
  reorderPersonalStepsAction,
} from "@/app/(app)/admin/learning/tracks/manager-actions";
import { BTN_GHOST, CHIP } from "@/components/learning/ui";
import { formatDate } from "@/lib/labels";

/**
 * What one person holds, and the half of it a manager may change (spec 043 US3).
 *
 * A company requirement shows its handle FADED with the reason ON THE ROW — "required by the
 * company track, you can't remove or move this one" — rather than simply having no control. An
 * absent button is indistinguishable from a bug, and a manager who cannot see why would reasonably
 * conclude the page is broken.
 */
export type PlanRow = {
  id: string;
  courseId: string;
  title: string;
  source: "TRACK" | "ADDED";
  trackName: string | null;
  addedByName: string | null;
  due: Date | null;
  overdue: boolean;
  completed: boolean;
};

export function LearnerPlan({
  learnerId,
  rows,
  addable,
}: {
  learnerId: string;
  rows: PlanRow[];
  addable: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const mine = rows.filter((r) => r.source === "ADDED");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "That did not work.");
      else {
        setAdding(false);
        router.refresh();
      }
    });
  };

  const move = (row: PlanRow, direction: -1 | 1) => {
    const ids = mine.map((r) => r.id);
    const index = ids.indexOf(row.id);
    const to = index + direction;
    if (index === -1 || to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    run(() => reorderPersonalStepsAction(learnerId, ids));
  };

  return (
    <div className="mt-6">
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] font-semibold text-red-700"
        >
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          They hold no courses yet. Add one below, or put them on a track.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const locked = r.source === "TRACK";
            const index = mine.findIndex((m) => m.id === r.id);
            return (
              <li
                key={r.id}
                className="ff-card flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 pl-2"
              >
                <span className="flex flex-none flex-col gap-0.5">
                  <button
                    type="button"
                    aria-label={locked ? `${r.title} is required by the company` : `Move ${r.title} up`}
                    disabled={locked || pending || index <= 0}
                    onClick={() => move(r, -1)}
                    className="grid h-[17px] w-[22px] place-items-center rounded border border-line bg-surface text-[9px] text-navy-700 hover:bg-navy-50 disabled:opacity-25"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={locked ? `${r.title} is required by the company` : `Move ${r.title} down`}
                    disabled={locked || pending || index === -1 || index === mine.length - 1}
                    onClick={() => move(r, 1)}
                    className="grid h-[17px] w-[22px] place-items-center rounded border border-line bg-surface text-[9px] text-navy-700 hover:bg-navy-50 disabled:opacity-25"
                  >
                    ▼
                  </button>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-bold text-navy-800">{r.title}</span>
                    {locked ? (
                      <span className={CHIP.navy}>{r.trackName}</span>
                    ) : (
                      <span className={CHIP.attention}>Added by you</span>
                    )}
                    {r.completed ? <span className={CHIP.done}>✓ Done</span> : null}
                    {r.overdue ? <span className={CHIP.danger}>Overdue</span> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {locked
                      ? "Required by the company track — you can't remove or move this one"
                      : r.addedByName
                        ? `Added by ${r.addedByName}`
                        : "Added for this person"}
                    {r.due ? ` · ${r.overdue ? "was due" : "due"} ${formatDate(r.due)}` : ""}
                  </span>
                </span>

                {locked ? null : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => removePersonalStepAction(learnerId, r.id))}
                    className="flex-none rounded-lg border border-line bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 rounded-xl border border-line bg-surface p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Add a course for them
          </p>
          {addable.length === 0 ? (
            <p className="text-sm text-muted">They already hold every published course.</p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {addable.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => addPersonalStepAction(learnerId, c.id))}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] font-semibold text-navy-800 hover:border-navy-300 hover:bg-navy-50 disabled:opacity-60"
                  >
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setAdding(false)} className={`${BTN_GHOST} mt-3`}>
            Done
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${BTN_GHOST} mt-3`}>
          + Add a course
        </button>
      )}
    </div>
  );
}
