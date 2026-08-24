import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { canSeePettyCashAccount, canManagePettyCash, canWritePettyCashLine } from "@/lib/finance/access";
import { periodFiguresFor, linesMissingEvidence } from "@/lib/finance/queries";
import { describeBalance, isOutsidePeriodWindow } from "@/lib/finance/pettycash";
import { fromPiastres } from "@/lib/finance/money";
import { formatEGP2, formatDate } from "@/lib/labels";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ReconciliationPanel } from "@/components/pettycash/ReconciliationPanel";
import { LineTable, type LineRow } from "@/components/pettycash/LineTable";
import { LineForm } from "@/components/pettycash/LineForm";
import { FinancePanel, type FundingRow } from "@/components/pettycash/FinancePanel";
import { submitPeriod } from "@/app/(app)/petty-cash/actions";

export const dynamic = "force-dynamic";

/**
 * One petty cash account, one period at a time (spec 040).
 *
 * The custodian and Finance look at exactly this screen. That is deliberate: when they disagree
 * about a figure, they are disagreeing about a receipt, not about arithmetic.
 */
export default async function PettyCashAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ period?: string; ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { accountId } = await params;
  const { period: periodParam, ok, error } = await searchParams;

  const account = await prisma.pettyCashAccount.findUnique({
    where: { id: accountId },
    include: {
      custodian: { select: { id: true, name: true, status: true } },
      periods: {
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          label: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });
  if (!account) notFound();
  if (!canSeePettyCashAccount(user, account)) redirect("/dashboard");

  const manager = canManagePettyCash(user.role);
  const selected =
    account.periods.find((p) => p.id === periodParam) ??
    account.periods.find((p) => p.status !== "CLOSED") ??
    account.periods[0] ??
    null;

  const figures = selected ? await periodFiguresFor(selected.id) : null;
  const missing = selected ? await linesMissingEvidence(selected.id) : [];

  const [lines, fundings] = selected
    ? await Promise.all([
        prisma.pettyCashLine.findMany({
          where: { periodId: selected.id },
          include: {
            section: { select: { name: true } },
            category: { select: { name: true } },
            evidence: { select: { id: true, fileName: true } },
          },
          orderBy: [{ datePaid: "asc" }, { createdAt: "asc" }],
        }),
        prisma.pettyCashFunding.findMany({
          where: { periodId: selected.id },
          include: { recordedBy: { select: { name: true } } },
          orderBy: { date: "asc" },
        }),
      ])
    : [[], []];

  const canWrite = selected ? canWritePettyCashLine(user, account, selected) : false;
  const isCustodian = account.custodianId === user.id;

  const lineRows: LineRow[] = lines.map((l) => ({
    id: l.id,
    datePaid: l.datePaid,
    section: l.section.name,
    category: l.category?.name ?? null,
    description: l.description,
    method: l.method,
    paymentDetails: l.paymentDetails,
    payee: l.payee,
    amount: l.amount.toString(),
    evidence: l.evidence,
    outsideWindow: selected ? isOutsidePeriodWindow(l.datePaid, selected) : false,
  }));

  const fundingRows: FundingRow[] = fundings.map((f) => ({
    id: f.id,
    type: f.type,
    date: f.date,
    amount: f.amount.toString(),
    reference: f.reference,
    note: f.note,
    recordedBy: f.recordedBy?.name ?? null,
    locked: selected?.status === "CLOSED",
  }));

  const [sections, categories] = await Promise.all([
    prisma.expenseSection.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.expenseCategory.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const closingDisplay = figures
    ? formatEGP2(fromPiastres(Math.abs(figures.closingBalance))) +
      (figures.closingBalance < 0 ? " owed to the custodian" : "")
    : "—";

  return (
    <div>
      <AutoRefresh />
      <Link href="/petty-cash" className="text-[12.5px] font-semibold text-navy-700 hover:underline">
        ← All petty cash
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
            Petty cash · {account.custodian.name ?? "no custodian"}
          </p>
          <h1 className="mt-1 font-serif text-3xl text-ink">{account.name}</h1>
        </div>
        {account.periods.length > 1 ? (
          <nav className="flex flex-wrap gap-1.5" aria-label="Periods">
            {account.periods.slice(0, 8).map((p) => (
              <Link
                key={p.id}
                href={`/petty-cash/${account.id}?period=${p.id}`}
                aria-current={p.id === selected?.id ? "page" : undefined}
                className={
                  "rounded-lg border px-2.5 py-1 text-[12px] font-semibold " +
                  (p.id === selected?.id
                    ? "border-navy-800 bg-navy-800 text-white"
                    : "border-navy-200 text-navy-700 hover:bg-navy-50")
                }
              >
                {p.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {account.custodian.status !== "ACTIVE" ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-800"
        >
          {account.custodian.name ?? "The custodian"} is no longer an active employee. Finance must name a
          new custodian before anything else can be logged here.
        </p>
      ) : null}
      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">✓ {ok}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {selected === null || figures === null ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          No periods yet.
          {manager ? " Open one below to start logging spend." : " Finance needs to open one."}
        </div>
      ) : (
        <>
          <ReconciliationPanel
            figures={figures}
            custodianName={account.custodian.name}
            counts={{
              fundings: fundings.length,
              floatLines: lines.filter((l) => l.method === "FLOAT").length,
              companyLines: lines.filter((l) => l.method === "COMPANY_TRANSFER").length,
            }}
          />

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-muted">
              <b className="text-ink">
                {selected.label} · {formatDate(selected.startDate)} – {formatDate(selected.endDate)}
              </b>
              {missing.length > 0 ? ` · ${missing.length} with no receipt` : null}
            </p>
            {selected.status === "OPEN" && isCustodian ? (
              <form action={submitPeriod}>
                <input type="hidden" name="periodId" value={selected.id} />
                <PendingSubmitButton
                  pendingLabel="Sending…"
                  className="rounded-lg border border-navy-200 px-3.5 py-2 text-[12.5px] font-semibold text-navy-700 hover:bg-navy-50"
                >
                  Send to Finance
                </PendingSubmitButton>
              </form>
            ) : null}
          </div>

          {canWrite ? (
            <LineForm
              periodId={selected.id}
              sections={sections}
              categories={categories}
              defaultDate={new Date()}
            />
          ) : (
            <p className="mt-5 rounded-lg border border-line bg-paper px-4 py-3 text-[12.5px] text-muted">
              {selected.status === "CLOSED"
                ? "This period is closed. Receipts can still be attached — they change no figure — but amounts are fixed."
                : "This period is with Finance for review, so it can't be changed here."}
            </p>
          )}

          <LineTable
            rows={lineRows}
            canWrite={canWrite}
            total={formatEGP2(fromPiastres(figures.totalExpenses))}
          />

          {manager ? (
            <FinancePanel
              accountId={account.id}
              period={selected}
              fundings={fundingRows}
              missingEvidence={missing.map((m) => ({
                id: m.id,
                datePaid: m.datePaid,
                description: m.description,
                amount: m.amount.toString(),
              }))}
              closingBalanceDisplay={closingDisplay}
            />
          ) : null}
        </>
      )}

      {manager && selected === null ? (
        <FinancePanel
          accountId={account.id}
          period={null}
          fundings={[]}
          missingEvidence={[]}
          closingBalanceDisplay="—"
        />
      ) : null}

      {figures ? (
        <p className="mt-6 text-[11.5px] text-muted">
          {describeBalance(figures.closingBalance, account.custodian.name).sentence}. Every figure on this
          page is derived from the lines and funding entries above — nothing is stored separately.
        </p>
      ) : null}
    </div>
  );
}
