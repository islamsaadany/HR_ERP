import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getActivePlanYear, amountForBand, isSalaryDriven, isEligibleFor } from "@/lib/benefits/config";
import { EMPLOYMENT_TYPE_LABEL, STATUS_LABEL, toDateInput, tenureBandDisplay } from "@/lib/labels";
import { deriveTenureBand } from "@/lib/tenure";
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
        <h1 className="mt-1 font-serif text-3xl text-ink">Release Guaranteed Benefit</h1>
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
    const [employees, releases, claims] = await Promise.all([
      prisma.user.findMany({
        where: { status: "ACTIVE", employmentType: { in: typeIn.length ? [...typeIn] : ["FULL_TIME", "PART_TIME"] } },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, email: true, department: true, title: true,
          employmentType: true, startDate: true, phone: true,
          status: true, reportsTo: { select: { name: true } },
        },
      }),
      prisma.benefitRelease.findMany({
        where: { guaranteedBenefitId: selected.id, planYearId: planYear.id },
        select: { userId: true, releasedAt: true },
      }),
      // Claims for this benefit — every non-rejected one blocks a release on top (paying
      // twice; found 2026-08-18): SUBMITTED reserves the allocation, APPROVED/REIMBURSED
      // already granted it. Surfaced as distinct statuses and unselectable in the sheet.
      prisma.benefitClaim.findMany({
        where: { guaranteedBenefitId: selected.id, planYearId: planYear.id, status: { not: "REJECTED" } },
        select: { userId: true, status: true, createdAt: true, decidedAt: true, transferDate: true },
      }),
    ]);
    const releasedBy = new Map(releases.map((r) => [r.userId, toDateInput(r.releasedAt)]));
    // One claim state per employee, most advanced wins: reimbursed > approved > requested.
    const RANK = { requested: 0, approved: 1, reimbursed: 2 } as const;
    const claimBy = new Map<string, { state: "requested" | "approved" | "reimbursed"; date: string }>();
    for (const c of claims) {
      const state =
        c.status === "REIMBURSED" ? ("reimbursed" as const) : c.status === "APPROVED" ? ("approved" as const) : ("requested" as const);
      const date = toDateInput(
        state === "reimbursed" ? c.transferDate ?? c.decidedAt : state === "approved" ? c.decidedAt : c.createdAt
      );
      const prev = claimBy.get(c.userId);
      if (!prev || RANK[state] > RANK[prev.state]) claimBy.set(c.userId, { state, date });
    }

    const now = new Date();
    rows = employees.map((e) => {
      // Derive the tenure band live from the hire date so a stale stored band never
      // drives the amount or the status.
      const band = deriveTenureBand(e.startDate, now).band;
      const amount = band && e.employmentType ? amountForBand(e.employmentType, band, selected) : null;
      // When no amount resolves, name the real cause.
      const attention =
        amount != null
          ? ""
          : !e.employmentType
          ? "no employment type"
          : !band
          ? !e.startDate
            ? "no hire date"
            : e.startDate.getTime() > now.getTime()
            ? "future hire date"
            : "< 6 months — not yet eligible"
          : `no ${e.employmentType === "FULL_TIME" ? "full-time" : "part-time"} amount set`;
      const claim = claimBy.get(e.id);
      return {
        id: e.id,
        name: e.name,
        email: e.email,
        department: e.department ?? "",
        title: e.title ?? "",
        employmentType: e.employmentType ? EMPLOYMENT_TYPE_LABEL[e.employmentType] : "",
        tenure: tenureBandDisplay(e.startDate, now),
        startDate: toDateInput(e.startDate),
        phone: e.phone ?? "",
        manager: e.reportsTo?.name ?? "",
        status: STATUS_LABEL[e.status],
        amount,
        attention,
        released: releasedBy.has(e.id),
        releasedAt: releasedBy.get(e.id) ?? "",
        claimState: claim?.state ?? "",
        claimDate: claim?.date ?? "",
      };
    });
  }

  return (
    <div>
      <BackLink href="/admin/benefits" label="Benefits" />
      <div className="flex items-center justify-between gap-3">
        <div>
          {eyebrow}
          <h1 className="mt-1 font-serif text-3xl text-ink">Release Guaranteed Benefit</h1>
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
