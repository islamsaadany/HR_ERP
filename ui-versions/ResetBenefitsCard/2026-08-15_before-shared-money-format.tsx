"use client";

import { useActionState, useState } from "react";
import { resetBenefits, type ResetBenefitsState } from "@/app/(app)/admin/employees/reset-benefits-actions";

const egp = (n: number) => "EGP " + Math.round(n).toLocaleString();

export type BenefitLine = {
  target: string; // "medical" | "guaranteed:<id>" | "catalog:<id>"
  label: string;
  type: "Medical" | "Guaranteed" | "Flexible";
  count: number;
  total: number;
};

/**
 * Danger-zone card (employee edit page): clears an employee's benefits data so HR can
 * re-test from a clean slate. Shows a per-benefit breakdown, each line with its own
 * one-click Delete; "Reset all" wipes everything and is gated behind the typed name.
 * The server re-checks admin role (and the name on Reset all).
 */
export function ResetBenefitsCard({
  userId,
  name,
  lines,
}: {
  userId: string;
  name: string;
  lines: BenefitLine[];
}) {
  const action = resetBenefits.bind(null, userId);
  const [state, formAction, pending] = useActionState<ResetBenefitsState, FormData>(action, null);
  const [typed, setTyped] = useState("");

  const nothingToClear = lines.length === 0;
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  const chip = (t: BenefitLine["type"]) =>
    t === "Medical"
      ? "bg-green-50 text-green-700"
      : t === "Guaranteed"
        ? "bg-gold-100 text-gold-700"
        : "bg-navy-50 text-navy-700";

  return (
    <div className="rounded-xl border border-red-200 bg-gradient-to-b from-red-50 to-surface p-5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
        Danger zone
      </span>
      <h2 className="mt-2 font-serif text-lg text-ink">Reset benefits data</h2>
      <p className="mt-1 text-sm text-muted">
        Removes the selected benefit records for <span className="font-medium text-ink">{name}</span> across{" "}
        <span className="font-medium text-ink">all plan years</span>, so you can re-test from a clean slate. Does{" "}
        <span className="font-medium">not</span> touch their profile, role, password, or documents.
      </p>

      {nothingToClear ? (
        <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
          Nothing to clear — this employee has no benefits data.
        </p>
      ) : (
        <form action={formAction} className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-red-100 bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Benefit</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Records</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.target} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2 font-medium text-ink">{l.label}</td>
                    <td className="px-4 py-2">
                      <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + chip(l.type)}>{l.type}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">{l.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">{l.total > 0 ? egp(l.total) : "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="submit"
                        name="target"
                        value={l.target}
                        disabled={pending}
                        className="rounded-lg border border-red-200 bg-surface px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {pending ? "…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-dashed border-red-200 pt-4">
            <div className="max-w-md text-xs text-muted">
              <span className="font-medium text-ink">Delete</span> a line to remove that benefit&rsquo;s records for the
              employee (all statuses, all years). To wipe everything at once, type the name and use{" "}
              <span className="font-medium text-ink">Reset all</span>.
              <div className="mt-2">
                <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">
                  Type <span className="font-semibold text-ink">{name}</span> to enable Reset all
                </label>
                <input
                  name="confirmName"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  placeholder={name}
                  className="w-full max-w-[300px] rounded-lg border border-red-200 bg-surface px-3 py-2 text-sm text-ink focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              name="target"
              value="all"
              disabled={!matches || pending}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Working…" : "Reset all"}
            </button>
          </div>
        </form>
      )}

      {state && !state.ok ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      {state && state.ok ? (
        <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
          ✓ Reset done — removed {state.label} for {name}
          {state.claims > 0 ? ` (${state.claims} claim${state.claims === 1 ? "" : "s"})` : ""}
          {state.medical > 0 ? `${state.claims > 0 ? " and" : " ("}${state.medical} medical commitment${state.medical === 1 ? "" : "s"})` : ""}
          .
        </p>
      ) : null}
    </div>
  );
}
