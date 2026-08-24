import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, isSuperUser } from "@/lib/roles";
import { canConfirmBatches } from "@/lib/finance/confirmers";
import { describeBatch } from "@/lib/finance/batches";
import { formatEGP2, formatDate } from "@/lib/labels";
import { AutoRefresh } from "@/components/AutoRefresh";
import { WaitingCard, type WaitingRow } from "@/components/confirmations/WaitingCard";

export const dynamic = "force-dynamic";

/**
 * The confirmer's whole screen (spec 040).
 *
 * Deliberately its own small surface rather than a tab inside Finance: he is not a Finance user,
 * the email links straight here, and the job is meant to take ten seconds. What is waiting, what it
 * totals, and a way in — nothing else.
 */
export default async function ConfirmationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const isConfirmer = await canConfirmBatches(user.id);
  if (!isConfirmer && !isSuperUser(user.role)) redirect("/dashboard");
  const { ok, error } = await searchParams;

  const [waiting, recent] = await Promise.all([
    prisma.paymentBatch.findMany({
      where: { status: "SUBMITTED" },
      include: { submittedBy: { select: { name: true } } },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.paymentBatch.findMany({
      where: { status: { in: ["COMPLETE", "RETURNED"] } },
      include: { decidedBy: { select: { name: true } } },
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
    };
  });

  return (
    <div>
      <AutoRefresh />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Waiting on you</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Confirmations</h1>
      <p className="mt-1 max-w-[72ch] text-muted">
        Finance created these in the bank. Confirm them there, then mark them complete here — that is
        what tells the person they have been paid.
      </p>

      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">✓ {ok}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

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
                <Link href={`/confirmations/${b.id}`} className="font-semibold text-navy-700 hover:underline">
                  {b.reference}
                </Link>
                <span>
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
    </div>
  );
}
