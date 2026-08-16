import { requireFinance } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate, toDateInput } from "@/lib/labels";
import { PaymentsQueue, type PaymentRow } from "@/components/finance/PaymentsQueue";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; edited?: string; error?: string }>;
}) {
  await requireFinance();
  const { paid, edited, error } = await searchParams;

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

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Finance · Payments</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Payments</h1>
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
      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <PaymentsQueue rows={rows} />
    </div>
  );
}
