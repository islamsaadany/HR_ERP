"use client";

import { useState } from "react";
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

const INPUT =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

/**
 * The dependant list editor shared by the change-request form (spec 029) and the campaign
 * popup (spec 033): rows of name · kind · DOB with Remove, plus Add (new rows highlighted
 * gold). Emits the canonical serialisation on every edit; the host owns the hidden input.
 */
export function DependantsListEditor({
  initial,
  onChange,
}: {
  /** The current canonical serialisation to start from. */
  initial: string;
  onChange: (serialised: string) => void;
}) {
  const [rows, setRows] = useState<DepRow[]>(() => rowsFromCurrent(initial));
  const update = (next: DepRow[]) => {
    setRows(next);
    onChange(serialiseRows(next));
  };

  return (
    <div>
      <div className="grid gap-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">None listed.</p>
        ) : (
          rows.map((row, i) => (
            <div
              key={i}
              className={`flex flex-wrap items-center gap-2 ${
                row.isNew ? "rounded-lg border border-dashed border-gold-500 bg-gold-100 p-1.5" : ""
              }`}
            >
              <input
                value={row.name}
                onChange={(e) => update(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                placeholder="Name"
                aria-label="Dependant name"
                className={`${INPUT} min-w-[140px] flex-1`}
              />
              <select
                value={row.kind}
                onChange={(e) =>
                  update(rows.map((r, j) => (j === i ? { ...r, kind: e.target.value as DepRow["kind"] } : r)))
                }
                aria-label="Dependant kind"
                className={`${INPUT} w-28 shrink-0`}
              >
                <option value="CHILD">Child</option>
                <option value="SPOUSE">Spouse</option>
              </select>
              <input
                type="date"
                value={row.dateOfBirth}
                onChange={(e) =>
                  update(rows.map((r, j) => (j === i ? { ...r, dateOfBirth: e.target.value } : r)))
                }
                aria-label="Dependant date of birth"
                className={`${INPUT} w-40 shrink-0`}
              />
              <button
                type="button"
                onClick={() => update(rows.filter((_, j) => j !== i))}
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
        onClick={() => update([...rows, { name: "", dateOfBirth: "", kind: "CHILD", isNew: true }])}
        className="mt-2 rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
      >
        + Add dependant
      </button>
      <p className="mt-1.5 text-xs text-muted">A dependant needs a date of birth.</p>
    </div>
  );
}
