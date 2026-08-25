import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, isSuperUser } from "@/lib/roles";
import { confirmableUnitIds } from "@/lib/finance/confirmers";
import { canDecide, describeBatch } from "@/lib/finance/batches";
import { formatEGP2, formatDate } from "@/lib/labels";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { markComplete, returnToFinance } from "@/app/(app)/confirmations/actions";

export const dynamic = "force-dynamic";

/**
 * What is actually in front of the confirmer before he decides (spec 041): who is being paid, what
 * for, how much, and the receipt. Nothing here can change while it waits on him — that is what
 * makes the total he was emailed the total he confirms.
 */
export default async function ConfirmationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const myUnits = await confirmableUnitIds(user.id);
  if (myUnits.length === 0 && !isSuperUser(user.role)) redirect("/dashboard");

  const { id } = await params;
  const { error } = await searchParams;

  const batch = await prisma.paymentBatch.findUnique({
    where: { id },
    include: {
      submittedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      businessUnit: { select: { name: true } },
      items: {
        include: {
          paybackRequest: { select: { evidence: { select: { id: true, fileName: true } } } },
          benefitClaim: { select: { proofUrl: true, id: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!batch) notFound();

  const total = formatEGP2(batch.totalAmount);
  const summary = describeBatch(
    { type: batch.type, itemCount: batch.itemCount, salaryMonth: batch.salaryMonth, headcount: batch.headcount },
    total,
  );
  const decision = canDecide(
    {
      status: batch.status,
      submittedById: batch.submittedById,
      businessUnitId: batch.businessUnitId,
    },
    { id: user.id, confirmableUnitIds: myUnits, isSuperUser: isSuperUser(user.role) },
  );

  return (
    <div>
      <AutoRefresh />
      <Link href="/confirmations" className="text-[12.5px] font-semibold text-navy-700 hover:underline">
        ← Everything waiting
      </Link>

      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        {batch.reference} · created by {batch.submittedBy?.name ?? "Finance"}
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">{summary}</h1>
      <p className="mt-1 text-muted">
        Value date {formatDate(batch.valueDate)}
        {batch.bankReference ? ` · bank reference ${batch.bankReference}` : ""} · submitted{" "}
        {formatDate(batch.submittedAt)}
      </p>
      {batch.note ? (
        <p className="mt-3 rounded-lg border border-line bg-paper px-4 py-3 text-[12.5px] text-ink">
          {batch.note}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {batch.type === "SALARY" ? (
        <section className="mt-6 rounded-xl border border-line bg-surface p-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="Month" value={batch.salaryMonth ? formatDate(batch.salaryMonth) : "—"} />
            <Figure label="Total" value={total} />
            <Figure label="People" value={String(batch.headcount ?? 0)} />
            <Figure label="Reference" value={batch.bankReference ?? "—"} />
          </dl>
          {batch.isExtraRun ? (
            <p className="mt-4 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-[12.5px] text-gold-800">
              Second run for this month — {batch.extraRunReason}
            </p>
          ) : null}
          {batch.attachmentUrl ? (
            <p className="mt-4 text-[12.5px]">
              <a
                href={`/api/salary-run/${batch.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-navy-700 underline underline-offset-2"
              >
                {batch.attachmentName ?? "The bank's file"}
              </a>
            </p>
          ) : null}
          <p className="mt-4 text-[11.5px] text-muted">
            No individual&apos;s salary is held anywhere in this record — only the four figures above.
          </p>
        </section>
      ) : (
        <div className="ff-data-scroll mt-6 rounded-xl border border-line bg-surface">
          <table className="ff-data-table text-sm">
            <thead>
              <tr>
                <th className="px-3 py-3 text-left font-medium">Paying</th>
                <th className="px-3 py-3 text-left font-medium">For</th>
                <th className="px-3 py-3 text-left font-medium">Receipt</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {batch.items.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 font-medium text-ink">{i.payeeName}</td>
                  <td className="px-3 py-2 text-muted">{i.purpose}</td>
                  <td className="px-3 py-2">
                    {i.paybackRequest?.evidence.length ? (
                      <span className="flex flex-col gap-0.5">
                        {i.paybackRequest.evidence.map((e) => (
                          <a
                            key={e.id}
                            href={`/api/expense-evidence/${e.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11.5px] font-medium text-navy-700 underline underline-offset-2"
                          >
                            {e.fileName}
                          </a>
                        ))}
                      </span>
                    ) : i.benefitClaim?.proofUrl ? (
                      <a
                        href={`/api/claims/${i.benefitClaim.id}/proof`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11.5px] font-medium text-navy-700 underline underline-offset-2"
                      >
                        Proof of payment
                      </a>
                    ) : (
                      <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">
                        {i.pettyCashFundingId ? "Float" : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">
                    {formatEGP2(i.amountAtSubmission)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-navy-50">
                <td className="px-3 py-3 font-semibold text-ink" colSpan={3}>
                  Total created in the bank
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">{total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {batch.status === "SUBMITTED" ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[46ch] text-[12px] text-muted">
            This total was fixed when Finance submitted it — it cannot change while it is with you.
          </p>
          {decision.ok ? (
            <div className="flex flex-wrap items-center gap-2">
              <details>
                <summary className="w-fit cursor-pointer list-none rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-semibold text-muted [&::-webkit-details-marker]:hidden">
                  Return to Finance…
                </summary>
                <form action={returnToFinance} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={batch.id} />
                  <input
                    type="text"
                    name="note"
                    required
                    placeholder="What should they fix?"
                    className="w-72 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px]"
                  />
                  <PendingSubmitButton
                    pendingLabel="Sending…"
                    className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-semibold text-muted"
                  >
                    Return it
                  </PendingSubmitButton>
                </form>
              </details>
              <form action={markComplete}>
                <input type="hidden" name="id" value={batch.id} />
                <PendingSubmitButton
                  pendingLabel="Recording…"
                  className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900"
                >
                  Transaction complete
                </PendingSubmitButton>
              </form>
            </div>
          ) : (
            <p className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-[12.5px] text-gold-800">
              {decision.reason}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-6 rounded-lg border border-line bg-paper px-4 py-3 text-[12.5px] text-muted">
          {batch.status === "COMPLETE"
            ? `Complete — confirmed by ${batch.decidedBy?.name ?? "—"} on ${batch.decidedAt ? formatDate(batch.decidedAt) : "—"}. Everyone in it was told then.`
            : batch.status === "RETURNED"
              ? `Returned to Finance${batch.decisionNote ? ` — “${batch.decisionNote}”` : ""}. Nobody was told they were paid.`
              : `Withdrawn by Finance${batch.decisionNote ? ` — “${batch.decisionNote}”` : ""}.`}
        </p>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
