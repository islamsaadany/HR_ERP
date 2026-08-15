"use client";

import { useState, useTransition } from "react";
import { createCatalogItem } from "@/app/(app)/admin/benefits/config-actions";

/**
 * "Add benefit" — a toolbar button that opens a modal to create a new flexible catalogue item
 * (name, category, coverage %). Guaranteed and medical benefits are managed separately; this adds
 * a claim-as-you-go flexible benefit. Submits to the existing `createCatalogItem` server action.
 */
export function AddCatalogItemModal({ categories }: { categories: string[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const input =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      await createCatalogItem(data);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-navy-800 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700"
      >
        + Add benefit
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4 backdrop-blur-md"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-benefit-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            <h3 id="add-benefit-title" className="font-serif text-xl text-ink">Add a flexible benefit</h3>
            <p className="mt-1 text-sm text-muted">
              A claim-as-you-go benefit. Set its FT/PT eligibility and claim requirement in the table after adding.
            </p>
            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <div>
                <label htmlFor={"addbenefit-name"} className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Benefit name</label>
                <input id={"addbenefit-name"} name="name" required autoFocus placeholder="e.g. Eyewear allowance" className={input} />
              </div>
              <div>
                <label htmlFor={"addbenefit-category"} className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Category</label>
                <input id={"addbenefit-category"} name="category" list="add-catalogue-categories" placeholder="Pick or type a category" className={input} />
                <datalist id="add-catalogue-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label htmlFor={"addbenefit-coverageRate"} className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Company coverage %</label>
                <input id={"addbenefit-coverageRate"} name="coverageRate" type="number" min={1} max={100} defaultValue={100} className={input} />
                <p className="mt-1 text-xs text-muted">The share the company reimburses on each claim (1–100).</p>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-line px-4 py-2 text-sm text-muted">Cancel</button>
                <button type="submit" disabled={pending} className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
                  {pending ? "Adding…" : "Add benefit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
