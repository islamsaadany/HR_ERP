
import { ReimbursedCell } from "@/components/finance/ReimbursedCell";

export type PaymentRow = {
  id: string;
  status: "APPROVED" | "PAYMENT_SUBMITTED" | "REIMBURSED";
  employee: string;
  benefit: string;
  covered: number; // covered amount to transfer
  approvedAt: string; // display-formatted
  paidAmount: number | null; // set once reimbursed
  paidDate: string | null; // display-formatted, set once reimbursed
  paidDateInput: string; // reimbursement date as YYYY-MM-DD (for the edit form), "" if unset
  hasProof: boolean; // employee attached a proof-of-payment file
};

import { formatEGP as egp } from "@/lib/labels";

/**
 * Finance's benefit-claim payments (spec 020, amended by spec 041).
 *
 * The inline "confirm payment" that used to sit here is GONE. It set a claim to Reimbursed and
 * emailed the employee the moment Finance recorded a transfer — before the money had actually
 * moved. Claims now travel the same road as everything else: Finance ticks them into a submission
 * on the "Awaiting confirmation" tab, and the employee is told when the CEO confirms at the bank.
 *
 * What remains here is the view: what is waiting, what is at the bank, and the reimbursed history
 * with its correction form for a mistyped amount or date.
 */
export function PaymentsQueue({ rows }: { rows: PaymentRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
        No claims yet — nothing awaiting payment.
      </div>
    );
  }
  return (
    <div className="mt-6 ff-data-scroll rounded-xl border border-line bg-surface">
      <table className="ff-data-table text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-3 font-medium">Employee</th>
            <th className="px-3 py-3 font-medium">Benefit</th>
            <th className="px-3 py-3 text-right font-medium">Covered amount</th>
            <th className="px-3 py-3 font-medium">Approved</th>
            <th className="px-3 py-3 font-medium">Reimbursed on</th>
            <th className="px-3 py-3 font-medium">Proof</th>
            <th className="px-3 py-3 text-right font-medium">Payment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-b-0 align-middle">
              <td className="px-3 py-2 font-medium text-ink">{r.employee}</td>
              <td className="px-3 py-2 text-muted">{r.benefit}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink">{egp(r.covered)}</td>
              <td className="px-3 py-2 text-muted">{r.approvedAt}</td>
              <td className="px-3 py-2 text-muted">{r.paidDate ?? "—"}</td>
              <td className="px-3 py-2">
                {r.hasProof ? (
                  <a
                    href={`/api/claims/${r.id}/proof`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-navy-700 underline underline-offset-2 hover:text-navy-900"
                  >
                    View proof
                  </a>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                {r.status === "APPROVED" ? (
                  // No confirm button here any more: an approved claim is picked up on the
                  // "Awaiting confirmation" tab, along with paybacks and float top-ups, and paid
                  // once the CEO confirms it at the bank.
                  <span className="block text-right text-[11.5px] text-muted">
                    Ready to submit for confirmation
                  </span>
                ) : r.status === "PAYMENT_SUBMITTED" ? (
                  <span className="flex justify-end">
                    <span className="rounded-full border border-gold-300 bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-800">
                      At the bank
                    </span>
                  </span>
                ) : (
                  <ReimbursedCell
                    id={r.id}
                    paidAmount={r.paidAmount ?? r.covered}
                    paidDateInput={r.paidDateInput}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
