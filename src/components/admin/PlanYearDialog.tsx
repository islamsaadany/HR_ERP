"use client";

import { useState } from "react";
import { formatDate } from "@/lib/labels";
import { createPlanYear, setPlanYearStatus, editPlanYearWindow } from "@/app/(app)/admin/benefits/actions";

type PlanYear = {
  id: string;
  name: string;
  status: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
};

/** yyyy-mm-dd value for a <input type="date">, or "" when unset. */
function toInputDate(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Short human date for display, or a placeholder when unset. Uses the shared app-wide
 *  formatter so this dialog can't drift from every other date in the product. */
function label(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "—" : formatDate(date);
}

/**
 * Top-right "Plan year" button that opens a popup for full plan-year management:
 * the list of years with open/close toggles and their proration window (spec 019),
 * plus a create-new-year form. Each year's dates can be edited inline. Forms are
 * server actions (revalidate, no redirect), so the popup stays open and refreshes.
 */
export function PlanYearDialog({ planYears, activeName }: { planYears: PlanYear[]; activeName?: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const dateField = "w-full rounded-lg border border-line px-2 py-1.5 text-sm";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
      >
        Plan year: <span className="text-ink">{activeName ?? "none"}</span>
        <span className="ml-1.5 text-muted" aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Plan-year management"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg text-ink">Plan years</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg px-2 py-1 text-muted hover:bg-paper hover:text-ink"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-muted">
              Only one year is open at a time. Set a start &amp; end date to prorate mid-year starters; leave
              them blank to run the year with proration off.
            </p>

            <ul className="mt-4 divide-y divide-line">
              {planYears.length === 0 ? (
                <li className="py-2 text-sm text-muted">No plan years yet.</li>
              ) : null}
              {planYears.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-ink">{p.name}</span>
                      <span
                        className={
                          "ml-2 rounded-full px-2 py-0.5 text-xs font-semibold " +
                          (p.status === "OPEN" ? "bg-navy-50 text-navy-700" : "bg-gray-100 text-muted")
                        }
                      >
                        {p.status}
                      </span>
                      <div className="mt-0.5 text-xs text-muted">
                        {p.startDate && p.endDate ? `${label(p.startDate)} → ${label(p.endDate)}` : "No window — proration off"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(editing === p.id ? null : p.id)}
                        className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
                      >
                        {editing === p.id ? "Cancel" : "Edit dates"}
                      </button>
                      <form action={setPlanYearStatus}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="status" value={p.status === "OPEN" ? "CLOSED" : "OPEN"} />
                        <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50">
                          {p.status === "OPEN" ? "Close" : "Open"}
                        </button>
                      </form>
                    </div>
                  </div>

                  {editing === p.id ? (
                    <form action={editPlanYearWindow} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-navy-50 p-3">
                      <input type="hidden" name="id" value={p.id} />
                      <div className="flex-1">
                        <label htmlFor={"planyear-startDate"} className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Start date</label>
                        <input id={"planyear-startDate"} type="date" name="startDate" defaultValue={toInputDate(p.startDate)} className={dateField} />
                      </div>
                      <div className="flex-1">
                        <label htmlFor={"planyear-endDate"} className="mb-1 block text-[11px] uppercase tracking-wide text-muted">End date</label>
                        <input id={"planyear-endDate"} type="date" name="endDate" defaultValue={toInputDate(p.endDate)} className={dateField} />
                      </div>
                      <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                        Save
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>

            <form action={createPlanYear} className="mt-4 border-t border-line pt-4">
              <label htmlFor={"planyear-name"} className="mb-1 block text-xs uppercase tracking-wide text-muted">New plan year</label>
              <input id={"planyear-name"}
                name="name"
                placeholder="e.g. 2027"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              />
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="flex-1">
                  <label htmlFor={"planyear-startDate"} className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Start date</label>
                  <input id={"planyear-startDate"} type="date" name="startDate" className={dateField} />
                </div>
                <div className="flex-1">
                  <label htmlFor={"planyear-endDate"} className="mb-1 block text-[11px] uppercase tracking-wide text-muted">End date</label>
                  <input id={"planyear-endDate"} type="date" name="endDate" className={dateField} />
                </div>
                <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                  Open new year
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">End date must be after the start date.</p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
