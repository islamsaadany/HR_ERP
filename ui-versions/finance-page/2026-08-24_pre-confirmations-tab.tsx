import Link from "next/link";
import { requireFinance } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate, toDateInput } from "@/lib/labels";
import { PaymentsQueue, type PaymentRow } from "@/components/finance/PaymentsQueue";
import { AdminBenefitsTabs } from "@/components/admin/AdminBenefitsTabs";
import { RecoveriesTable, type RecoveryRow } from "@/components/finance/RecoveriesTable";
import { syncMedicalRecoveries } from "@/lib/benefits/recoveries";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ReviewQueue, type ReviewRow } from "@/components/payback/ReviewQueue";
import { possibleDuplicateLines } from "@/lib/finance/queries";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; edited?: string; error?: string; ok?: string }>;
}) {
  await requireFinance();
  const { paid, edited, error, ok } = await searchParams;

  const claims = await prisma.benefitClaim.findMany({
    where: { status: { in: ["APPROVED", "REIMBURSED"] } },
    include: {
      user: { select: { name: true } },
      guaranteedBenefit: { select: { name: true } },
      catalogItem: { select: { name: true } },
    },
    orderBy: { decidedAt: "desc" },
  });

  const rows: PaymentRow[] = claims
    // Awaiting-payment (APPROVED) first, then the reimbursed history.
    .sort((a, b) => (a.status === "APPROVED" ? 0 : 1) - (b.status === "APPROVED" ? 0 : 1))
    .map((c) => ({
      id: c.id,
      status: c.status === "REIMBURSED" ? "REIMBURSED" : "APPROVED",
      employee: c.user.name,
      benefit: c.guaranteedBenefit?.name ?? c.catalogItem?.name ?? "—",
      covered: c.amount,
      approvedAt: c.decidedAt ? formatDate(c.decidedAt) : "—",
      paidAmount: c.amountTransferred ?? null,
      paidDate: c.transferDate ? formatDate(c.transferDate) : null,
      paidDateInput: c.transferDate ? toDateInput(c.transferDate) : "",
      // Proof-of-payment the employee attached (PROOF-policy claims) — Finance
      // views it before confirming. Streamed via /api/claims/[id]/proof.
      hasProof: !!c.proofUrl,
    }));

  // Fill in any recoveries that should exist (spec 030). Idempotent — `commitmentId` is unique —
  // so it can run on every load. It's done here because a leave date is often recorded well after
  // the cycle opened, and Finance's page is where the gap actually matters.
  await syncMedicalRecoveries();
  const recoveries = await prisma.medicalRecovery.findMany({
    include: {
      user: { select: { name: true } },
      policyYear: { select: { startDate: true, endDate: true } },
      settledBy: { select: { name: true } },
    },
    // Open first — this is a list that must reach zero, not a history.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const recoveryRows: RecoveryRow[] = recoveries
    .sort((a, b) => (a.status === "OPEN" ? 0 : 1) - (b.status === "OPEN" ? 0 : 1))
    .map((r) => ({
      id: r.id,
      employee: r.user.name,
      term: `${formatDate(r.policyYear.startDate)} – ${formatDate(r.policyYear.endDate)}`,
      premium: r.premiumAtCreation,
      coverEndedOn: r.coverEndedOn ? formatDate(r.coverEndedOn) : null,
      expectedMonths: r.expectedMonths,
      expectedAmount: r.expectedAmount,
      status: r.status,
      recoveredAmount: r.recoveredAmount,
      recoveredOn: r.recoveredOn ? formatDate(r.recoveredOn) : null,
      shortfall: r.shortfall,
      reason: r.reason,
      settledBy: r.settledBy?.name ?? null,
    }));

  // Payback requests (spec 039). The duplicate hint is looked up per submitted request: if the
  // requester holds a float, a line of theirs for the same amount within a week either side is
  // shown beside the request. Information for the reviewer — it blocks nothing.
  const paybacks = await prisma.paybackRequest.findMany({
    include: {
      user: { select: { name: true } },
      category: { select: { name: true } },
      decidedBy: { select: { name: true } },
      evidence: { select: { id: true, fileName: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  const paybackRows: ReviewRow[] = await Promise.all(
    paybacks.map(async (p) => ({
      id: p.id,
      requester: p.user.name ?? "—",
      amount: p.amount.toString(),
      datePaid: p.datePaid,
      submittedAt: p.submittedAt,
      description: p.description,
      category: p.category?.name ?? null,
      payee: p.payee,
      status: p.status,
      decidedBy: p.decidedBy?.name ?? null,
      decidedAt: p.decidedAt,
      decisionReason: p.decisionReason,
      transferDate: p.transferDate,
      amountTransferred: p.amountTransferred?.toString() ?? null,
      evidence: p.evidence,
      duplicates:
        p.status === "SUBMITTED"
          ? (
              await possibleDuplicateLines({
                userId: p.userId,
                amount: p.amount,
                datePaid: p.datePaid,
              })
            ).map((d) => ({
              id: d.id,
              datePaid: d.datePaid,
              description: d.description,
              amount: d.amount.toString(),
              account: d.period.account.name,
              period: d.period.label,
            }))
          : [],
    })),
  );

  return (
    <div>
      <AutoRefresh />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Finance · Payments</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl text-ink">Payments</h1>
        <div className="flex items-center gap-2">
          {/* Finance shares the read-only benefits report (spec 034). */}
          <Link
            href="/admin/benefits/report"
            className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            Benefits report
          </Link>
          {/* Finance can also run data-request campaigns (spec 033). */}
          <Link
            href="/admin/data-requests"
            className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            Data requests
          </Link>
          {/* Petty cash floats, the other half of the Finance module (spec 039). */}
          <Link
            href="/petty-cash"
            className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            Petty cash
          </Link>
        </div>
      </div>
      <p className="mt-1 text-muted">
        Approved claims to pay — transfer the covered amount, then confirm it here (the employee is emailed). Reimbursed
        claims stay listed below for reference.
      </p>

      {paid ? (
        <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          ✓ Payment confirmed for {paid}. The employee has been notified.
        </p>
      ) : null}
      {edited ? (
        <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          ✓ Reimbursed record updated for {edited}. No email sent — this is a record correction.
        </p>
      ) : null}
      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">✓ {ok}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Sub-tabs (2026-08-18): the confirmation queue and medical recoveries each get their
          own tab, badged with what still needs action. Reuses the house tab component. */}
      <AdminBenefitsTabs
        tabs={[
          {
            id: "payments",
            label: "Payments confirmation",
            badge: rows.filter((r) => r.status === "APPROVED").length,
            node: <PaymentsQueue rows={rows} />,
          },
          {
            id: "recoveries",
            label: "Medical recoveries",
            badge: recoveryRows.filter((r) => r.status === "OPEN").length,
            badgeTone: "bad",
            node: (
              <section>
                <p className="max-w-prose text-muted">
                  Premium already paid for cover after someone&apos;s last day. Chase the insurer,
                  then record what came back — or write it off with a reason.
                </p>
                <RecoveriesTable rows={recoveryRows} />
              </section>
            ),
          },
          {
            id: "payback",
            label: "Payback requests",
            badge: paybackRows.filter((r) => r.status === "SUBMITTED").length,
            node: (
              <section>
                <p className="max-w-prose text-muted">
                  People who paid for something with their own money. Open the receipt, approve or
                  decline with a reason, then record the transfer — they&apos;re emailed at each
                  outcome.
                </p>
                <div className="mt-6">
                  <ReviewQueue rows={paybackRows} />
                </div>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
