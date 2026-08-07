"use client";

import { useActionState } from "react";
import { generateTeamPasswords, type GenPasswordsState } from "@/app/(app)/admin/employees/password-actions";

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function TempPasswordsPanel({ canResetAll }: { canResetAll: boolean }) {
  const [state, action, pending] = useActionState<GenPasswordsState, FormData>(
    generateTeamPasswords,
    null
  );
  const done = state && state.ok ? state : null;

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

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-5">
      <p className="font-medium text-ink">Temporary sign-in passwords</p>
      <p className="mt-1 text-sm text-muted">
        Generate temporary passwords for active employees and download a one-time CSV
        (name · email · password) to hand out. Each person is asked to set their own password on first
        sign-in. Passwords are stored hashed — <strong>this file can&apos;t be downloaded again</strong>, so
        keep it safe and don&apos;t commit or forward it carelessly.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="mode" value="missing" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
          >
            {pending ? "Generating…" : "Generate for employees without a password"}
          </button>
        </form>
        {canResetAll ? (
          <form action={action}>
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
              className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Reset ALL passwords
            </button>
          </form>
        ) : null}
      </div>

      {state && !state.ok ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      {done ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">
              {done.rows.length} temporary password{done.rows.length === 1 ? "" : "s"} generated
              {done.mode === "missing" ? " (employees without one)" : " (all employees)"}.
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
            Copy or download these now — for security they can&apos;t be shown again.
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
    </section>
  );
}
