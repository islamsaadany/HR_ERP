import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { describeBatch } from "@/lib/finance/batches";
import { formatEGP2, formatDate } from "@/lib/labels";
import { WaitingCard, type WaitingRow } from "@/components/confirmations/WaitingCard";

/**
 * The confirmer's whole screen (spec 041), as a tab on Finance → Payments since 2026-09-08.
 *
 * It was its own route, `/confirmations`, with its own sidebar entry — spec 041's R4 chose that so
 * the confirmer never had to enter Finance's workspace. The CEO, who IS the confirmer, asked for the
 * opposite: "it can be part of the payments panel as a subtab for me to go and confirm through."
 * So the screen moved and nothing on it changed: what is waiting, what it totals, and a way in.
 *
 * Server component: it loads its own rows so the Payments page does not have to know how the
 * confirmer's list is scoped. The scope rule is the one the old page had — only the units this
 * person is appointed for, or everything for a Super User holding no appointment, which is how
 * they see there is something to appoint somebody for (`canDecide` still refuses per unit).
 */
export async function ConfirmationsPanel({
  myUnitIds,
  isSuperUser,
}: {
  myUnitIds: string[];
  isSuperUser: boolean;
}) {
  const unitScope = isSuperUser && myUnitIds.length === 0 ? {} : { businessUnitId: { in: myUnitIds } };

  const [waiting, recent] = await Promise.all([
    prisma.paymentBatch.findMany({
      where: { status: "SUBMITTED", ...unitScope },
      include: {
        submittedBy: { select: { name: true } },
        businessUnit: { select: { name: true } },
      },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.paymentBatch.findMany({
      where: { status: { in: ["COMPLETE", "RETURNED"] }, ...unitScope },
      include: { decidedBy: { select: { name: true } }, businessUnit: { select: { name: true } } },
      orderBy: { decidedAt: "desc" },
      take: 6,
    }),
  ]);

  const now = Date.now();
  const rows: WaitingRow[] = waiting.map((b) => {
    const total = formatEGP2(b.totalAmount);
    return {
      id: b.id,
      reference: b.reference,
      summary: describeBatch(
        { type: b.type, itemCount: b.itemCount, salaryMonth: b.salaryMonth, headcount: b.headcount },
        total,
      ),
      total,
      isSalary: b.type === "SALARY",
      submittedBy: b.submittedBy?.name ?? "Finance",
      submittedOn: formatDate(b.submittedAt),
      valueDate: formatDate(b.valueDate),
      // Whole days, floored: "waiting 2 days" should not appear until two have actually passed.
      waitingDays: Math.floor((now - b.submittedAt.getTime()) / 86_400_000),
      itemCount: b.itemCount,
      headcount: b.headcount,
      businessUnitName: b.businessUnit?.name ?? "—",
    };
  });

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Waiting on you</p>
      <p className="mt-1 max-w-[72ch] text-muted">
        Finance created these in the bank. Confirm them there, then mark them complete here — that is
        what tells the person they have been paid. You only ever see the business units you were
        appointed for.
      </p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          Nothing is waiting for you.
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {rows.map((r) => (
            <WaitingCard key={r.id} row={r} />
          ))}
        </div>
      )}

      {recent.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[12.5px] font-bold uppercase tracking-[0.09em] text-muted">Recently decided</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {recent.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                <Link href={`/finance/confirmations/${b.id}`} className="font-semibold text-navy-700 hover:underline">
                  {b.reference}
                </Link>
                <span>
                  {b.businessUnit?.name ?? "—"} ·{" "}
                  {b.itemCount === 0 ? "salaries" : `${b.itemCount} transactions`} · {formatEGP2(b.totalAmount)} ·{" "}
                  {b.decidedAt ? formatDate(b.decidedAt) : "—"}
                  {b.decidedBy?.name ? ` · ${b.decidedBy.name}` : ""}
                </span>
                <span
                  className={
                    "rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                    (b.status === "COMPLETE"
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700")
                  }
                >
                  {b.status === "COMPLETE" ? "Complete" : "Returned"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
