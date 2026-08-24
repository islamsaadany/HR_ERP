import { formatEGP2 } from "@/lib/labels";
import { fromPiastres } from "@/lib/finance/money";
import { describeBalance, describeBudget, type PeriodFigures } from "@/lib/finance/pettycash";

/**
 * Where an account stands, for one period (spec 040).
 *
 * This component computes NOTHING. Every figure arrives from `lib/finance/pettycash.ts`, which
 * is the only place the arithmetic exists — including the sentence under the headline number,
 * because the direction of "who owes whom" is exactly what the workbook this replaces gets
 * wrong (its March tab prints +3,444.54 and its JUL-AUG tab −4,617.16 for the same situation).
 */
export function ReconciliationPanel({
  figures,
  custodianName,
  counts,
  showBudget = true,
}: {
  figures: PeriodFigures;
  custodianName: string | null;
  counts: { fundings: number; floatLines: number; companyLines: number };
  /** The custodian sees the budget too — the person spending is the person who can stop. */
  showBudget?: boolean;
}) {
  const money = (piastres: number) => formatEGP2(fromPiastres(piastres));
  const balance = describeBalance(figures.closingBalance, custodianName, "Forefront", (egp) =>
    egp.toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );
  const budget = describeBudget(figures);

  return (
    <section
      className="mt-5 overflow-hidden rounded-xl border border-line bg-surface"
      aria-label="Where this account stands"
    >
      <div className="bg-navy-800 px-5 py-4 text-white">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-gold-300">
          Where this stands
        </p>
        <p className="mt-1.5 font-serif text-3xl tabular-nums">{money(balance.magnitudePiastres)}</p>
        <p className="mt-1 text-[13.5px] text-navy-100">{balance.sentence}</p>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-5">
        <Cell
          label="Opening balance"
          value={money(figures.openingBalance)}
          negative={figures.openingBalance < 0}
          note="carried from the last period"
        />
        <Cell
          label="Float advanced"
          value={money(figures.floatAdvanced)}
          note={`${counts.fundings} ${counts.fundings === 1 ? "entry" : "entries"}`}
        />
        <Cell
          label="Spent from float"
          value={money(figures.spentFromFloat)}
          note={`${counts.floatLines} ${counts.floatLines === 1 ? "line" : "lines"}`}
        />
        <Cell
          label="Paid by company"
          value={money(figures.spentByCompany)}
          note={
            counts.companyLines === 0
              ? "none"
              : `${counts.companyLines} ${counts.companyLines === 1 ? "transfer" : "transfers"} · not ${custodianName?.split(" ")[0] ?? "their"}'s money`
          }
        />
        {showBudget ? (
          <Cell
            label="Budget remaining"
            value={figures.budgetRemaining === null ? "—" : money(figures.budgetRemaining)}
            negative={(figures.budgetRemaining ?? 0) < 0}
            note={
              figures.budget === null
                ? "no budget set"
                : `${budget.sentence.toLowerCase()} · ${money(figures.budget)} set`
            }
          />
        ) : (
          <Cell
            label="Total expenses"
            value={money(figures.totalExpenses)}
            note="float + company transfers"
          />
        )}
      </dl>
    </section>
  );
}

function Cell({
  label,
  value,
  note,
  negative = false,
}: {
  label: string;
  value: string;
  note?: string;
  negative?: boolean;
}) {
  return (
    <div className="border-t border-line px-4 py-3 md:border-r md:last:border-r-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd className={`mt-1 text-base font-semibold tabular-nums ${negative ? "text-red-700" : "text-ink"}`}>
        {value}
      </dd>
      {note ? <p className="mt-0.5 text-[11px] text-muted">{note}</p> : null}
    </div>
  );
}
