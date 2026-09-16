"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addStepAction,
  removeStepAction,
  reorderStepsAction,
} from "@/app/(app)/admin/learning/tracks/actions";
import { DeadlineField } from "@/components/learning/DeadlineField";
import { BTN_GHOST } from "@/components/learning/ui";

/**
 * The courses in a track, in the order they are to be met (spec 043, mockup-approved 2026-09-16).
 *
 * Reordering is up/down here rather than the drag handle the course list uses. A track holds a
 * handful of courses in one short list with no grouping and no state to stay inside, so the drag
 * machinery — frozen measurements, window listeners, clamped auto-scroll — would be a lot of
 * apparatus for a five-row list, and it is not free: every one of those pieces exists because of a
 * fault found in a browser. Two buttons cannot lose pointer capture.
 */
export type BuilderStep = {
  id: string;
  courseId: string;
  title: string;
  dueDays: number | null;
  dueOn: Date | null;
};

export function TrackBuilder({
  trackId,
  steps,
  addable,
}: {
  trackId: string;
  steps: BuilderStep[];
  addable: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "That did not work.");
      else router.refresh();
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = steps.map((s) => s.id);
    const to = index + direction;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    run(() => reorderStepsAction(trackId, next));
  };

  return (
    <div>
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] font-semibold text-red-700"
        >
          {error}
        </p>
      ) : null}

      {steps.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          No courses in this track yet. Add the first one below — the order you add them in is the
          order people will meet them, and you can move them afterwards.
        </p>
      ) : (
        <ul className="space-y-2">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="ff-card flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 pl-2"
            >
              <span className="flex flex-none flex-col gap-0.5">
                <button
                  type="button"
                  aria-label={`Move ${step.title} up`}
                  disabled={index === 0 || pending}
                  onClick={() => move(index, -1)}
                  className="grid h-[17px] w-[22px] place-items-center rounded border border-line bg-surface text-[9px] text-navy-700 hover:bg-navy-50 disabled:opacity-25"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move ${step.title} down`}
                  disabled={index === steps.length - 1 || pending}
                  onClick={() => move(index, 1)}
                  className="grid h-[17px] w-[22px] place-items-center rounded border border-line bg-surface text-[9px] text-navy-700 hover:bg-navy-50 disabled:opacity-25"
                >
                  ▼
                </button>
              </span>
              <span className="w-4 flex-none text-right text-[11px] font-bold tabular-nums text-navy-300">
                {index + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-navy-800">{step.title}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Everyone on this track holds it
                </span>
              </span>

              <DeadlineField
                trackId={trackId}
                stepId={step.id}
                dueDays={step.dueDays}
                dueOn={step.dueOn}
              />

              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeStepAction(trackId, step.id))}
                className="flex-none rounded-lg border border-line bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 rounded-xl border border-line bg-surface p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Add a course
          </p>
          {addable.length === 0 ? (
            <p className="text-sm text-muted">
              Every published course is already in this track. Only published courses can be added —
              a path built from drafts would reach nobody.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {addable.map((course) => (
                <li key={course.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setAdding(false);
                      run(() => addStepAction(trackId, course.id));
                    }}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] font-semibold text-navy-800 hover:border-navy-300 hover:bg-navy-50 disabled:opacity-60"
                  >
                    {course.title}
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
