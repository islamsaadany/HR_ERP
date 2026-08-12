"use client";

import { useState } from "react";

/**
 * Firm P&L figures for a cycle. After the figures are saved the card shows a locked, read-only
 * summary with an "Edit" button (so a saved cycle doesn't sit in an always-editable form). A brand
 * new cycle with no figures yet starts in edit mode. Saving runs the server action, which redirects
 * and reloads the page — remounting this card in the locked view.
 */
export function FirmFiguresCard({
  revenue,
  deliveryCost,
  totalExpenses,
  action,
}: {
  revenue: number | null;
  deliveryCost: number | null;
  totalExpenses: number | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const hasFigures = revenue != null || deliveryCost != null || totalExpenses != null;
  const [editing, setEditing] = useState(!hasFigures);

  const input =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  if (!editing) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-ink">Firm P&amp;L</div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            Edit
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Figure label="Revenue" value={revenue} />
          <Figure label="Direct cost" value={deliveryCost} />
          <Figure label="Total expenses" value={totalExpenses} />
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-line bg-surface p-4">
      <div className="text-sm font-semibold text-ink">Firm P&amp;L</div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Revenue</label>
          <input name="revenue" defaultValue={revenue ?? ""} className={input + " w-full"} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Direct cost</label>
          <input name="deliveryCost" defaultValue={deliveryCost ?? ""} className={input + " w-full"} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Total expenses</label>
          <input name="totalExpenses" defaultValue={totalExpenses ?? ""} className={input + " w-full"} />
        </div>
      </div>
      <button className="mt-3 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
        Save firm figures
      </button>
    </form>
  );
}

function Figure({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="rounded-lg border border-line bg-paper px-3 py-2 text-sm font-semibold tabular-nums text-ink">
        {value == null ? "—" : value.toLocaleString()}
      </div>
    </div>
  );
}
