import { formatDate, formatEGP2, toDateInput } from "@/lib/labels";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import {
  recordFunding,
  deleteFunding,
  openPeriod,
  closePeriod,
  reopenPeriod,
} from "@/app/(app)/petty-cash/finance-actions";

export type FundingRow = {
  id: string;
  type: "TOP_UP" | "RETURN";
  date: Date;
  amount: string;
  reference: string | null;
  note: string | null;
  recordedBy: string | null;
  locked: boolean;
};

export type MissingLine = {
  id: string;
  datePaid: Date;
  description: string;
  amount: string;
};

/**
 * The Finance-only half of an account page (spec 039): funding, and the period lifecycle.
 *
 * A custodian never sees this block — they log spend and hand the period over; the money going
 * in, and the decision to freeze a month, belong to Finance.
 */
export function FinancePanel({
  accountId,
  period,
  fundings,
  missingEvidence,
  closingBalanceDisplay,
}: {
  accountId: string;
  period: {
    id: string;
    label: string;
    status: "OPEN" | "SUBMITTED" | "CLOSED";
  } | null;
  fundings: FundingRow[];
  missingEvidence: MissingLine[];
  closingBalanceDisplay: string;
}) {
  return (
    <section className="mt-6 rounded-xl border border-line bg-surface">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-navy-800">Finance</h2>

      <div className="grid gap-0 md:grid-cols-2">
        <div className="border-b border-line p-4 md:border-b-0 md:border-r">
          <FundingBlock accountId={accountId} periodId={period?.id ?? null} rows={fundings} />
        </div>
        <div className="p-4">
          {period === null ? (
            <OpenPeriodForm accountId={accountId} />
          ) : period.status === "CLOSED" ? (
            <ReopenBlock accountId={accountId} period={period} />
          ) : (
            <CloseBlock
              accountId={accountId}
              period={period}
              missingEvidence={missingEvidence}
              closingBalanceDisplay={closingBalanceDisplay}
            />
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Funding ───────────────────────────────────────────────────────────────

function FundingBlock({
  accountId,
  periodId,
  rows,
}: {
  accountId: string;
  periodId: string | null;
  rows: FundingRow[];
}) {
  return (
    <div>
      <h3 className="text-[12.5px] font-semibold text-navy-700">Money in and out of the float</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">Nothing recorded for this period.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {rows.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
            >
              <span className="text-[12.5px]">
                <b className="font-semibold text-ink">
                  {f.type === "TOP_UP" ? "Top-up" : "Returned"} {formatEGP2(f.amount)}
                </b>
                <span className="block text-[11px] text-muted">
                  {formatDate(f.date)}
                  {f.reference ? ` · ${f.reference}` : ""}
                  {f.recordedBy ? ` · by ${f.recordedBy}` : ""}
                </span>
              </span>
              {f.locked ? null : (
                <form action={deleteFunding}>
                  <input type="hidden" name="accountId" value={accountId} />
                  <input type="hidden" name="fundingId" value={f.id} />
                  <PendingSubmitButton
                    pendingLabel="…"
                    className="rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:border-red-200 hover:text-red-700"
                  >
                    Remove
                  </PendingSubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3">
        <summary className="w-fit cursor-pointer list-none rounded-lg border border-navy-200 px-3 py-1.5 text-[12.5px] font-semibold text-navy-700 [&::-webkit-details-marker]:hidden">
          Record a top-up or return
        </summary>
        <form action={recordFunding} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="accountId" value={accountId} />
          {periodId ? <input type="hidden" name="periodId" value={periodId} /> : null}
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Direction</span>
            <select name="type" className={INPUT} defaultValue="TOP_UP">
              <option value="TOP_UP">Top-up — company to custodian</option>
              <option value="RETURN">Return — custodian to company</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Amount (EGP)</span>
            <input
              type="text"
              name="amount"
              required
              inputMode="decimal"
              placeholder="9000.00"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Date</span>
            <input
              type="date"
              name="date"
              required
              defaultValue={toDateInput(new Date())}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Reference</span>
            <input type="text" name="reference" placeholder="Bank / InstaPay ref" className={INPUT} />
          </label>
          <div className="sm:col-span-2">
            <PendingSubmitButton
              pendingLabel="Recording…"
              className="rounded-lg bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-900"
            >
              Record it
            </PendingSubmitButton>
          </div>
        </form>
      </details>
    </div>
  );
}

// ─── Period lifecycle ──────────────────────────────────────────────────────

function OpenPeriodForm({ accountId }: { accountId: string }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const label = first.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });

  return (
    <div>
      <h3 className="text-[12.5px] font-semibold text-navy-700">No open period</h3>
      <p className="mt-1 text-[12.5px] text-muted">
        Spend can only be logged into an open period. Its opening balance carries over from the last one
        automatically.
      </p>
      <form action={openPeriod} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="accountId" value={accountId} />
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Name</span>
          <input type="text" name="label" required defaultValue={label} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Budget (EGP)</span>
          <input type="text" name="budget" inputMode="decimal" placeholder="optional" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>From</span>
          <input
            type="date"
            name="startDate"
            required
            defaultValue={toDateInput(first)}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>To</span>
          <input type="date" name="endDate" required defaultValue={toDateInput(last)} className={INPUT} />
        </label>
        <div className="sm:col-span-2">
          <PendingSubmitButton
            pendingLabel="Opening…"
            className="rounded-lg bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-900"
          >
            Open the period
          </PendingSubmitButton>
        </div>
      </form>
    </div>
  );
}

/**
 * Closing freezes the amounts and carries the balance forward — and it is the last moment a
 * missing receipt can be caught, which is why this is the one place the system pushes back. It
 * names the lines rather than showing a generic warning: an acknowledgement that doesn't say
 * what was accepted says nothing.
 */
function CloseBlock({
  accountId,
  period,
  missingEvidence,
  closingBalanceDisplay,
}: {
  accountId: string;
  period: {
    id: string;
    label: string;
    status: "OPEN" | "SUBMITTED" | "CLOSED";
  };
  missingEvidence: MissingLine[];
  closingBalanceDisplay: string;
}) {
  return (
    <div>
      <h3 className="text-[12.5px] font-semibold text-navy-700">Close {period.label}</h3>
      <p className="mt-1 text-[12.5px] text-muted">
        Amounts, dates and categories are locked. The closing balance of{" "}
        <b className="text-ink">{closingBalanceDisplay}</b> carries into the next period. Receipts can still
        be attached afterwards — they change no figure.
      </p>

      {missingEvidence.length > 0 ? (
        <div className="mt-3 rounded-lg border border-gold-300 bg-gold-50 p-3">
          <p className="text-[12px] font-bold text-gold-800">
            {missingEvidence.length} {missingEvidence.length === 1 ? "line has" : "lines have"} no receipt
          </p>
          <ul className="mt-1.5 list-disc pl-4 text-[12px] text-ink">
            {missingEvidence.map((l) => (
              <li key={l.id}>
                {formatDate(l.datePaid)} · {l.description} · {formatEGP2(l.amount)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form action={closePeriod} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="periodId" value={period.id} />
        {missingEvidence.length > 0 ? (
          <>
            <label className="flex items-start gap-2 text-[12.5px] text-ink">
              <input
                type="checkbox"
                name="acknowledgeMissing"
                value="yes"
                className="mt-0.5 h-4 w-4 rounded border-navy-500"
              />
              <span>
                I'm closing with{" "}
                {missingEvidence.length === 1 ? "this receipt" : `these ${missingEvidence.length} receipts`}{" "}
                missing. This is recorded against my name.
              </span>
            </label>
            <input type="text" name="ackNote" placeholder="Why (optional)" className={INPUT} />
          </>
        ) : null}
        <PendingSubmitButton
          pendingLabel="Closing…"
          className="w-fit rounded-lg bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-900"
        >
          Close the period
        </PendingSubmitButton>
      </form>
    </div>
  );
}

function ReopenBlock({ accountId, period }: { accountId: string; period: { id: string; label: string } }) {
  return (
    <div>
      <h3 className="text-[12.5px] font-semibold text-navy-700">{period.label} is closed</h3>
      <p className="mt-1 text-[12.5px] text-muted">
        Reopening changes figures that were already signed off, so it needs a reason and is recorded.
      </p>
      <form action={reopenPeriod} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="periodId" value={period.id} />
        <input
          type="text"
          name="reason"
          required
          placeholder="Why is this being reopened?"
          className={INPUT}
        />
        <PendingSubmitButton
          pendingLabel="Reopening…"
          className="w-fit rounded-lg border border-navy-200 px-3.5 py-2 text-[12.5px] font-semibold text-navy-700 hover:bg-navy-50"
        >
          Reopen it
        </PendingSubmitButton>
      </form>
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] text-ink focus:border-navy-500 focus:outline-none";
const LABEL = "text-[11.5px] font-semibold text-navy-700";
