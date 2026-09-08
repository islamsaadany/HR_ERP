import { formatEGP2, formatDate, toDateInput } from "@/lib/labels";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { submitTransactions, withdrawSubmission } from "@/app/(app)/finance/batch-actions";
import type { PayableGroup } from "@/lib/finance/payables";

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
  businessUnitName: string;
};

/**
 * Finance's side of the confirmation flow (spec 041): tick what you have created in the bank, and
 * see what is waiting on the confirmer.
 *
 * ONE BAND PER BUSINESS UNIT (2026-08-25). Each unit banks separately, so a submission is one
 * transaction in one account — and the way that is guaranteed is structural: there is no list
 * containing two units, so there is nothing to tick across. Each band carries its own total, its
 * own form and its own Send, and names the person it is going to before it goes.
 *
 * Within a band the three kinds of payable still sit together, because they are one question —
 * "what did I just create in this account?" — and splitting them by origin would make Finance tick
 * three lists to describe one sitting.
 */
export function SubmitPanel({
  groups,
  submissions,
}: {
  groups: PayableGroup[];
  submissions: SubmissionRow[];
}) {
  const waiting = submissions.filter((s) => s.status === "SUBMITTED");
  const settled = submissions.filter((s) => s.status !== "SUBMITTED");

  return (
    <section>
      <p className="max-w-prose text-muted">
        Tick what you have created in the bank — paybacks, float top-ups and approved benefit claims
        all sit here — then send. Each business unit goes to its own confirmer, who is emailed
        straight away. The people being paid are told only once it is confirmed.
      </p>

      {groups.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          Nothing is waiting to be paid.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {groups.map((g) => (
            <UnitGroup key={g.businessUnitId ?? "none"} group={g} />
          ))}
        </div>
      )}

      <h3 className="mt-8 text-[12.5px] font-bold uppercase tracking-[0.09em] text-muted">
        Awaiting confirmation
        {waiting.length ? <span className="ml-2 font-semibold text-ink">{waiting.length}</span> : null}
      </h3>
      {waiting.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">Nothing is with a confirmer.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {waiting.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
              <span className="text-[12.5px]">
                <b className="text-ink">{s.reference}</b>
                <span className="ml-2 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-bold text-muted">
                  {s.businessUnitName}
                </span>
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
                <b className="text-ink">{s.reference}</b> · {s.businessUnitName} · {s.summary} ·{" "}
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

/**
 * One unit's worth of what is waiting.
 *
 * A group that cannot be sent — nobody appointed, or the people in it have no business unit —
 * shows its lines but has no form around them at all. Not a disabled button: a disabled button
 * still posts if somebody re-enables it, and there is nothing here to post to.
 */
function UnitGroup({ group: g }: { group: PayableGroup }) {
  const rail =
    g.businessUnitId === null
      ? "border-l-gold-500"
      : g.canSend
        ? "border-l-navy-800"
        : "border-l-gold-500";

  const rows = (
    <div className="ff-data-scroll">
      <table className="ff-data-table text-sm">
        <thead>
          <tr>
            {g.canSend ? <th className="px-3 py-3 text-left font-medium">·</th> : null}
            <th className="px-3 py-3 text-left font-medium">Paying</th>
            <th className="px-3 py-3 text-left font-medium">For</th>
            <th className="px-3 py-3 text-left font-medium">Waiting since</th>
            <th className="px-3 py-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {g.payables.map((p) => (
            <tr key={`${p.kind}:${p.id}`} className="border-b border-line last:border-b-0">
              {g.canSend ? (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    name="payables"
                    value={`${p.kind}:${p.id}`}
                    className="h-4 w-4 rounded border-navy-500"
                    aria-label={`Include ${p.payeeName}`}
                  />
                </td>
              ) : null}
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
  );

  return (
    <div className={"overflow-hidden rounded-xl border border-line border-l-4 bg-surface " + rail}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-[#fbfaf7] px-4 py-3">
        <div>
          <p className="font-serif text-[17px] text-ink">{g.businessUnitName}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {g.businessUnitId === null
              ? "These people have no business unit set"
              : g.confirmerNames.length
                ? `Confirmed by ${g.confirmerNames.join(", ")}`
                : "Nobody appointed"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-serif text-xl tabular-nums text-ink">
            {formatEGP2(g.totalPiastres / 100)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {g.payables.length} {g.payables.length === 1 ? "payment" : "payments"} waiting
          </p>
        </div>
      </div>

      {g.canSend ? (
        <form action={submitTransactions}>
          <input type="hidden" name="businessUnitId" value={g.businessUnitId ?? ""} />
          {rows}
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
            <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-3">
              <span className="text-[11.5px] text-muted">
                Goes to {g.confirmerNames.join(", ")} the moment you send it.
              </span>
              <PendingSubmitButton
                pendingLabel="Sending…"
                className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900"
              >
                Send for confirmation
              </PendingSubmitButton>
            </div>
          </div>
        </form>
      ) : (
        <>
          <p className="mx-4 mt-3 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-50 px-3 py-2.5 text-[12.5px] text-gold-800">
            {g.businessUnitId === null ? (
              <>
                <b>Nothing here can be sent.</b> The people in this list have no business unit, so
                there is no account to pay them from. Set their business unit and they move into it.
              </>
            ) : (
              <>
                <b>Nothing can be sent for {g.businessUnitName}.</b> Nobody is appointed to confirm
                this unit&rsquo;s transactions, and nobody else stands in. A Super User can appoint
                somebody — including themselves — and this unblocks immediately.
              </>
            )}
          </p>
          {rows}
        </>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";
const LABEL = "text-[11.5px] font-semibold text-navy-700";
