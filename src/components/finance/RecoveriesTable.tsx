"use client";

import { useState, useTransition } from "react";
import { formatEGP as egp } from "@/lib/labels";
import { recordRecovery, writeOffRecovery } from "@/app/(app)/finance/recovery-actions";

export type RecoveryRow = {
  id: string;
  employee: string;
  /** "1 Jun 2026 – 31 May 2027", pre-formatted server-side so dates can't drift by locale. */
  term: string;
  premium: number;
  coverEndedOn: string | null;
  expectedMonths: number;
  expectedAmount: number;
  status: "OPEN" | "RECOVERED" | "WRITTEN_OFF";
  recoveredAmount: number | null;
  recoveredOn: string | null;
  shortfall: number | null;
  reason: string | null;
  settledBy: string | null;
};

const CHIP: Record<RecoveryRow["status"], string> = {
  OPEN: "border-gold-300 bg-gold-50 text-gold-800",
  RECOVERED: "border-green-200 bg-green-50 text-green-700",
  WRITTEN_OFF: "border-line bg-paper text-muted",
};
const CHIP_LABEL: Record<RecoveryRow["status"], string> = {
  OPEN: "Open",
  RECOVERED: "Recovered",
  WRITTEN_OFF: "Written off",
};

/**
 * Finance's medical-premium recoveries (spec 030) — premium already paid for cover an employee
 * never used. A list that must reach zero, not a report.
 *
 * Every expected figure carries its working ("6 of 12 months") because it is a claim against the
 * insurer, not an authority: Finance has to be able to check it against a credit note at a glance.
 */
export function RecoveriesTable({ rows }: { rows: RecoveryRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [writingOff, setWritingOff] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
        Nothing to recover — no one has left mid-policy.
      </div>
    );
  }

  function run(action: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>, fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await action(fd);
      if (res.ok) setWritingOff(null);
      else setError(res.error);
    });
  }

  const settled = rows.filter((r) => r.status !== "OPEN");
  const totalExpected = settled.reduce((n, r) => n + r.expectedAmount, 0);
  const totalRecovered = settled.reduce((n, r) => n + (r.recoveredAmount ?? 0), 0);
  const totalShortfall = settled.reduce((n, r) => n + (r.shortfall ?? 0), 0);
  const stillOpen = rows.filter((r) => r.status === "OPEN").reduce((n, r) => n + r.expectedAmount, 0);

  const input = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink";

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface">
      {error ? <p className="m-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="ff-data-scroll overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-3 font-medium">Employee</th>
              <th className="px-3 py-3 font-medium">Cover ended</th>
              <th className="px-3 py-3 text-right font-medium">Expected back</th>
              <th className="px-3 py-3 text-right font-medium">Recovered</th>
              <th className="px-3 py-3 text-right font-medium">Shortfall</th>
              <th className="px-3 py-3 font-medium">Settle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-3">
                  <div className="font-semibold text-ink">{r.employee}</div>
                  <div className="mt-0.5 text-xs text-muted">Policy {r.term} · premium {egp(r.premium)}</div>
                </td>
                <td className="px-3 py-3">
                  {r.coverEndedOn ?? "—"}
                  <div className="mt-1">
                    <span className={"rounded-full border px-2 py-0.5 text-[11px] font-bold " + CHIP[r.status]}>
                      {r.coverEndedOn == null && r.status === "OPEN" ? "Needs leave date" : CHIP_LABEL[r.status]}
                    </span>
                  </div>
                  {r.settledBy ? <div className="mt-1 text-xs text-muted">{r.recoveredOn ?? ""} · by {r.settledBy}</div> : null}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.coverEndedOn == null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <b className="text-ink">{egp(r.expectedAmount)}</b>
                  )}
                  <div className="text-[11px] text-muted">
                    {r.coverEndedOn == null ? "can’t be worked out yet" : `${r.expectedMonths} of 12 months`}
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-ink">
                  {r.recoveredAmount == null ? <span className="text-muted">—</span> : egp(r.recoveredAmount)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.shortfall == null ? (
                    <span className="text-muted">—</span>
                  ) : r.shortfall > 0 ? (
                    <span className="font-semibold text-red-600">{egp(r.shortfall)}</span>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {r.status !== "OPEN" ? (
                    <span className="text-xs text-muted">{r.reason ? `“${r.reason}”` : "Settled in full."}</span>
                  ) : r.coverEndedOn == null ? (
                    <span className="text-xs text-muted">Ask HR to record their last day.</span>
                  ) : writingOff === r.id ? (
                    <form action={(fd) => { fd.set("id", r.id); run(writeOffRecovery, fd); }} className="flex flex-wrap items-end gap-2">
                      <div>
                        <label htmlFor={`reason-${r.id}`} className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Reason</label>
                        <input id={`reason-${r.id}`} name="reason" required placeholder="e.g. below the insurer’s minimum" className={input + " w-56"} />
                      </div>
                      <button disabled={pending} className="rounded-lg bg-navy-800 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60">Write off</button>
                      <button type="button" onClick={() => setWritingOff(null)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-navy-700">Cancel</button>
                    </form>
                  ) : (
                    <form action={(fd) => { fd.set("id", r.id); run(recordRecovery, fd); }} className="flex flex-wrap items-end gap-2">
                      <div>
                        <label htmlFor={`amt-${r.id}`} className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Recovered</label>
                        <input id={`amt-${r.id}`} name="recoveredAmount" inputMode="numeric" required placeholder="0" className={input + " w-28 text-right tabular-nums"} />
                      </div>
                      <div>
                        <label htmlFor={`on-${r.id}`} className="mb-1 block text-[10px] uppercase tracking-wide text-muted">On</label>
                        <input id={`on-${r.id}`} name="recoveredOn" type="date" required className={input} />
                      </div>
                      <button disabled={pending} className="rounded-lg bg-navy-800 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-navy-700 disabled:opacity-60">Record</button>
                      <button type="button" onClick={() => setWritingOff(r.id)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-navy-700 hover:bg-navy-50">Write off…</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-6 border-t border-line bg-paper px-4 py-3">
        <div>
          <span className="block text-[10px] uppercase tracking-wide text-muted">Expected (settled)</span>
          <b className="font-serif text-lg tabular-nums text-navy-800">{egp(totalExpected)}</b>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide text-muted">Recovered</span>
          <b className="font-serif text-lg tabular-nums text-navy-800">{egp(totalRecovered)}</b>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide text-muted">Shortfall</span>
          <b className={"font-serif text-lg tabular-nums " + (totalShortfall > 0 ? "text-red-600" : "text-navy-800")}>{egp(totalShortfall)}</b>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide text-muted">Still open</span>
          <b className="font-serif text-lg tabular-nums text-navy-800">{egp(stillOpen)}</b>
        </div>
      </div>
    </div>
  );
}
