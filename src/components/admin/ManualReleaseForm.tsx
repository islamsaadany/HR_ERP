"use client";

import { useActionState } from "react";
import { recordManualRelease, type ManualResult } from "@/app/(app)/admin/benefits/manual-actions";

type Emp = { id: string; name: string };
type Benefit = { value: string; label: string; group: "Guaranteed" | "Flexible basket" };

const INP = "w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";
const LBL = "mb-1 block text-[11px] uppercase tracking-wide text-muted";

export function ManualReleaseForm({ employees, benefits }: { employees: Emp[]; benefits: Benefit[] }) {
  const [state, formAction, pending] = useActionState<ManualResult | null, FormData>(
    async (_prev, fd) => recordManualRelease(fd),
    null
  );

  const groups = ["Guaranteed", "Flexible basket"] as const;

  return (
    <form action={formAction} className="mt-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px] flex-1">
          <label className={LBL}>Employee</label>
          <select name="userId" required className={INP} defaultValue="">
            <option value="" disabled>Choose…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className={LBL}>Benefit</label>
          <select name="benefit" required className={INP} defaultValue="">
            <option value="" disabled>Choose…</option>
            {groups.map((g) => {
              const items = benefits.filter((b) => b.group === g);
              if (items.length === 0) return null;
              return (
                <optgroup key={g} label={g}>
                  {items.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div className="w-32">
          <label className={LBL}>Amount (covered)</label>
          <input name="amount" inputMode="numeric" required placeholder="e.g. 8000" className={INP + " text-right tabular-nums"} />
        </div>
        <div className="w-40">
          <label className={LBL}>Approval date</label>
          <input name="approvalDate" type="date" required className={INP} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Recording…" : "Record"}
        </button>
      </div>

      {state && !state.ok ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state && state.ok ? (
        <p className="mt-2 rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-700">Recorded as released.</p>
      ) : null}

      <p className="mt-2 text-xs text-muted">
        For claims already approved &amp; paid outside the app. Saved as released (not pending) and counted
        against the benefit&apos;s allocation. Enter the <strong>covered (company) amount</strong>. The server
        rejects future dates, missing allocations, and amounts over what&apos;s left to claim.
      </p>
    </form>
  );
}
