"use client";

import { useActionState, useState, useEffect, useCallback, useTransition } from "react";
import {
  recordManualRelease,
  suggestAmount,
  type ManualResult,
  type SuggestResult,
  type Coverable,
} from "@/app/(app)/admin/benefits/manual-actions";

type Emp = { id: string; name: string };
type Benefit = { value: string; label: string; group: "Guaranteed" | "Medical" | "Flexible basket" };

const INP = "w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";
const LBL = "mb-1 block text-[11px] uppercase tracking-wide text-muted";
import { formatEGP as egp } from "@/lib/labels";

export function ManualReleaseForm({ employees, benefits }: { employees: Emp[]; benefits: Benefit[] }) {
  const [state, formAction, pending] = useActionState<ManualResult | null, FormData>(
    async (_prev, fd) => recordManualRelease(fd),
    null
  );
  const [userId, setUserId] = useState("");
  const [benefit, setBenefit] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [sug, setSug] = useState<SuggestResult | null>(null);
  const [checked, setChecked] = useState<string[]>([]); // covered dependant ids (medical)
  const [calculating, startCalc] = useTransition();

  const isMedical = benefit === "medical";
  const groups = ["Guaranteed", "Medical", "Flexible basket"] as const;

  // Ask the server for the auto-filled amount (+ medical picker data). coveredIds === null
  // means "reset to the default covered set"; an array means "re-price for exactly these".
  const runSuggest = useCallback(
    (coveredIds: string[] | null) => {
      if (!userId || !benefit) {
        setSug(null);
        setAmount("");
        return;
      }
      startCalc(async () => {
        const r = await suggestAmount({ userId, benefit, coveredIds, date: date || null });
        setSug(r);
        if (r.ok) {
          setAmount(String(r.amount));
          if (r.kind === "medical" && coveredIds === null) {
            setChecked(r.coverable.filter((c) => c.id && c.hasDob).map((c) => c.id as string));
          }
        } else {
          setAmount("");
        }
      });
    },
    [userId, benefit, date]
  );

  // Recompute whenever the employee, benefit, or date changes (resets the covered set).
  useEffect(() => {
    runSuggest(null);
  }, [runSuggest]);

  function toggleDep(id: string) {
    const next = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
    setChecked(next);
    runSuggest(next); // re-price medical for the new covered set
  }

  const medicalCoverable: Coverable[] = sug?.ok && sug.kind === "medical" ? sug.coverable : [];
  const flat = sug?.ok && sug.kind === "flat" ? sug : null;

  return (
    <form action={formAction} className="mt-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px] flex-1">
          <label htmlFor={"manualrelease-userId"} className={LBL}>Employee</label>
          <select id={"manualrelease-userId"} name="userId" required className={INP} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="" disabled>Choose…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label htmlFor={"manualrelease-benefit"} className={LBL}>Benefit</label>
          <select id={"manualrelease-benefit"} name="benefit" required className={INP} value={benefit} onChange={(e) => setBenefit(e.target.value)}>
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
        <div className="w-40">
          <label htmlFor={"manualrelease-approvalDate"} className={LBL}>Approval date</label>
          <input id={"manualrelease-approvalDate"} name="approvalDate" type="date" required className={INP} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {/* Medical: who's covered? — re-prices the amount as it changes. */}
      {isMedical && medicalCoverable.length > 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-navy-200 bg-navy-50/40 px-4 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gold-600">
            Who is covered? {calculating ? <span className="ml-1 font-normal text-muted">· pricing…</span> : null}
          </p>
          <input type="hidden" name="coveredIds" value={checked.join(",")} />
          {medicalCoverable.map((c) => {
            const isEmployee = c.id === null;
            const on = isEmployee || checked.includes(c.id as string);
            return (
              <label key={c.id ?? "self"} className={"flex items-center gap-2 py-1 text-sm " + (c.hasDob ? "" : "opacity-60")}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={isEmployee || !c.hasDob}
                  onChange={() => c.id && toggleDep(c.id)}
                />
                <span>{c.label}</span>
                <span className="ml-auto text-xs tabular-nums text-muted">
                  {c.hasDob ? `age ${c.age} · ${egp(c.premiumEGP)}` : "no DOB — can't cover"}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <label htmlFor="manualrelease-amount" className={LBL}>
            Amount (covered)
            {sug?.ok ? (
              <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-green-700">
                Calculated
              </span>
            ) : null}
          </label>
          <input
            id="manualrelease-amount"
            name="amount"
            inputMode="numeric"
            required
            placeholder="e.g. 8000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={INP + " text-right font-semibold tabular-nums"}
          />
        </div>
        <button
          type="submit"
          disabled={pending || calculating}
          className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Recording…" : "Record"}
        </button>
      </div>

      {/* Suggest feedback */}
      {sug && !sug.ok ? (
        <p className="mt-2 text-xs text-amber-700">{sug.error}</p>
      ) : flat ? (
        <p className="mt-2 text-xs text-muted">
          Auto-filled from the allocation — <strong className="text-ink">{egp(flat.remaining)}</strong> left of {egp(flat.allocation)}. Adjust if the actual figure differed.
        </p>
      ) : isMedical && sug?.ok && sug.kind === "medical" ? (
        <p className="mt-2 text-xs text-muted">
          Priced from the covered people&apos;s age bands, prorated &amp; capped like a live commit. {sug.note} Adjust the amount only if the recorded premium differed.
        </p>
      ) : null}

      {state && !state.ok ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state && state.ok ? (
        <p className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          ✓ {state.message ?? "Recorded as released."}
        </p>
      ) : null}

      <p className="mt-2 text-xs text-muted">
        {isMedical
          ? "For a medical commitment that already happened — saved as a locked medical commitment (HR-editable), back-dated to the approval date."
          : "For claims already approved & paid outside the app. Saved as released (not pending) and counted against the benefit's allocation."}
      </p>
    </form>
  );
}
