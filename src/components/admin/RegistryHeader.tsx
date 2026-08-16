"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BackLink } from "@/components/admin/BackLink";
import {
  generateTeamPasswords,
  type GenPasswordsState,
} from "@/app/(app)/admin/employees/password-actions";
import {
  ResetSelectedPasswordsModal,
  type PickerEmployee,
} from "@/components/admin/ResetSelectedPasswordsModal";

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Registry page header: title + a compact action bar.
 * The two CSV actions live under one "CSV ▾" dropdown and the three password
 * actions under one smaller "Passwords ▾" dropdown, both where Export/Import
 * used to sit, next to "+ New employee". The one-time password result (list +
 * download + warning) appears on demand, below the header, after generating —
 * shared by all three password actions, including the selected-employees picker.
 */
export function RegistryHeader({
  employeeCount,
  canResetAll,
  resettableEmployees,
  backHref,
  backLabel,
}: {
  employeeCount: number;
  canResetAll: boolean;
  /** Active employees the picker may reset (the acting admin is already excluded). */
  resettableEmployees: PickerEmployee[];
  backHref: string;
  backLabel: string;
}) {
  const [state, action, pending] = useActionState<GenPasswordsState, FormData>(
    generateTeamPasswords,
    null
  );
  const [openMenu, setOpenMenu] = useState<null | "csv" | "pw">(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const done = state && state.ok ? state : null;

  /**
   * Submit, THEN close the menu/picker.
   *
   * Closing in the button's `onClick` looks equivalent but silently breaks the
   * action: React flushes click updates synchronously, so the <form> is removed
   * from the DOM before the browser dispatches `submit` — the browser cancels it
   * ("Form submission canceled because the form is not connected") and the server
   * action never runs. Dispatching here first means the unmount is harmless.
   */
  function runAndClose(formData: FormData) {
    action(formData);
    setOpenMenu(null);
    setPickerOpen(false);
  }

  function downloadCsv() {
    if (!done) return;
    const header = ["Name", "Email", "Temporary Password"];
    const body = done.rows.map((r) => [r.name, r.email, r.temp].map(csvCell).join(","));
    const csv = [header.join(","), ...body].join("\r\n") + "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "temporary-passwords.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const menuBtn =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50";

  return (
    <div>
      <BackLink href={backHref} label={backLabel} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
            Admin · Registry
          </p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Employees</h1>
          <p className="mt-1 text-muted">{employeeCount} records</p>
        </div>

        <div className="flex items-center gap-2">
          {/* CSV dropdown — Export / Import */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === "csv" ? null : "csv"))}
              className={menuBtn}
            >
              CSV ▾
            </button>
            {openMenu === "csv" ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
                  <a
                    href="/api/admin/employees/export"
                    onClick={() => setOpenMenu(null)}
                    className="block rounded-md px-3 py-2 hover:bg-navy-50"
                  >
                    <span className="block text-sm font-medium text-ink">Export CSV</span>
                    <span className="block text-xs text-muted">Download every employee in the import format.</span>
                  </a>
                  <Link
                    href="/admin/employees/import"
                    onClick={() => setOpenMenu(null)}
                    className="block rounded-md px-3 py-2 hover:bg-navy-50"
                  >
                    <span className="block text-sm font-medium text-ink">Import CSV</span>
                    <span className="block text-xs text-muted">Upload the sheet to add / update by email.</span>
                  </Link>
                </div>
              </>
            ) : null}
          </div>

          {/* Passwords dropdown — Generate / Reset ALL */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === "pw" ? null : "pw"))}
              className={menuBtn}
            >
              Passwords ▾
            </button>
            {openMenu === "pw" ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
                  <form action={runAndClose}>
                    <input type="hidden" name="mode" value="missing" />
                    <button
                      type="submit"
                      disabled={pending}
                      className="block w-full rounded-md px-3 py-2 text-left hover:bg-navy-50 disabled:opacity-60"
                    >
                      <span className="block text-sm font-medium text-ink">
                        Generate for employees without a password
                      </span>
                      <span className="block text-xs text-muted">One-time CSV for people who don’t have one yet.</span>
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      setPickerOpen(true);
                    }}
                    className="block w-full rounded-md px-3 py-2 text-left hover:bg-navy-50"
                  >
                    <span className="block text-sm font-medium text-ink">
                      Reset selected employees…
                    </span>
                    <span className="block text-xs text-muted">
                      Pick the people to reset, then download their new passwords.
                    </span>
                  </button>
                  {canResetAll ? (
                    <>
                      <div className="my-1 h-px bg-line" />
                      <form action={runAndClose}>
                        <input type="hidden" name="mode" value="all" />
                        <button
                          type="submit"
                          disabled={pending}
                          onClick={(e) => {
                            if (
                              !confirm(
                                "Reset ALL passwords? Everyone — including people who already set their own — will get a new temporary password and must change it on next sign-in."
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                          className="block w-full rounded-md px-3 py-2 text-left hover:bg-red-50 disabled:opacity-60"
                        >
                          <span className="block text-sm font-medium text-red-600">Reset ALL passwords</span>
                          <span className="block text-xs text-muted">
                            Everyone gets a new temporary password. Super User only.
                          </span>
                        </button>
                      </form>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <Link
            href="/admin/employees/new"
            className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700"
          >
            + New employee
          </Link>
        </div>
      </div>

      <ResetSelectedPasswordsModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        employees={resettableEmployees}
        formAction={runAndClose}
        pending={pending}
      />

      {/* On-demand results / errors from the password actions */}
      {pending ? (
        <p className="mt-3 rounded-lg bg-navy-50 px-4 py-2 text-sm text-navy-700">Generating…</p>
      ) : null}

      {state && !state.ok ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      {done ? (
        <div className="mt-4 rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">
              {done.rows.length} temporary password{done.rows.length === 1 ? "" : "s"} generated
              {done.mode === "missing"
                ? " (employees without one)"
                : done.mode === "selected"
                  ? " (selected employees)"
                  : " (all employees)"}
              .
            </p>
            <button
              type="button"
              onClick={downloadCsv}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
            >
              ⬇ Download CSV
            </button>
          </div>
          <p className="mt-1 text-xs text-gold-700">
            Copy or download these now — for security they can’t be shown again. Passwords are stored hashed and
            <strong> this file can’t be downloaded again</strong>.
          </p>
          <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Temporary password</th>
                </tr>
              </thead>
              <tbody>
                {done.rows.map((r) => (
                  <tr key={r.email} className="border-t border-line">
                    <td className="px-3 py-1.5 text-ink">{r.name}</td>
                    <td className="px-3 py-1.5 text-muted">{r.email}</td>
                    <td className="px-3 py-1.5 font-mono text-navy-800">{r.temp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
