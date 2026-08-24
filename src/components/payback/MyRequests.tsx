import { formatDate, formatEGP2 } from "@/lib/labels";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { withdrawRequest } from "@/app/(app)/payback/actions";

export type MyRequestRow = {
  id: string;
  amount: string;
  datePaid: Date;
  submittedAt: Date;
  description: string;
  category: string | null;
  status: "SUBMITTED" | "APPROVED" | "PAYMENT_SUBMITTED" | "REJECTED" | "PAID";
  decisionReason: string | null;
  decidedBy: string | null;
  transferDate: Date | null;
  amountTransferred: string | null;
  evidenceCount: number;
};

/**
 * The employee's own requests (spec 039) — the answer to "where has my money got to", so that
 * nobody has to ask Finance.
 *
 * Colour follows the house rule: gold means someone still has to act, green means done, red
 * means it isn't happening. Navy is for the actions themselves.
 */
const STATUS: Record<
  MyRequestRow["status"],
  { label: string; chip: string; say: (r: MyRequestRow) => string }
> = {
  SUBMITTED: {
    label: "In review",
    chip: "border-gold-300 bg-gold-100 text-gold-800",
    say: () => "With Finance.",
  },
  APPROVED: {
    label: "Awaiting payment",
    chip: "border-navy-200 bg-navy-50 text-navy-700",
    say: (r) => `Approved${r.decidedBy ? ` by ${r.decidedBy}` : ""}. Waiting on the transfer.`,
  },
  // Spec 040: Finance has created the transaction in the bank and it is waiting on the second
  // signature there. Deliberately NOT called "paid" — until the bank releases it, nobody has been.
  PAYMENT_SUBMITTED: {
    label: "At the bank",
    chip: "border-gold-300 bg-gold-100 text-gold-800",
    say: () => "Finance has created this in the bank. It needs one more signature there.",
  },
  PAID: {
    label: "Paid",
    chip: "border-green-200 bg-green-50 text-green-700",
    say: (r) =>
      r.amountTransferred && r.transferDate
        ? `Transferred ${formatEGP2(r.amountTransferred)} on ${formatDate(r.transferDate)}.`
        : "Transferred.",
  },
  REJECTED: {
    label: "Declined",
    chip: "border-red-200 bg-red-50 text-red-700",
    say: (r) => r.decisionReason ?? "Declined.",
  },
};

export function MyRequests({ rows }: { rows: MyRequestRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
        You haven&apos;t asked for anything back yet.
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => {
        const s = STATUS[r.status];
        return (
          <article key={r.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-lg font-bold tabular-nums text-ink">{formatEGP2(r.amount)}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${s.chip}`}>
                {s.label}
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] font-semibold text-ink">{r.description}</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Paid {formatDate(r.datePaid)} · sent {formatDate(r.submittedAt)} · {r.evidenceCount}{" "}
              {r.evidenceCount === 1 ? "receipt" : "receipts"}
              {r.category ? ` · ${r.category}` : ""}
            </p>
            <p
              className={
                "mt-2.5 border-t border-line pt-2.5 text-[11.5px] " +
                (r.status === "REJECTED" ? "text-red-700" : "text-muted")
              }
            >
              {s.say(r)}
            </p>
            {r.status === "SUBMITTED" ? (
              <form action={withdrawRequest} className="mt-2">
                <input type="hidden" name="id" value={r.id} />
                <PendingSubmitButton
                  pendingLabel="Withdrawing…"
                  className="rounded-lg border border-line px-2.5 py-1 text-[11.5px] font-semibold text-muted hover:border-navy-200 hover:text-navy-700"
                >
                  Withdraw
                </PendingSubmitButton>
              </form>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
