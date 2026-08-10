import { requireFinance } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { PaymentsQueue, type PaymentRow } from "@/components/finance/PaymentsQueue";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; error?: string }>;
}) {
  await requireFinance();
  const { paid, error } = await searchParams;

  const claims = await prisma.benefitClaim.findMany({
    where: { status: "APPROVED" },
    include: {
      user: { select: { name: true } },
      guaranteedBenefit: { select: { name: true } },
      catalogItem: { select: { name: true } },
    },
    orderBy: { decidedAt: "asc" },
  });

  const rows: PaymentRow[] = claims.map((c) => ({
    id: c.id,
    employee: c.user.name,
    benefit: c.guaranteedBenefit?.name ?? c.catalogItem?.name ?? "—",
    covered: c.amount,
    approvedAt: c.decidedAt ? formatDate(c.decidedAt) : "—",
  }));

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Finance · Payments</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Awaiting payment</h1>
      <p className="mt-1 text-muted">
        Claims HR approved. Transfer the covered amount, then confirm it here — the employee is emailed that their claim
        was reimbursed.
      </p>

      {paid ? (
        <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          ✓ Payment confirmed for {paid}. The employee has been notified.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <PaymentsQueue rows={rows} />
    </div>
  );
}
