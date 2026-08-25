import Link from "next/link";

export type WaitingRow = {
  id: string;
  reference: string;
  summary: string;
  total: string;
  isSalary: boolean;
  submittedBy: string;
  submittedOn: string;
  valueDate: string;
  waitingDays: number;
  itemCount: number;
  headcount: number | null;
};

/**
 * One thing waiting on the confirmer (spec 041).
 *
 * The amount is the largest thing on the card because it is what he is deciding about. The age
 * chip is gold — somebody is waiting — and reads "today" until a full day has passed, so it never
 * arrives as a reproach the moment Finance submits.
 */
export function WaitingCard({ row }: { row: WaitingRow }) {
  const age =
    row.waitingDays <= 0
      ? "Waiting today"
      : row.waitingDays === 1
        ? "Waiting since yesterday"
        : `Waiting ${row.waitingDays} days`;

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-b from-[#fbfaf7] to-surface px-5 py-4">
        <div>
          <span className="rounded-full border border-gold-300 bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-800">
            {age}
          </span>
          <p className="mt-2 text-[13.5px] font-semibold text-ink">{row.summary}</p>
          <p className="mt-1 text-[12px] text-muted">
            Created by {row.submittedBy} on {row.submittedOn} · value date {row.valueDate} · ref{" "}
            {row.reference}
          </p>
        </div>
        <p className="font-serif text-3xl tabular-nums text-ink">{row.total}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-[#fbfaf7] px-5 py-3">
        <Link
          href={`/confirmations/${row.id}`}
          className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900"
        >
          Open
        </Link>
        <span className="ml-auto text-[12px] text-muted">
          {row.isSalary
            ? `${row.headcount ?? 0} people`
            : `${row.itemCount} ${row.itemCount === 1 ? "transaction" : "transactions"}`}
        </span>
      </div>
    </article>
  );
}
