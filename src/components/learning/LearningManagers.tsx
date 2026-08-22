"use client";

import { useState, useTransition } from "react";
import {
  appointLearningManager,
  removeLearningManager,
} from "@/app/(app)/admin/learning/settings-actions";
import { formatDate } from "@/lib/labels";
import { BTN_NAVY, CHIP, INPUT, LABEL } from "@/components/learning/ui";

export type ManagerRow = {
  userId: string;
  name: string;
  department: string | null;
  appointedByName: string | null;
  createdAt: Date;
};

export type AlwaysRow = { userId: string; name: string; role: string };

export type PickerOption = { id: string; name: string; department: string | null };

/**
 * Who runs Learning (spec 038 follow-up, 2026-08-22).
 *
 * HR Admins and Super Users are listed but NOT removable — they hold Learning because they hold
 * everything, and a Remove button beside them would promise something the code will not do
 * (`canManageLearning` unions role and appointment, so deleting a row cannot take it away). A
 * control that lies is worse than no control.
 *
 * A learning manager sees this page READ-ONLY: `canEdit` is false for them, and the server refuses
 * regardless — `settings-actions.ts` is `requireAdmin()`, not `requireLearningManager()`.
 */
export function LearningManagers({
  managers,
  always,
  options,
  canEdit,
}: {
  managers: ManagerRow[];
  always: AlwaysRow[];
  options: PickerOption[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState("");

  const appointed = new Set(managers.map((m) => m.userId));
  const selectable = options.filter((o) => !appointed.has(o.id));

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-[13px] font-bold text-navy-800">Who manages Learning</h2>
      <p className="mb-3 mt-0.5 text-[11.5px] text-muted">
        These people can reach Admin → Learning. Nothing else in the admin opens for them.
      </p>

      {managers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-muted">
          Nobody appointed yet. Learning is run by HR Admins only.
        </p>
      ) : (
        <ul>
          {managers.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-2.5 border-b border-line py-2.5 text-[13px] last:border-b-0"
            >
              <Avatar name={m.name} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{m.name}</span>
                <span className="text-[11.5px] text-muted">
                  {m.department ? `${m.department} · ` : ""}
                  {m.appointedByName ? `appointed by ${m.appointedByName} · ` : ""}
                  {formatDate(m.createdAt)}
                </span>
              </span>
              <span className={CHIP.navy}>Learning manager</span>
              {canEdit ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await removeLearningManager(m.userId);
                      if (!result.ok) setError(result.error);
                    });
                  }}
                  className="text-[11px] font-semibold text-red-700 hover:underline disabled:opacity-60"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {always.length > 0 ? (
        <ul className="mt-1 border-t border-line pt-1">
          {always.map((a) => (
            <li
              key={a.userId}
              className="flex items-center gap-2.5 border-b border-line py-2.5 text-[13px] opacity-70 last:border-b-0"
            >
              <Avatar name={a.name} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{a.name}</span>
                <span className="text-[11.5px] text-muted">
                  {a.role} — holds Learning because they hold everything
                </span>
              </span>
              <span className={CHIP.muted}>always</span>
            </li>
          ))}
        </ul>
      ) : null}

      {canEdit ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3"
          action={() => {
            setError(null);
            startTransition(async () => {
              const result = await appointLearningManager(choice);
              if (!result.ok) setError(result.error);
              else setChoice("");
            });
          }}
        >
          <div className="min-w-[200px] flex-1">
            <label className={LABEL} htmlFor="appoint-who">
              Add someone
            </label>
            <select
              id="appoint-who"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className={INPUT}
            >
              <option value="">Choose an employee…</option>
              {selectable.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.department ? `${o.name} · ${o.department}` : o.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={pending || !choice} className={BTN_NAVY}>
            {pending ? "Appointing…" : "Appoint"}
          </button>
        </form>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-muted">
          Only HR can change this list.
        </p>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      className="grid h-7 w-7 flex-none place-items-center rounded-full border border-navy-200 bg-navy-50 text-[11px] font-extrabold text-navy-700"
    >
      {initials || "?"}
    </span>
  );
}
