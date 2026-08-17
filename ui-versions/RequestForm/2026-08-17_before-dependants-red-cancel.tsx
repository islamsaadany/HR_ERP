"use client";

import { useActionState, useMemo, useState } from "react";
import {
  submitProfileChangeRequest,
  type RequestState,
} from "@/app/(app)/profile/request-actions";
import type { FieldDescriptor } from "@/lib/profile/change-requests";

/**
 * The propose-a-correction form (spec 029, US1), scoped to whatever descriptors it is given —
 * a card passes only its own fields. The server action ignores fields absent from the form, so
 * scoping here never sends another card's data.
 *
 * Group headings render only when descriptors span more than one group; inside a single card
 * the card's own title already says where you are.
 */
export function RequestForm({
  descriptors,
  onClose,
}: {
  descriptors: FieldDescriptor[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<RequestState, FormData>(
    submitProfileChangeRequest,
    null
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(descriptors.map((d) => [d.key, d.current]))
  );

  const changedKeys = useMemo(
    () => descriptors.filter((d) => (values[d.key] ?? "").trim() !== d.current.trim()).map((d) => d.key),
    [descriptors, values]
  );

  const groups = useMemo(() => {
    const map = new Map<string, FieldDescriptor[]>();
    for (const d of descriptors) {
      const list = map.get(d.group) ?? [];
      list.push(d);
      map.set(d.group, list);
    }
    return [...map.entries()];
  }, [descriptors]);

  const input =
    "w-full max-w-[320px] rounded-lg border bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  // No success branch here on purpose: a recorded request re-renders the page with an open
  // request, so the host swaps this form for the pending state. "Awaiting HR" IS the receipt.

  return (
    <form action={formAction} className="mt-4 border-t border-line pt-4">
      <p className="text-sm text-muted">
        Edit what is wrong. Fields you do not touch are not sent. Nothing changes until HR approves.
      </p>
      {groups.map(([group, fields]) => (
        <div key={group} className="mt-4">
          {groups.length > 1 ? (
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-navy-700">{group}</div>
          ) : null}
          {fields.map((d) => {
            const changed = changedKeys.includes(d.key);
            const cls = `${input} ${changed ? "border-gold-300 bg-gold-50" : "border-line"}`;
            return (
              <div key={d.key} className="mt-3">
                <label htmlFor={`req-${d.key}`} className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  {d.label}
                </label>
                {d.input === "select" ? (
                  <select
                    id={`req-${d.key}`}
                    name={d.key}
                    value={values[d.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
                    className={cls}
                  >
                    {(d.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`req-${d.key}`}
                    name={d.key}
                    type={d.input === "date" ? "date" : d.input === "tel" ? "tel" : "text"}
                    value={values[d.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
                    className={cls}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="mt-4">
        <label htmlFor="req-reason" className="mb-1 block text-xs uppercase tracking-wide text-muted">
          Reason (optional)
        </label>
        <input
          id="req-reason"
          name="reason"
          placeholder="e.g. she changed her number"
          className={`${input} border-line`}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || changedKeys.length === 0}
          className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-40"
        >
          {pending
            ? "Sending…"
            : changedKeys.length === 0
              ? "Nothing changed yet"
              : `Send ${changedKeys.length} change${changedKeys.length === 1 ? "" : "s"} to HR`}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-navy-50"
        >
          Cancel
        </button>
      </div>

      {state?.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
    </form>
  );
}
