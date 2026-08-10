"use client";

import { useState } from "react";
import { ManualReleaseForm } from "@/components/admin/ManualReleaseForm";

type Emp = { id: string; name: string };
type Benefit = { value: string; label: string; group: "Guaranteed" | "Flexible basket" };

/**
 * "Record a past claim / release" is an exception (HR back-filling a claim paid outside the app),
 * so it lives behind a button that opens a popup rather than sitting open on the page. The dialog
 * wraps the existing {@link ManualReleaseForm}; it stays open after a successful record (matching
 * the plan-year dialog) so HR can enter several in a row, and closes on ✕, Cancel, or click-outside.
 */
export function ManualReleaseModal({
  employees,
  benefits,
  triggerClassName = "mt-3 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900 hover:bg-gold-600",
  triggerLabel = "Record entry…",
}: {
  employees: Emp[];
  benefits: Benefit[];
  /** Lets the caller restyle/reposition the trigger (e.g. compact, in a section header). */
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Record a past claim or release"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-lg text-ink">Record a past claim / release</h2>
                <p className="mt-1 text-sm text-muted">
                  Saved as <strong>released</strong> (not queued) and counted against the benefit&apos;s allocation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg px-2 py-1 text-muted hover:bg-paper hover:text-ink"
              >
                ✕
              </button>
            </div>

            <ManualReleaseForm employees={employees} benefits={benefits} />

            <div className="mt-4 flex justify-end border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
