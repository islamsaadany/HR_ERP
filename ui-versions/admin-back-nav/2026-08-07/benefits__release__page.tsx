import Link from "next/link";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getActivePlanYear, amountForBand } from "@/lib/benefits/config";
import { EMPLOYMENT_TYPE_LABEL, TENURE_BAND_LABEL, STATUS_LABEL, toDateInput } from "@/lib/labels";
import { ReleaseManager, type ReleaseBenefit, type ReleaseRow } from "@/components/benefits/ReleaseManager";

export const dynamic = "force-dynamic";

const isSalaryDriven = (b: { band6mo2y: number | null; band2to4y: number | null; band4to7y: number | null; band7to10y: number | null }) =>
  b.band6mo2y == null && b.band2to4y == null && b.band4to7y == null && b.band7to10y == null;

export default async function BenefitReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ benefit?: string }>;
}) {
  await requireAdmin();
  const { benefit: benefitId } = await searchParams;

  const eyebrow = (
    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Benefits</p>
  );

  const planYear = await getActivePlanYear();
  if (!planYear) {
    return (
      <div>
        {eyebrow}
        <h1 className="mt-1 font-serif text-3xl text-ink">Release a benefit</h1>
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          No open plan year. Open one in Admin → Benefits to release allowances.
        </div>
      </div>
    );
  }

  // Eligible = fixed-allowance guaranteed benefits (exclude salary-driven Loans).
  const allBenefits = await prisma.guaranteedBenefit.findMany({
    orderBy: [{ employmentType: "asc" }, { order: "asc" }],
  });
  const eligible = allBenefits.filter((b) => !isSalaryDriven(b));
  const benefits: ReleaseBenefit[] = eligible.map((b) => ({
    id: b.id,
    label: `${b.name} — ${EMPLOYMENT_TYPE_LABEL[b.employmentType]}`,
  }));

  const selected = benefitId ? eligible.find((b) => b.id === benefitId) ?? null : null;

  let rows: ReleaseRow[] = [];
  if (selected) {
    const [employees, releases] = await Promise.all([
      prisma.user.findMany({
        where: { status: "ACTIVE", employmentType: selected.employmentType },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, email: true, department: true, title: true,
          employmentType: true, tenureBand: true, startDate: true, phone: true,
          status: true, reportsTo: { select: { name: true } },
        },
      }),
      prisma.benefitRelease.findMany({
        where: { guaranteedBenefitId: selected.id, planYearId: planYear.id },
        select: { userId: true, releasedAt: true },
      }),
    ]);
    const releasedBy = new Map(releases.map((r) => [r.userId, toDateInput(r.releasedAt)]));

    rows = employees.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      department: e.department ?? "",
      title: e.title ?? "",
      employmentType: e.employmentType ? EMPLOYMENT_TYPE_LABEL[e.employmentType] : "",
      tenure: e.tenureBand ? TENURE_BAND_LABEL[e.tenureBand] : "",
      startDate: toDateInput(e.startDate),
      phone: e.phone ?? "",
      manager: e.reportsTo?.name ?? "",
      status: STATUS_LABEL[e.status],
      amount: e.tenureBand ? amountForBand(e.tenureBand, selected) : null,
      released: releasedBy.has(e.id),
      releasedAt: releasedBy.get(e.id) ?? "",
    }));
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          {eyebrow}
          <h1 className="mt-1 font-serif text-3xl text-ink">Release a benefit</h1>
          <p className="mt-1 text-sm text-muted">Mark employees released and download a payroll sheet. Salary is never shown here.</p>
        </div>
        <Link href="/admin/benefits" className="text-sm font-medium text-navy-600 hover:text-navy-800">← Back to Benefits</Link>
      </div>

      <ReleaseManager
        benefits={benefits}
        selectedBenefitId={selected?.id ?? null}
        benefitName={selected?.name ?? ""}
        planYearName={planYear.name}
        rows={rows}
      />
    </div>
  );
}
