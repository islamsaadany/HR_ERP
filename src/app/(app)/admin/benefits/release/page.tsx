import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getActivePlanYear, amountForBand, isSalaryDriven, isEligibleFor } from "@/lib/benefits/config";
import { EMPLOYMENT_TYPE_LABEL, TENURE_BAND_LABEL, STATUS_LABEL, toDateInput } from "@/lib/labels";
import { ReleaseManager, type ReleaseBenefit, type ReleaseRow } from "@/components/benefits/ReleaseManager";
import { BackLink } from "@/components/admin/BackLink";

export const dynamic = "force-dynamic";

/** Human label for who a benefit is available to (spec 021). */
function eligibilityLabel(b: { eligibleFullTime: boolean; eligiblePartTime: boolean }): string {
  if (b.eligibleFullTime && b.eligiblePartTime) return "Full-time & Part-time";
  if (b.eligibleFullTime) return "Full-time";
  if (b.eligiblePartTime) return "Part-time";
  return "No one";
}

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
        <BackLink href="/admin/benefits" label="Benefits" />
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
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  const eligible = allBenefits.filter((b) => !isSalaryDriven(b));
  const benefits: ReleaseBenefit[] = eligible.map((b) => ({
    id: b.id,
    label: `${b.name} — ${eligibilityLabel(b)}`,
  }));

  const selected = benefitId ? eligible.find((b) => b.id === benefitId) ?? null : null;

  let rows: ReleaseRow[] = [];
  if (selected) {
    // Only employees whose employment type is eligible for this benefit.
    const typeIn = [
      ...(selected.eligibleFullTime ? (["FULL_TIME"] as const) : []),
      ...(selected.eligiblePartTime ? (["PART_TIME"] as const) : []),
    ];
    const [employees, releases, reimbursed] = await Promise.all([
      prisma.user.findMany({
        where: { status: "ACTIVE", employmentType: { in: typeIn.length ? [...typeIn] : ["FULL_TIME", "PART_TIME"] } },
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
      // Back-filled reimbursements for this benefit (recorded by HR as an already-paid
      // claim, not a release). Surfaced as a distinct "Reimbursed (backfilled)" status
      // so a paid person isn't mistaken for "not released".
      prisma.benefitClaim.findMany({
        where: { guaranteedBenefitId: selected.id, planYearId: planYear.id, status: "REIMBURSED" },
        select: { userId: true, decidedAt: true },
      }),
    ]);
    const releasedBy = new Map(releases.map((r) => [r.userId, toDateInput(r.releasedAt)]));
    const reimbursedBy = new Map(reimbursed.map((c) => [c.userId, toDateInput(c.decidedAt)]));

    rows = employees.map((e) => {
      const amount = e.tenureBand && e.employmentType ? amountForBand(e.employmentType, e.tenureBand, selected) : null;
      // When no amount resolves, say why — the tenure band, the employment type, or the
      // benefit's per-type/band allowance may be the missing piece (not always "no tenure").
      const attention =
        amount != null
          ? ""
          : !e.employmentType
          ? "no employment type"
          : !e.tenureBand
          ? "no tenure band"
          : "no allowance set for their type / band";
      return {
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
        amount,
        attention,
        released: releasedBy.has(e.id),
        releasedAt: releasedBy.get(e.id) ?? "",
        reimbursed: reimbursedBy.has(e.id),
        reimbursedAt: reimbursedBy.get(e.id) ?? "",
      };
    });
  }

  return (
    <div>
      <BackLink href="/admin/benefits" label="Benefits" />
      <div className="flex items-center justify-between gap-3">
        <div>
          {eyebrow}
          <h1 className="mt-1 font-serif text-3xl text-ink">Release a benefit</h1>
          <p className="mt-1 text-sm text-muted">Mark employees released and download a payroll sheet. Salary is never shown here.</p>
        </div>
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
