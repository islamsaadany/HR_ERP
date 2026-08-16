"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/labels";
import {
  createPolicyYear,
  editPolicyYearWindow,
  setPolicyYearStatus,
} from "@/app/(app)/admin/benefits/config-actions";

type PolicyYear = {
  id: string;
  name: string;
  status: string;
  startDate: Date | string;
  endDate: Date | string;
  commitmentCount: number;
};

function toInputDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}
function label(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "—" : formatDate(date);
}

/**
 * "Medical policy" — the insurance contract's own term (spec 027), managed separately from the
 * benefits plan year because it runs on the insurer's schedule (1 Jun → 31 May) rather than the
 * calendar year. A term always straddles two benefits cycles, and each cycle's pool absorbs only
 * its months.
 *
 * Deliberately mirrors PlanYearDialog: HR already knows this shape, and the two are adjacent
 * concepts that should not look like unrelated features.
 */
export function PolicyYearDialog({ policyYears }: { policyYears: PolicyYear[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = policyYears.find((p) => p.status === "OPEN");
  const dateField = "w-full rounded-lg border border-line px-2 py-1.5 text-sm";

  /** Server actions here return a result rather than redirecting, so the popup can stay open. */
  function run(action: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>, fd: FormData, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await action(fd);
      if (res.ok) after?.();
      else setError(res.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
      >
        Medical policy{active ? ` · ${active.name}` : ""}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Medical policy term"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-lg text-ink">Medical policy term</h2>
                <p className="mt-1 max-w-prose text-sm text-muted">
                  The insurance contract&apos;s own dates — separate from the benefits plan year. A term
                  that runs past a cycle&apos;s end is charged across both: each cycle&apos;s pool absorbs only
                  the months falling inside it.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg px-2 py-1 text-muted hover:bg-paper hover:text-ink">✕</button>
            </div>

            {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-muted">
                    <th className="py-2 pr-4 font-medium">Term</th>
                    <th className="py-2 pr-4 font-medium">Runs</th>
                    <th className="py-2 pr-4 font-medium">Commitments</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {policyYears.length === 0 ? (
                    <tr><td colSpan={4} className="py-3 text-xs text-muted">No policy term yet — medical prices against the plan year until you set one.</td></tr>
                  ) : policyYears.map((p) => (
                    <tr key={p.id} className="border-b border-line align-top last:border-0">
                      <td className="py-2 pr-4 text-ink">
                        {p.name}
                        {p.status === "OPEN" ? <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">Open</span> : null}
                      </td>
                      <td className="py-2 pr-4 text-muted">
                        {editing === p.id ? (
                          <form
                            action={(fd) => { fd.set("id", p.id); run(editPolicyYearWindow, fd, () => setEditing(null)); }}
                            className="flex flex-wrap items-end gap-2"
                          >
                            <input type="date" name="startDate" defaultValue={toInputDate(p.startDate)} className={dateField} required />
                            <input type="date" name="endDate" defaultValue={toInputDate(p.endDate)} className={dateField} required />
                            <button disabled={pending} className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Save</button>
                            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy-700">Cancel</button>
                          </form>
                        ) : (
                          <>
                            {label(p.startDate)} – {label(p.endDate)}
                            <button type="button" onClick={() => setEditing(p.id)} className="ml-2 text-xs font-semibold text-navy-600 underline">Edit</button>
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-muted">{p.commitmentCount}</td>
                      <td className="py-2 text-right">
                        <form action={(fd) => { fd.set("id", p.id); fd.set("status", p.status === "OPEN" ? "CLOSED" : "OPEN"); run(setPolicyYearStatus, fd); }}>
                          <button disabled={pending} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60">
                            {p.status === "OPEN" ? "Close" : "Open"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form
              action={(fd) => run(createPolicyYear, fd)}
              className="mt-5 flex flex-wrap items-end gap-2 border-t border-line pt-4"
            >
              <div>
                <label htmlFor="py-name" className="mb-1 block text-[11px] uppercase tracking-wide text-muted">New term</label>
                <input id="py-name" name="name" placeholder="e.g. 2026–27 policy" required className="rounded-lg border border-line px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label htmlFor="py-start" className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Starts</label>
                <input id="py-start" type="date" name="startDate" required className={dateField} />
              </div>
              <div>
                <label htmlFor="py-end" className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Ends</label>
                <input id="py-end" type="date" name="endDate" required className={dateField} />
              </div>
              <button disabled={pending} className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
                {pending ? "Saving…" : "Add term"}
              </button>
            </form>
            <p className="mt-2 text-xs text-muted">
              Opening a term closes any other — terms don&apos;t overlap. Changing a term&apos;s dates does
              <strong> not</strong> re-split commitments already made under it; those are flagged in the
              commitments list instead.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
