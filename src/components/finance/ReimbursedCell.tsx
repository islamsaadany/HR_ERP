"use client";

import { useState } from "react";
import { editPayment } from "@/app/(app)/finance/actions";

import { formatEGP as egp } from "@/lib/labels";

/**
 * The Payment cell for a REIMBURSED claim on the Finance Payments queue. Reads as a status
 * pill + paid amount + Edit; clicking Edit reveals an inline Finance-only form to correct the
 * transferred amount and the reimbursement date (`editPayment`), which sends no email — the
 * employee was already notified at reimbursement. Cancel returns to the read view.
 */
export function ReimbursedCell({
  id,
  paidAmount,
  paidDateInput,
}: {
  id: string;
  paidAmount: number; // the amount actually transferred (falls back to covered upstream)
  paidDateInput: string; // reimbursement date as YYYY-MM-DD for the date input
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 text-right">
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">Reimbursed</span>
        <span className="text-xs text-muted tabular-nums">{egp(paidAmount)}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-semibold text-navy-700 underline underline-offset-2 hover:text-navy-900"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      action={editPayment}
      onSubmit={() => setEditing(false)}
      className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-line bg-navy-50 p-2"
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="amountTransferred"
        defaultValue={String(paidAmount)}
        inputMode="numeric"
        aria-label="Amount transferred"
        className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none"
      />
      <input
        name="transferDate"
        type="date"
        required
        defaultValue={paidDateInput}
        aria-label="Reimbursement date"
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none"
      />
      <button className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-700">
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
      >
        Cancel
      </button>
    </form>
  );
}
