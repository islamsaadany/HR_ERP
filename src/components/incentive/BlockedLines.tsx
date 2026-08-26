import Link from "next/link";
import { KIND_LABEL, type BlockedReason, type PayoutLine } from "@/lib/incentive/payouts";

/**
 * The lines that cannot be released, each saying WHICH of the four things is wrong.
 *
 * Grouped, shown and refused — never guessed at. Guessing who a name is means guessing
 * whose bank account the money leaves from.
 */
const WHY: Record<BlockedReason, (l: PayoutLine) => string> = {
  NO_EMPLOYEE_ID: () => "No Employee ID in the People sheet",
  NO_SUCH_EMPLOYEE: (l) => `No active employee holds ${l.employeeId}`,
  AMBIGUOUS: (l) =>
    `${l.candidates.length} accounts hold ${l.employeeId} — ${l.candidates
      .map((c) => `${c.name}${c.businessUnitName ? ` (${c.businessUnitName})` : ""}`)
      .join(" and ")}`,
  NO_BUSINESS_UNIT: (l) => `${l.matchedName ?? "That employee"} has no business unit, so no account pays it`,
};

const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BlockedLines({ lines, cycleId }: { lines: PayoutLine[]; cycleId: string }) {
  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-amber-300 bg-surface">
      <div className="flex flex-wrap items-center gap-2 bg-amber-50 px-4 py-3">
        <span className="font-serif text-lg text-ink">
          {lines.length} payment{lines.length === 1 ? "" : "s"} can&rsquo;t be released yet
        </span>
        <span className="text-xs text-amber-800">each line says what is wrong</span>
      </div>
      <div className="px-4 py-3">
        <p className="mb-3 text-xs text-muted">
          A payment is matched to an employee by <strong className="text-ink">Employee ID</strong>, because
          that is what says which unit&rsquo;s account pays it and who confirms it. Fix the ID in the
          cycle&rsquo;s{" "}
          <Link href={`/incentive/${cycleId}`} className="font-semibold text-navy-700 hover:underline">
            People table
          </Link>{" "}
          and press Recalculate.
        </p>
        <div className="ff-hscroll rounded-lg border border-line">
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Name in the sheet</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Employee ID</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">For</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Amount</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Why not</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => (
                <tr key={l.key}>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-ink">{l.personName}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-muted">{l.employeeId ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-ink">{KIND_LABEL[l.kind]}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-ink">{m(l.amount)}</td>
                  <td className="px-3 py-2 text-sm text-muted">{WHY[l.blocked!](l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
