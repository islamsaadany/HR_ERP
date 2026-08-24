import { formatDate, formatEGP2, toDateInput } from "@/lib/labels";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import {
  approveRequest,
  rejectRequest,
  recordPayment,
  correctPayment,
} from "@/app/(app)/finance/payback-actions";

export type DuplicateHint = {
  id: string;
  datePaid: Date;
  description: string;
  amount: string;
  account: string;
  period: string;
};

export type ReviewRow = {
  id: string;
  requester: string;
  amount: string;
  datePaid: Date;
  submittedAt: Date;
  description: string;
  category: string | null;
  payee: string | null;
  status: "SUBMITTED" | "APPROVED" | "PAYMENT_SUBMITTED" | "REJECTED" | "PAID";
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  transferDate: Date | null;
  amountTransferred: string | null;
  evidence: { id: string; fileName: string }[];
  duplicates: DuplicateHint[];
};

/**
 * Finance's payback queue (spec 039): what needs a decision, then what needs paying, then the
 * history. Ordered that way because it is a list that should reach zero, not an archive.
 */
export function ReviewQueue({ rows }: { rows: ReviewRow[] }) {
  const waiting = rows.filter((r) => r.status === "SUBMITTED");
  const toPay = rows.filter((r) => r.status === "APPROVED");
  // Sent to the bank, waiting on the second signature (spec 040). Its own group, because there is
  // nothing for Finance to do with these but wait — mixing them into "awaiting payment" would
  // invite somebody to pay the same thing twice.
  const atBank = rows.filter((r) => r.status === "PAYMENT_SUBMITTED");
  const done = rows.filter((r) => r.status === "PAID" || r.status === "REJECTED");

  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
        No payback requests yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Group title="Waiting on you" rows={waiting} empty="Nothing to review." />
      <Group title="Approved — awaiting payment" rows={toPay} empty="Nothing awaiting payment." />
      <Group title="Sent to the bank" rows={atBank} empty="Nothing at the bank." muted />
      <Group title="Settled" rows={done} empty="Nothing settled yet." muted />
    </div>
  );
}

function Group({
  title,
  rows,
  empty,
  muted = false,
}: {
  title: string;
  rows: ReviewRow[];
  empty: string;
  muted?: boolean;
}) {
  return (
    <section>
      <h3 className="text-[12.5px] font-bold uppercase tracking-[0.09em] text-muted">
        {title}
        {rows.length ? <span className="ml-2 font-semibold text-ink">{rows.length}</span> : null}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">{empty}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          {rows.map((r) => (
            <RequestCard key={r.id} row={r} muted={muted} />
          ))}
        </div>
      )}
    </section>
  );
}

function RequestCard({ row: r, muted }: { row: ReviewRow; muted: boolean }) {
  return (
    <article className={"rounded-xl border border-line bg-surface p-4 " + (muted ? "opacity-90" : "")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{r.requester}</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {[r.category, r.payee].filter(Boolean).join(" · ")}
            {r.category || r.payee ? " · " : ""}
            paid {formatDate(r.datePaid)} · sent {formatDate(r.submittedAt)}
            {r.decidedBy ? ` · decided by ${r.decidedBy}` : ""}
          </p>
          <p className="mt-2 text-[13px] text-ink">{r.description}</p>
        </div>
        <div className="text-right">
          <p className="font-serif text-2xl tabular-nums text-ink">{formatEGP2(r.amount)}</p>
          <p className="mt-0.5 flex flex-col items-end gap-0.5">
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
          </p>
        </div>
      </div>

      {/* The one safeguard against the same purchase being claimed twice — once here and once as
          a petty cash line. The system cannot know they are the same purchase, so it shows the
          coincidence rather than pretending to decide. */}
      {r.duplicates.length > 0 ? (
        <div className="mt-3 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-50 px-3 py-2.5">
          <p className="text-[11.5px] font-bold text-gold-800">Possible duplicate</p>
          <ul className="mt-1 text-[12px] text-ink">
            {r.duplicates.map((d) => (
              <li key={d.id}>
                {r.requester} holds <b>{d.account}</b>, which has a line for{" "}
                <b>{formatEGP2(d.amount)}</b> dated {formatDate(d.datePaid)} — “{d.description}” (
                {d.period}).
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11.5px] text-muted">
            Check before approving; this may already have been paid from the float.
          </p>
        </div>
      ) : null}

      {r.status === "SUBMITTED" ? <DecideForms id={r.id} /> : null}
      {r.status === "APPROVED" ? <PayForm id={r.id} amount={r.amount} /> : null}
      {r.status === "PAID" ? (
        <PaidRow
          id={r.id}
          transferDate={r.transferDate}
          amountTransferred={r.amountTransferred}
        />
      ) : null}
      {r.status === "REJECTED" ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">
          Declined{r.decidedAt ? ` on ${formatDate(r.decidedAt)}` : ""}
          {r.decisionReason ? ` — “${r.decisionReason}”` : ""}
        </p>
      ) : null}
    </article>
  );
}

function DecideForms({ id }: { id: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-start gap-2">
      <form action={approveRequest}>
        <input type="hidden" name="id" value={id} />
        <PendingSubmitButton
          pendingLabel="Approving…"
          className="rounded-lg bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-900"
        >
          Approve
        </PendingSubmitButton>
      </form>

      <details>
        <summary className="w-fit cursor-pointer list-none rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-[12.5px] font-semibold text-red-700 [&::-webkit-details-marker]:hidden">
          Decline…
        </summary>
        <form action={rejectRequest} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input
            type="text"
            name="reason"
            required
            placeholder="Why? The person is told."
            className="w-72 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px]"
          />
          <PendingSubmitButton
            pendingLabel="Declining…"
            className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-[12.5px] font-semibold text-red-700"
          >
            Decline
          </PendingSubmitButton>
        </form>
      </details>
    </div>
  );
}

function PayForm({ id, amount }: { id: string; amount: string }) {
  return (
    <form action={recordPayment} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-navy-700">Amount transferred</span>
        <input
          type="text"
          name="amountTransferred"
          required
          inputMode="decimal"
          defaultValue={Number(amount).toFixed(2)}
          className="w-32 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] tabular-nums"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-navy-700">Transfer date</span>
        <input
          type="date"
          name="transferDate"
          required
          defaultValue={toDateInput(new Date())}
          className="rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-navy-700">Reference</span>
        <input
          type="text"
          name="paymentReference"
          placeholder="optional"
          className="w-40 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px]"
        />
      </label>
      <PendingSubmitButton
        pendingLabel="Recording…"
        className="rounded-lg bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-900"
      >
        Record the payment
      </PendingSubmitButton>
    </form>
  );
}

function PaidRow({
  id,
  transferDate,
  amountTransferred,
}: {
  id: string;
  transferDate: Date | null;
  amountTransferred: string | null;
}) {
  return (
    <div className="mt-3">
      <p className="text-[12px] text-green-700">
        Paid {amountTransferred ? formatEGP2(amountTransferred) : ""}
        {transferDate ? ` on ${formatDate(transferDate)}` : ""}.
      </p>
      <details className="mt-1">
        <summary className="w-fit cursor-pointer list-none text-[11.5px] font-semibold text-muted underline underline-offset-2 [&::-webkit-details-marker]:hidden">
          Correct the record
        </summary>
        <form action={correctPayment} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={id} />
          <input
            type="text"
            name="amountTransferred"
            required
            inputMode="decimal"
            defaultValue={amountTransferred ? Number(amountTransferred).toFixed(2) : ""}
            className="w-32 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] tabular-nums"
          />
          <input
            type="date"
            name="transferDate"
            required
            defaultValue={toDateInput(transferDate)}
            className="rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px]"
          />
          <PendingSubmitButton
            pendingLabel="Saving…"
            className="rounded-lg border border-navy-200 px-3.5 py-2 text-[12.5px] font-semibold text-navy-700"
          >
            Save the correction
          </PendingSubmitButton>
          <span className="text-[11px] text-muted">No email — the person was already told.</span>
        </form>
      </details>
    </div>
  );
}
