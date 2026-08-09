"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  importEmployees,
  type ImportReport,
  type RowResult,
} from "@/app/(app)/admin/employees/import/actions";

const ACTION_STYLE: Record<RowResult["action"], string> = {
  created: "bg-navy-50 text-navy-700",
  updated: "bg-gold-100 text-gold-700",
  skipped: "bg-gray-100 text-muted",
  error: "bg-red-50 text-red-700",
};

export function EmployeeImportForm() {
  const [state, formAction, pending] = useActionState<
    ImportReport | null,
    FormData
  >(importEmployees, null);

  return (
    <div className="mt-8 space-y-6">
      <form
        action={formAction}
        encType="multipart/form-data"
        className="rounded-xl border border-line bg-surface p-6"
      >
        <label className="block text-xs font-medium uppercase tracking-wide text-muted mb-1">
          Employee CSV
        </label>
        <input
          type="file"
          name="file"
          accept=".csv,text/csv,text/tab-separated-values,.tsv,.txt"
          required
          className="block w-full text-sm text-ink file:mr-4 file:rounded-lg file:border-0 file:bg-navy-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-navy-700"
        />
        <p className="mt-2 text-xs text-muted">
          Existing people are matched by email and updated; new emails are added.
          Nothing here changes anyone&rsquo;s role.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="mt-4 rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Importing…" : "Upload & import"}
        </button>
      </form>

      {state && !state.ok ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state && state.ok ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <Stat label="Added" value={state.created} />
            <Stat label="Updated" value={state.updated} />
            <Stat label="Skipped" value={state.skipped} />
            <Stat label="Children" value={state.dependantsCreated} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Row</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">Notes to check</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr
                    key={r.rowNumber}
                    className="border-b border-line align-top last:border-b-0"
                  >
                    <td className="px-4 py-3 text-muted">{r.rowNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{r.name}</div>
                      <div className="text-xs text-muted">{r.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs capitalize ${ACTION_STYLE[r.action]}`}
                      >
                        {r.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.messages.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <ul className="list-disc space-y-1 pl-4 text-xs text-ink">
                          {r.messages.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Link
            href="/admin/employees"
            className="inline-block text-sm font-medium text-navy-600 hover:text-navy-800"
          >
            ← Back to employees
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-2">
      <div className="text-lg font-semibold text-ink">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
