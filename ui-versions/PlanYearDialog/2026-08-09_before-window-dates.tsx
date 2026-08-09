"use client";

import { useState } from "react";
import { createPlanYear, setPlanYearStatus } from "@/app/(app)/admin/benefits/actions";

type PlanYear = { id: string; name: string; status: string };

/**
 * Top-right "Plan year" button that opens a popup for full plan-year management:
 * the list of years with open/close toggles, plus a create-new-year form. The forms
 * are server actions (revalidate, no redirect), so the popup stays open and refreshes
 * its list after each change.
 */
export function PlanYearDialog({ planYears, activeName }: { planYears: PlanYear[]; activeName?: string }) {
  const [open, setOpen] = useState(false);

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
            className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl"
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
              Only one year is open at a time. Opening a year closes any other; employees can save or submit
              only while a year is open.
            </p>

            <ul className="mt-4 divide-y divide-line">
              {planYears.length === 0 ? (
                <li className="py-2 text-sm text-muted">No plan years yet.</li>
              ) : null}
              {planYears.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
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
                  </div>
                  <form action={setPlanYearStatus}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value={p.status === "OPEN" ? "CLOSED" : "OPEN"} />
                    <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50">
                      {p.status === "OPEN" ? "Close" : "Open"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            <form action={createPlanYear} className="mt-4 flex items-end gap-2 border-t border-line pt-4">
              <div className="flex-1">
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">New plan year</label>
                <input
                  name="name"
                  placeholder="e.g. 2027"
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                />
              </div>
              <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                Open new year
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
