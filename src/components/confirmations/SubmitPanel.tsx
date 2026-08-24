import { formatEGP2, formatDate, toDateInput } from "@/lib/labels";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { submitTransactions, withdrawSubmission } from "@/app/(app)/finance/batch-actions";
import type { Payable } from "@/lib/finance/payables";

export type SubmissionRow = {
  id: string;
  reference: string;
  summary: string;
  total: string;
  status: "SUBMITTED" | "COMPLETE" | "RETURNED" | "WITHDRAWN";
  submittedOn: string;
  decidedOn: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
};

/**
 * Finance's side of the confirmation flow (spec 040): tick what you have created in the bank, and
 * see what is waiting on the CEO.
 *
 * The three kinds of payable sit in one list because they are one question — "what did I just
 * create in the bank?" — and splitting them by origin would make Finance tick three lists to
 * describe one sitting.
 */
export function SubmitPanel({
  payables,
  submissions,
  anyConfirmer,
}: {
  payables: Payable[];
  submissions: SubmissionRow[];
  anyConfirmer: boolean;
}) {
  const waiting = submissions.filter((s) => s.status === "SUBMITTED");
  const settled = submissions.filter((s) => s.status !== "SUBMITTED");

  return (
    <section>
      <p className="max-w-prose text-muted">
        Tick what you have created in the bank — paybacks, float top-ups and approved benefit claims
        all sit here — then submit. The confirmer is emailed straight away, and the people being paid
        are told only once they confirm.
      </p>

      {!anyConfirmer ? (
        <p className="mt-4 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          Nobody is appointed to confirm transactions yet. You can still submit — it records what you
          created in the bank — but it will sit here until a Super User appoints someone.
        </p>
      ) : null}

      {payables.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          Nothing is waiting to be paid.
        </div>
      ) : (
        <form action={submitTransactions} className="mt-6 rounded-xl border border-line bg-surface">
          <div className="ff-data-scroll">
            <table className="ff-data-table text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-left font-medium">·</th>
                  <th className="px-3 py-3 text-left font-medium">Paying</th>
                  <th className="px-3 py-3 text-left font-medium">For</th>
                  <th className="px-3 py-3 text-left font-medium">Waiting since</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payables.map((p) => (
                  <tr key={`${p.kind}:${p.id}`} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        name="payables"
                        value={`${p.kind}:${p.id}`}
                        className="h-4 w-4 rounded border-navy-500"
                        aria-label={`Include ${p.payeeName}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-ink">{p.payeeName}</td>
                    <td className="px-3 py-2 text-muted">{p.purpose}</td>
                    <td className="px-3 py-2 text-muted">{formatDate(p.since)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">
                      {formatEGP2(p.amountPiastres / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 border-t border-line p-4 md:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Value date at the bank</span>
              <input type="date" name="valueDate" required defaultValue={toDateInput(new Date())} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Bank reference</span>
              <input type="text" name="bankReference" placeholder="NBE-88213" className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>
                Note <span className="font-normal text-muted">(optional)</span>
              </span>
              <input type="text" name="note" placeholder="Anything they should know" className={INPUT} />
            </label>
            <div className="flex items-center justify-end md:col-span-3">
              <PendingSubmitButton
                pendingLabel="Submitting…"
                className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900"
              >
                Submit for confirmation
              </PendingSubmitButton>
            </div>
          </div>
        </form>
      )}

      <h3 className="mt-8 text-[12.5px] font-bold uppercase tracking-[0.09em] text-muted">
        Awaiting confirmation
        {waiting.length ? <span className="ml-2 font-semibold text-ink">{waiting.length}</span> : null}
      </h3>
      {waiting.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">Nothing is with the confirmer.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {waiting.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
              <span className="text-[12.5px]">
                <b className="text-ink">{s.reference}</b>
                <span className="block text-[11.5px] text-muted">
                  {s.summary} · submitted {s.submittedOn}
                </span>
              </span>
              <details>
                <summary className="w-fit cursor-pointer list-none rounded-lg border border-line px-3 py-1.5 text-[11.5px] font-semibold text-muted [&::-webkit-details-marker]:hidden">
                  Withdraw…
                </summary>
                <form action={withdrawSubmission} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    type="text"
                    name="reason"
                    required
                    placeholder="Why?"
                    className="w-56 rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-[12px]"
                  />
                  <PendingSubmitButton
                    pendingLabel="…"
                    className="rounded-lg border border-line px-3 py-1.5 text-[11.5px] font-semibold text-muted"
                  >
                    Withdraw
                  </PendingSubmitButton>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}

      {settled.length > 0 ? (
        <>
          <h3 className="mt-8 text-[12.5px] font-bold uppercase tracking-[0.09em] text-muted">Settled</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {settled.map((s) => (
              <li key={s.id} className="text-[12.5px] text-muted">
                <b className="text-ink">{s.reference}</b> · {s.summary} ·{" "}
                {s.status === "COMPLETE"
                  ? `complete ${s.decidedOn ?? ""}${s.decidedBy ? ` · ${s.decidedBy}` : ""}`
                  : s.status === "RETURNED"
                    ? `returned${s.decisionNote ? ` — “${s.decisionNote}”` : ""}`
                    : `withdrawn${s.decisionNote ? ` — “${s.decisionNote}”` : ""}`}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

const INPUT =
  "w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";
const LABEL = "text-[11.5px] font-semibold text-navy-700";
