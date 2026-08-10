"use client";

import { useActionState, useState } from "react";
import { resetBenefits, type ResetBenefitsState } from "@/app/(app)/admin/employees/reset-benefits-actions";

const egp = (n: number) => "EGP " + Math.round(n).toLocaleString();

/**
 * Danger-zone card (employee edit page): clears an employee's benefits data so HR can
 * re-test from a clean slate. Shows what will be removed, gates the action behind a
 * type-the-name confirmation, and offers two modes — "Reset" (keep uploaded proof files)
 * and "Full erase" (also delete the files from Blob storage). The server re-checks both
 * the admin role and the confirmation name.
 */
export function ResetBenefitsCard({
  userId,
  name,
  claims,
  claimsTotal,
  medical,
  proofFiles,
}: {
  userId: string;
  name: string;
  claims: number;
  claimsTotal: number;
  medical: number;
  proofFiles: number;
}) {
  const action = resetBenefits.bind(null, userId);
  const [state, formAction, pending] = useActionState<ResetBenefitsState, FormData>(action, null);
  const [typed, setTyped] = useState("");

  const nothingToClear = claims === 0 && medical === 0;
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const canRun = matches && !pending && !nothingToClear;

  const summaryRow = "flex items-center justify-between gap-3 py-1.5 text-sm";

  return (
    <div className="rounded-xl border border-red-200 bg-gradient-to-b from-red-50 to-surface p-5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
        Danger zone
      </span>
      <h2 className="mt-2 font-serif text-lg text-ink">Reset benefits data</h2>
      <p className="mt-1 text-sm text-muted">
        Removes <span className="font-medium text-ink">{name}</span>&rsquo;s benefit claims and medical
        commitment across <span className="font-medium text-ink">all plan years</span>, so you can re-test
        from a clean slate. This does <span className="font-medium">not</span> touch their profile, role,
        password, or documents.
      </p>

      <div className="mt-4 rounded-lg border border-red-100 bg-surface px-4 py-2">
        <div className={summaryRow}>
          <span className="text-muted">Benefit claims (all statuses, all years)</span>
          <span className="font-semibold tabular-nums text-ink">
            {claims === 0 ? "None" : `${claims} · ${egp(claimsTotal)}`}
          </span>
        </div>
        <div className={summaryRow + " border-t border-dashed border-line"}>
          <span className="text-muted">Medical commitment</span>
          <span className="font-semibold tabular-nums text-ink">{medical === 0 ? "None" : `${medical} committed`}</span>
        </div>
        <div className={summaryRow + " border-t border-dashed border-line"}>
          <span className="text-muted">Uploaded proof files</span>
          <span className="font-semibold tabular-nums text-ink">{proofFiles === 0 ? "None" : `${proofFiles} files`}</span>
        </div>
      </div>

      {nothingToClear ? (
        <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
          Nothing to clear — this employee has no benefits data.
        </p>
      ) : (
        <form action={formAction} className="mt-4">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">
            Type <span className="font-semibold text-ink">{name}</span> to confirm
          </label>
          <input
            name="confirmName"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            placeholder={name}
            className="w-full max-w-[340px] rounded-lg border border-red-200 bg-surface px-3 py-2 text-sm text-ink focus:border-red-500 focus:outline-none"
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="submit"
              name="mode"
              value="reset"
              disabled={!canRun}
              className="rounded-lg border border-red-300 bg-surface px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Working…" : "Reset — keep uploaded files"}
            </button>
            <button
              type="submit"
              name="mode"
              value="erase"
              disabled={!canRun}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Working…" : "Full erase — also delete files"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            <span className="font-medium text-ink">Reset</span> deletes the claim &amp; medical records but
            leaves the {proofFiles} proof file{proofFiles === 1 ? "" : "s"} in storage.{" "}
            <span className="font-medium text-ink">Full erase</span> also deletes those files permanently.
            Both give the employee a clean slate. Buttons stay disabled until the name matches.
          </p>
        </form>
      )}

      {state && !state.ok ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      {state && state.ok ? (
        <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
          ✓ Reset done — removed {state.claims} claim{state.claims === 1 ? "" : "s"} and {state.medical} medical
          commitment{state.medical === 1 ? "" : "s"} for {name}
          {state.mode === "erase" ? `, and deleted ${state.filesDeleted} proof file${state.filesDeleted === 1 ? "" : "s"}` : ""}.
        </p>
      ) : null}
    </div>
  );
}
