import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { toDateInput } from "@/lib/labels";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ACCEPT_ATTRIBUTE, LIMITS_HINT } from "@/lib/finance/evidence";
import { MyRequests, type MyRequestRow } from "@/components/payback/MyRequests";
import { submitRequest } from "@/app/(app)/payback/actions";

export const dynamic = "force-dynamic";

/**
 * Ask for your money back (spec 040).
 *
 * Open to everyone — a custodian's own overspend is settled through petty cash reconciliation,
 * but everyone else needs somewhere to send a receipt. A person sees only their own requests.
 */
export default async function PaybackPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { ok, error } = await searchParams;

  const [requests, categories] = await Promise.all([
    prisma.paybackRequest.findMany({
      where: { userId: user.id },
      include: {
        category: { select: { name: true } },
        decidedBy: { select: { name: true } },
        _count: { select: { evidence: true } },
      },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.expenseCategory.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }),
  ]);

  const rows: MyRequestRow[] = requests.map((r) => ({
    id: r.id,
    amount: r.amount.toString(),
    datePaid: r.datePaid,
    submittedAt: r.submittedAt,
    description: r.description,
    category: r.category?.name ?? null,
    status: r.status,
    decisionReason: r.decisionReason,
    decidedBy: r.decidedBy?.name ?? null,
    transferDate: r.transferDate,
    amountTransferred: r.amountTransferred?.toString() ?? null,
    evidenceCount: r._count.evidence,
  }));

  return (
    <div>
      <AutoRefresh />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">My money</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Payback requests</h1>
      <p className="mt-1 max-w-[72ch] text-muted">
        Paid for something with your own money? Send Finance the receipt and they&apos;ll transfer it
        back.
      </p>

      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">✓ {ok}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <details className="mt-6 rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-navy-800 [&::-webkit-details-marker]:hidden">
          <span aria-hidden>+</span> Request a payback
        </summary>
        <form action={submitRequest} className="grid gap-4 border-t border-line p-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Amount you paid (EGP)</span>
            <input type="text" name="amount" required inputMode="decimal" placeholder="262.83" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Date you paid</span>
            <input type="date" name="datePaid" required defaultValue={toDateInput(new Date())} className={INPUT} />
          </label>
          <div className="md:col-span-2">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>What was it for?</span>
              <input
                type="text"
                name="description"
                required
                maxLength={500}
                placeholder="Uber to collect the laptop"
                className={INPUT}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>
              Category <span className="font-normal text-muted">(optional)</span>
            </span>
            <select name="categoryId" defaultValue="" className={INPUT}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>
              Paid to <span className="font-normal text-muted">(optional)</span>
            </span>
            <input type="text" name="payee" maxLength={200} placeholder="Uber" className={INPUT} />
          </label>
          <div className="md:col-span-2">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Receipt</span>
              <input
                type="file"
                name="files"
                multiple
                required
                accept={ACCEPT_ATTRIBUTE}
                className="rounded-lg border border-dashed border-navy-200 bg-paper px-3 py-3 text-[12.5px] text-muted file:mr-3 file:rounded-md file:border file:border-navy-200 file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-navy-700"
              />
              <span className="text-[11px] text-muted">{LIMITS_HINT}</span>
            </label>
            <p className="mt-1.5 text-[11.5px] text-muted">
              A receipt is required — Finance can&apos;t approve a payback without one.
            </p>
          </div>
          <div className="flex justify-end md:col-span-2">
            <PendingSubmitButton
              pendingLabel="Sending…"
              className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900"
            >
              Send to Finance
            </PendingSubmitButton>
          </div>
        </form>
      </details>

      <MyRequests rows={rows} />
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";
const LABEL = "text-[11.5px] font-semibold text-navy-700";
