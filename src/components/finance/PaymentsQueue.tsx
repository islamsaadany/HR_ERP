import { confirmPayment } from "@/app/(app)/finance/actions";

export type PaymentRow = {
  id: string;
  status: "APPROVED" | "REIMBURSED";
  employee: string;
  benefit: string;
  covered: number; // covered amount to transfer
  approvedAt: string; // display-formatted
  paidAmount: number | null; // set once reimbursed
  paidDate: string | null; // display-formatted, set once reimbursed
  hasProof: boolean; // employee attached a proof-of-payment file
};

const egp = (n: number) => "EGP " + n.toLocaleString("en-US");

/**
 * Finance payments queue — APPROVED claims (awaiting payment, with an inline confirm form) followed
 * by REIMBURSED ones (read-only, kept for reference so a confirmed payment doesn't disappear).
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
                  <form action={confirmPayment} className="flex flex-wrap items-center justify-end gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      name="amountTransferred"
                      defaultValue={String(r.covered)}
                      inputMode="numeric"
                      aria-label="Amount transferred"
                      className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none"
                    />
                    <input
                      name="transferDate"
                      type="date"
                      required
                      aria-label="Transfer date"
                      className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none"
                    />
                    <button className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-700">
                      Confirm
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2 text-right">
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">Reimbursed</span>
                    <span className="text-xs text-muted tabular-nums">
                      {r.paidAmount != null ? egp(r.paidAmount) : egp(r.covered)}
                      {r.paidDate ? ` · ${r.paidDate}` : ""}
                    </span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
