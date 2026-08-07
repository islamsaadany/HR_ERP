"use client";

import { useState, useTransition } from "react";
import {
  addDepartment,
  renameDepartment,
  removeDepartment,
  type DeptResult,
} from "@/app/(app)/admin/departments/actions";

export type DeptRow = { id: string; name: string; order: number; inUse: number };

const INPUT =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

export function DepartmentsManager({ departments }: { departments: DeptRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Add
  const [newName, setNewName] = useState("");
  // Rename — the row id being edited + its draft value.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function run(fn: () => Promise<DeptResult>, onOk?: (r: DeptResult) => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOk?.(r);
    });
  }

  function submitAdd() {
    const name = newName.trim();
    if (!name) {
      setError("Enter a department name.");
      return;
    }
    run(() => addDepartment(name), () => {
      setNewName("");
      setNotice(`Added “${name}”.`);
    });
  }

  function submitRename(id: string) {
    const name = draft.trim();
    run(
      () => renameDepartment(id, name),
      (r) => {
        setEditingId(null);
        const moved = r.ok ? r.moved ?? 0 : 0;
        setNotice(
          moved > 0
            ? `Renamed — updated ${moved} employee${moved === 1 ? "" : "s"}.`
            : "Renamed."
        );
      }
    );
  }

  function submitRemove(row: DeptRow) {
    if (!confirm(`Remove “${row.name}”? This can't be undone.`)) return;
    run(() => removeDepartment(row.id), () => setNotice(`Removed “${row.name}”.`));
  }

  return (
    <div className="mt-6">
      {error ? (
        <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p className="mb-3 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">{notice}</p>
      ) : null}

      {/* Add a department */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            New department
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitAdd();
              }
            }}
            placeholder="e.g. People & Culture"
            className={INPUT}
          />
        </div>
        <button
          type="button"
          onClick={submitAdd}
          disabled={pending}
          className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
        >
          Add
        </button>
      </div>

      {/* The list */}
      <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
        {departments.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No departments yet — add one above.</p>
        ) : (
          departments.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              {editingId === d.id ? (
                <>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitRename(d.id);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className={INPUT + " max-w-sm"}
                  />
                  <button
                    type="button"
                    onClick={() => submitRename(d.id)}
                    disabled={pending}
                    className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-xs text-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-ink">{d.name}</span>
                    <span className="ml-2 text-xs text-muted">
                      {d.inUse === 0
                        ? "no employees"
                        : `${d.inUse} employee${d.inUse === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(d.id);
                      setDraft(d.name);
                      setError(null);
                      setNotice(null);
                    }}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-300"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => submitRemove(d)}
                    disabled={pending || d.inUse > 0}
                    title={d.inUse > 0 ? "Move its employees before removing" : "Remove"}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-red-300 hover:text-red-600 disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-xs text-muted">
        Renaming a department updates everyone currently in it. A department can only be removed
        when no employee is assigned to it.
      </p>
    </div>
  );
}
