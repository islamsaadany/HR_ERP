"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentResult } from "@/lib/finance/appointment-result";

/**
 * One appointment step for one business unit — "Releases payments" or "Confirms at the bank".
 *
 * A CLIENT component since 2026-09-08, and the reason is the CEO's: "the appointment happens and a
 * full refresh happens for the whole page — the appointment needs to be by cell not for the whole
 * page like that." The actions used to end in `redirect()`, so appointing one person threw away
 * every unit's markup, rebuilt it and dropped the reader at the top of the screen.
 *
 * Now each block owns its own dispatch and its own answer. `router.refresh()` re-renders the
 * server page in place — the list under the form is current, scroll position is kept, and the row
 * that changed is the only thing that visibly moves. The green banner at the top of the page is
 * gone with it: the confirmation belongs next to the control that earned it.
 *
 * Extracted rather than written twice because releasing and confirming are the same list, the same
 * form and the same rules — two copies would drift the first time one of them was improved.
 */

export type AppointmentRow = {
  id: string;
  userId: string;
  name: string;
  /** Pre-formatted on the server so the two sides cannot disagree about a date. */
  detail: string;
};

export type Candidate = { id: string; name: string; title: string | null };

type Action = (prev: AppointmentResult | null, formData: FormData) => Promise<AppointmentResult>;

export function Appointment({
  step,
  unitId,
  unitName,
  rows,
  candidates,
  appoint,
  remove,
  emptyNote,
}: {
  step: string;
  unitId: string;
  unitName: string;
  rows: AppointmentRow[];
  candidates: Candidate[];
  appoint: Action;
  remove: Action;
  emptyNote: string;
}) {
  const router = useRouter();
  const [result, dispatch, pending] = useActionState(appoint, null);
  // Cleared the moment the operator picks somebody else, so a stale "can now confirm" can never
  // sit above a form that has since been changed.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (result?.ok) router.refresh();
  }, [result, router]);

  const unappointed = candidates.filter((p) => !rows.some((r) => r.userId === p.id));
  const note = dismissed ? null : result;

  return (
    <div className="flex flex-wrap items-start gap-3 border-t border-line px-4 py-3">
      <span className="w-[9.5rem] shrink-0 pt-1 text-[10px] font-extrabold uppercase tracking-[0.07em] text-navy-600">
        {step}
      </span>

      <div className="min-w-[12rem] flex-1">
        {rows.length === 0 ? (
          <p className="text-[12.5px] font-semibold text-red-700">{emptyNote}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
              >
                <span className="text-sm">
                  <b className="font-semibold text-ink">{r.name}</b>
                  <span className="block text-[11.5px] text-muted">{r.detail}</span>
                </span>
                <RemoveButton userId={r.userId} unitId={unitId} remove={remove} />
              </li>
            ))}
          </ul>
        )}

        <form
          action={(fd) => {
            setDismissed(false);
            dispatch(fd);
          }}
          className="mt-2.5 flex flex-wrap items-end gap-2.5"
        >
          <input type="hidden" name="businessUnitId" value={unitId} />
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <span className="sr-only">{`${step} for ${unitName}`}</span>
            <select
              name="userId"
              required
              defaultValue=""
              aria-label={`${step} for ${unitName}`}
              onChange={() => setDismissed(true)}
              className="w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Appoint somebody…
              </option>
              {unappointed.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.title ? ` — ${p.title}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {pending ? "Appointing…" : "Appoint"}
          </button>
        </form>

        {note ? (
          <p
            role="status"
            className={
              "mt-2 text-[12px] font-semibold " + (note.ok ? "text-green-700" : "text-red-700")
            }
          >
            {note.ok ? "✓ " : ""}
            {note.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Its own dispatch, because a Remove belongs to one person and one unit. Sharing the block's
 * state would let removing somebody overwrite the sentence an appointment had just written.
 */
function RemoveButton({
  userId,
  unitId,
  remove,
}: {
  userId: string;
  unitId: string;
  remove: Action;
}) {
  const router = useRouter();
  const [result, dispatch, pending] = useActionState(remove, null);

  useEffect(() => {
    if (result?.ok) router.refresh();
  }, [result, router]);

  return (
    <form action={dispatch} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="businessUnitId" value={unitId} />
      {result && !result.ok ? (
        <span role="alert" className="text-[11.5px] font-semibold text-red-700">
          {result.message}
        </span>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:border-red-200 hover:text-red-700 disabled:opacity-60"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
    </form>
  );
}
