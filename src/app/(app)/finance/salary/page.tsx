import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { canSeeSalaryRuns, canSubmitTransactions } from "@/lib/finance/access";
import { canConfirmBatches, hasAnyConfirmer } from "@/lib/finance/confirmers";
import { formatEGP2, formatDate, toDateInput } from "@/lib/labels";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ACCEPT_ATTRIBUTE } from "@/lib/finance/evidence";
import { submitSalaryRun } from "@/app/(app)/finance/batch-actions";

export const dynamic = "force-dynamic";

/**
 * The monthly salary run (spec 041).
 *
 * Four figures and a reference. There is no field for an individual's pay, which is how the
 * promise "no per-person salary is stored or shown" is kept — not by remembering, but because
 * there is nowhere to put one.
 *
 * HR Admin cannot reach this page: a payroll total is not theirs to see.
 */
export default async function SalaryRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const isConfirmer = await canConfirmBatches(user.id);
  if (!canSeeSalaryRuns(user.role, isConfirmer)) redirect("/dashboard");
  const canSubmit = canSubmitTransactions(user.role);
  const { ok, error } = await searchParams;

  const [runs, anyConfirmer] = await Promise.all([
    prisma.paymentBatch.findMany({
      where: { type: "SALARY" },
      include: { submittedBy: { select: { name: true } }, decidedBy: { select: { name: true } } },
      orderBy: [{ salaryMonth: "desc" }, { submittedAt: "desc" }],
      take: 24,
    }),
    hasAnyConfirmer(),
  ]);

  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <div>
      <AutoRefresh />
      <Link href="/finance" className="text-[12.5px] font-semibold text-navy-700 hover:underline">
        ← Payments
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Finance · Salaries</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Monthly salary runs</h1>
      <p className="mt-1 max-w-[72ch] text-muted">
        After you have created the payroll transactions in the bank. Nothing here identifies anyone —
        the month, the total, how many people, and the bank reference.
      </p>

      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">✓ {ok}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {canSubmit && !anyConfirmer ? (
        <p className="mt-4 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          Nobody is appointed to confirm transactions yet, so a run submitted now will sit here until
          somebody is. A Super User can appoint someone under Admin.
        </p>
      ) : null}

      {canSubmit ? (
        <details className="mt-6 rounded-xl border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-navy-800 [&::-webkit-details-marker]:hidden">
            <span aria-hidden>+</span> Submit the monthly run
          </summary>
          <form action={submitSalaryRun} className="grid gap-4 border-t border-line p-4 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Month</span>
              <input type="month" name="salaryMonth" required defaultValue={thisMonth} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Total transferred (EGP)</span>
              <input type="text" name="totalAmount" required inputMode="decimal" placeholder="89000.00" className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>How many people</span>
              <input type="text" name="headcount" required inputMode="numeric" placeholder="5" className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Bank reference</span>
              <input type="text" name="bankReference" placeholder="NBE-SAL-0826" className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Value date at the bank</span>
              <input type="date" name="valueDate" defaultValue={toDateInput(new Date())} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>
                The bank&apos;s file <span className="font-normal text-muted">(optional)</span>
              </span>
              <input type="file" name="attachment" accept={ACCEPT_ATTRIBUTE} className={FILE} />
              <span className="text-[11px] text-muted">
                Kept private — Finance, the confirmer and top-level access only.
              </span>
            </label>
            <div className="md:col-span-2">
              <label className="flex items-start gap-2 text-[12.5px] text-ink">
                <input type="checkbox" name="isExtraRun" value="yes" className="mt-0.5 h-4 w-4 rounded border-navy-500" />
                <span>This is a second run for that month</span>
              </label>
              <input
                type="text"
                name="extraRunReason"
                placeholder="Why? (required for a second run)"
                className={`${INPUT} mt-2`}
              />
              <p className="mt-1.5 text-[11.5px] text-muted">
                A month can only be submitted once, so nobody pays it twice by accident.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 md:col-span-2">
              <span className="text-[12px] text-muted">Nothing here identifies anyone.</span>
              <PendingSubmitButton
                pendingLabel="Submitting…"
                className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900"
              >
                Submit for confirmation
              </PendingSubmitButton>
            </div>
          </form>
        </details>
      ) : null}

      {runs.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          No salary runs yet.
        </div>
      ) : (
        <div className="ff-data-scroll mt-6 rounded-xl border border-line bg-surface">
          <table className="ff-data-table text-sm">
            <thead>
              <tr>
                <th className="px-3 py-3 text-left font-medium">Month</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-3 py-3 text-right font-medium">People</th>
                <th className="px-3 py-3 text-left font-medium">Reference</th>
                <th className="px-3 py-3 text-left font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 font-medium text-ink">
                    {r.salaryMonth
                      ? r.salaryMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
                      : "—"}
                    {r.isExtraRun ? (
                      <span className="ml-2 rounded-full border border-gold-300 bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-800">
                        Extra run
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{formatEGP2(r.totalAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{r.headcount ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{r.bankReference ?? r.reference}</td>
                  <td className="px-3 py-2 text-muted">
                    {r.status === "COMPLETE"
                      ? `Complete · ${r.decidedAt ? formatDate(r.decidedAt) : ""}`
                      : r.status === "SUBMITTED"
                        ? "Awaiting confirmation"
                        : r.status === "RETURNED"
                          ? "Returned"
                          : "Withdrawn"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";
const LABEL = "text-[11.5px] font-semibold text-navy-700";
const FILE =
  "rounded-lg border border-dashed border-navy-200 bg-paper px-3 py-2.5 text-[12.5px] text-muted file:mr-3 file:rounded-md file:border file:border-navy-200 file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-navy-700";
