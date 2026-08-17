"use client";

import { useActionState, useMemo, useState } from "react";
import {
  submitProfileChangeRequest,
  type RequestState,
} from "@/app/(app)/profile/request-actions";
import type { FieldDescriptor } from "@/lib/profile/change-requests";
import { serialiseDependants, type DependantValue } from "@/lib/profile/requestable";

/** A dependant row while it is being edited — `isNew` drives the gold highlight only. */
type DepRow = { name: string; dateOfBirth: string; kind: "CHILD" | "SPOUSE"; isNew: boolean };

function rowsFromCurrent(current: string): DepRow[] {
  try {
    const data = JSON.parse(current);
    if (!Array.isArray(data)) return [];
    return data.map((d) => ({
      name: typeof d?.name === "string" ? d.name : "",
      dateOfBirth: typeof d?.dateOfBirth === "string" ? d.dateOfBirth : "",
      kind: d?.kind === "SPOUSE" ? "SPOUSE" : "CHILD",
      isNew: false,
    }));
  } catch {
    return [];
  }
}

function serialiseRows(rows: DepRow[]): string {
  return serialiseDependants(
    rows.map<DependantValue>((r) => ({
      name: r.name.trim() === "" ? null : r.name.trim(),
      dateOfBirth: r.dateOfBirth,
      kind: r.kind,
    }))
  );
}

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
  // The dependants editor's working rows (only present when the card carries that field).
  const depDescriptor = descriptors.find((d) => d.input === "dependants");
  const [depRows, setDepRows] = useState<DepRow[]>(() =>
    depDescriptor ? rowsFromCurrent(depDescriptor.current) : []
  );
  const updateDepRows = (rows: DepRow[]) => {
    setDepRows(rows);
    if (depDescriptor) {
      setValues((v) => ({ ...v, [depDescriptor.key]: serialiseRows(rows) }));
    }
  };

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
  // No width here — dependant rows size each control themselves (a second max-w on the same
  // element would fight the one in `input`, and which wins depends on CSS order, not class order).
  const depInput =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

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
            if (d.input === "dependants") {
              return (
                <div key={d.key} className="mt-3">
                  <span className="mb-1 block text-xs uppercase tracking-wide text-muted">
                    {d.label}
                  </span>
                  <input type="hidden" name={d.key} value={values[d.key] ?? ""} />
                  <div className="grid gap-2">
                    {depRows.length === 0 ? (
                      <p className="text-sm text-muted">None listed.</p>
                    ) : (
                      depRows.map((row, i) => (
                        <div
                          key={i}
                          className={`flex flex-wrap items-center gap-2 ${
                            row.isNew
                              ? "rounded-lg border border-dashed border-gold-500 bg-gold-100 p-1.5"
                              : ""
                          }`}
                        >
                          <input
                            value={row.name}
                            onChange={(e) =>
                              updateDepRows(depRows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
                            }
                            placeholder="Name"
                            aria-label="Dependant name"
                            className={`${depInput} min-w-[140px] flex-1`}
                          />
                          <select
                            value={row.kind}
                            onChange={(e) =>
                              updateDepRows(
                                depRows.map((r, j) =>
                                  j === i ? { ...r, kind: e.target.value as DepRow["kind"] } : r
                                )
                              )
                            }
                            aria-label="Dependant kind"
                            className={`${depInput} w-28 shrink-0`}
                          >
                            <option value="CHILD">Child</option>
                            <option value="SPOUSE">Spouse</option>
                          </select>
                          <input
                            type="date"
                            value={row.dateOfBirth}
                            onChange={(e) =>
                              updateDepRows(
                                depRows.map((r, j) => (j === i ? { ...r, dateOfBirth: e.target.value } : r))
                              )
                            }
                            aria-label="Dependant date of birth"
                            className={`${depInput} w-40 shrink-0`}
                          />
                          <button
                            type="button"
                            onClick={() => updateDepRows(depRows.filter((_, j) => j !== i))}
                            className="shrink-0 rounded-lg border border-line px-2.5 py-2 text-xs text-muted hover:border-red-300 hover:text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateDepRows([...depRows, { name: "", dateOfBirth: "", kind: "CHILD", isNew: true }])
                    }
                    className="mt-2 rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                  >
                    + Add dependant
                  </button>
                  <p className="mt-1.5 text-xs text-muted">
                    A dependant needs a date of birth. Changes to this list go to HR as one proposal.
                  </p>
                </div>
              );
            }
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
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
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
