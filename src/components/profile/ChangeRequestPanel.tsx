"use client";

import { cancelProfileChangeRequest } from "@/app/(app)/profile/request-actions";

export type RequestRow = {
  id: string;
  label: string;
  /** The record's value, read now — not what it was when the request was sent. */
  was: string;
  now: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  reason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type PanelRequest = {
  id: string;
  submittedAt: string;
  reason: string | null;
  rows: RequestRow[];
};

const CHIP: Record<RequestRow["status"], string> = {
  PENDING: "border border-gold-300 bg-gold-50 text-gold-800",
  APPROVED: "border border-green-200 bg-green-50 text-green-700",
  DECLINED: "border border-red-300 bg-red-50 text-red-700",
};
const CHIP_LABEL: Record<RequestRow["status"], string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
};

/**
 * The status half of profile change requests (spec 029, US1): see a request waiting, withdraw
 * it, and see HR's decision per field. Proposing now starts from the card the data lives on
 * (the "Request a change" button on Personal / Emergency contact) — this panel no longer hosts
 * the form, it is the receipt.
 */
export function ChangeRequestPanel({
  open,
  decided,
}: {
  open: PanelRequest | null;
  decided: PanelRequest | null;
}) {
  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg text-ink">Change requests</h2>
        {open ? (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${CHIP.PENDING}`}>
            Awaiting HR
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">
        Corrections you sent to HR land here. To propose one, use “Request a change” on the card
        the detail belongs to. Nothing changes until HR approves it.
      </p>

      {open ? (
        <div className="mt-4">
          <RequestRows rows={open.rows} />
          {open.reason ? (
            <p className="mt-3 text-xs text-muted">Your note: “{open.reason}”</p>
          ) : null}
          <form action={cancelProfileChangeRequest} className="mt-3">
            <input type="hidden" name="id" value={open.id} />
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-red-300 hover:text-red-600"
            >
              Withdraw request
            </button>
          </form>
        </div>
      ) : decided ? null : (
        <p className="mt-3 text-sm text-muted">No requests yet.</p>
      )}

      {decided ? (
        <div className={`${open ? "mt-6 border-t border-line pt-4" : "mt-4"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Your last request</h3>
            <span className="text-xs text-muted">Sent {decided.submittedAt}</span>
          </div>
          <RequestRows rows={decided.rows} />
        </div>
      ) : null}
    </section>
  );
}

function RequestRows({ rows }: { rows: RequestRow[] }) {
  return (
    <ul className="mt-2 divide-y divide-line">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted">{row.label}</div>
            <div className="mt-0.5 text-sm text-ink">
              {row.status === "APPROVED" ? null : (
                <>
                  <span className="text-muted line-through">{row.was}</span>
                  <span className="px-1.5 text-muted">→</span>
                </>
              )}
              <span className="font-semibold">{row.now}</span>
            </div>
            {row.reason ? (
              <p className="mt-1 text-xs text-muted">“{row.reason}”</p>
            ) : null}
            {row.decidedBy && row.decidedAt ? (
              <p className="mt-1 text-[11px] text-muted">
                {row.decidedBy} · {row.decidedAt}
              </p>
            ) : null}
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${CHIP[row.status]}`}>
            {CHIP_LABEL[row.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}
