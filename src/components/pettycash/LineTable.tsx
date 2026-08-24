import { formatEGP2, formatDate } from "@/lib/labels";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { deleteLine, addEvidence } from "@/app/(app)/petty-cash/actions";
import { ACCEPT_ATTRIBUTE, LIMITS_HINT } from "@/lib/finance/evidence";

export type LineRow = {
  id: string;
  datePaid: Date;
  section: string;
  category: string | null;
  description: string;
  method: "FLOAT" | "COMPANY_TRANSFER";
  paymentDetails: string | null;
  payee: string | null;
  amount: string; // Decimal serialised — display only, never arithmetic
  evidence: { id: string; fileName: string }[];
  outsideWindow: boolean;
};

/**
 * The period's lines (spec 040).
 *
 * Two flags are derived, never stored: **No receipt** (the line has no evidence) and **Outside
 * this period** (paid outside the window). The second is information, not a fault — receipts
 * surface late and the source workbook is full of lines sitting on the wrong tab.
 */
export function LineTable({
  rows,
  canWrite,
  total,
}: {
  rows: LineRow[];
  canWrite: boolean;
  /** Piastres-derived display string for the footer. */
  total: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
        Nothing logged in this period yet.
      </div>
    );
  }

  return (
    <div className="ff-data-scroll mt-5 rounded-xl border border-line bg-surface">
      <table className="ff-data-table text-sm">
        <thead>
          <tr>
            <th className="px-3 py-3 text-left font-medium">Date</th>
            <th className="px-3 py-3 text-left font-medium">Section</th>
            <th className="px-3 py-3 text-left font-medium">Description</th>
            <th className="px-3 py-3 text-left font-medium">Paid</th>
            <th className="px-3 py-3 text-left font-medium">Payee</th>
            <th className="px-3 py-3 text-right font-medium">Amount</th>
            <th className="px-3 py-3 text-left font-medium">Receipt</th>
            {canWrite ? <th className="px-3 py-3 text-right font-medium">·</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line align-top last:border-b-0">
              <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(r.datePaid)}</td>
              <td className="px-3 py-2 text-muted">{r.section}</td>
              <td className="px-3 py-2">
                <span className="block font-medium text-ink">{r.description}</span>
                <span className="mt-0.5 block text-[11.5px] text-muted">
                  {[r.category, r.paymentDetails].filter(Boolean).join(" · ") || "—"}
                  {r.outsideWindow ? (
                    <span className="ml-1.5 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">
                      Outside this period
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">
                  {r.method === "FLOAT" ? "Float" : "Company transfer"}
                </span>
              </td>
              <td className="px-3 py-2 text-muted">{r.payee ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink">{formatEGP2(r.amount)}</td>
              <td className="px-3 py-2">
                {r.evidence.length > 0 ? (
                  <span className="flex flex-col gap-0.5">
                    {r.evidence.map((e) => (
                      <a
                        key={e.id}
                        href={`/api/expense-evidence/${e.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11.5px] font-medium text-navy-700 underline underline-offset-2 hover:text-navy-900"
                      >
                        {e.fileName}
                      </a>
                    ))}
                  </span>
                ) : (
                  <MissingReceipt lineId={r.id} canWrite={canWrite} />
                )}
              </td>
              {canWrite ? (
                <td className="px-3 py-2 text-right">
                  <form action={deleteLine}>
                    <input type="hidden" name="lineId" value={r.id} />
                    <PendingSubmitButton
                      pendingLabel="Removing…"
                      className="rounded-lg border border-line px-2 py-1 text-[11.5px] font-semibold text-muted hover:border-red-200 hover:text-red-700"
                    >
                      Remove
                    </PendingSubmitButton>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-navy-50">
            <td className="px-3 py-3 font-semibold text-ink" colSpan={5}>
              Total expenses · {rows.length} {rows.length === 1 ? "line" : "lines"}
            </td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">{total}</td>
            <td className="px-3 py-3" colSpan={canWrite ? 2 : 1} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * A line with no receipt. Flagged in gold (attention, not failure), and — while the period can
 * still be written to — offering the attach right there, because the moment somebody notices is
 * the moment they have the photo to hand.
 */
function MissingReceipt({ lineId, canWrite }: { lineId: string; canWrite: boolean }) {
  const chip = (
    <span className="rounded-full border border-gold-300 bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-800">
      No receipt
    </span>
  );
  if (!canWrite) return chip;

  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{chip}</summary>
      <form action={addEvidence} className="mt-2 flex flex-col gap-1.5">
        <input type="hidden" name="lineId" value={lineId} />
        <input
          type="file"
          name="files"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="text-[11px] text-muted file:mr-2 file:rounded-md file:border file:border-navy-200 file:bg-surface file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-navy-700"
        />
        <span className="text-[10.5px] text-muted">{LIMITS_HINT}</span>
        <PendingSubmitButton
          pendingLabel="Attaching…"
          className="w-fit rounded-lg bg-navy-800 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-navy-900"
        >
          Attach
        </PendingSubmitButton>
      </form>
    </details>
  );
}
