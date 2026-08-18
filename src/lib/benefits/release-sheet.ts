// Release-sheet data builder (spec 013 + 036), extracted from the standalone release page
// when the sheet moved into Admin → Benefits → "Exceptional releases" (2026-08-18). Builds
// rows for EVERY grantable benefit in one pass so the tab's picker switches client-side.

import { prisma } from "@/lib/prisma";
import { amountForBand, isSalaryDriven, isEligibleFor } from "@/lib/benefits/config";
import { EMPLOYMENT_TYPE_LABEL, STATUS_LABEL, toDateInput, tenureBandDisplay } from "@/lib/labels";
import { deriveTenureBand } from "@/lib/tenure";
import type { ReleaseBenefit, ReleaseRow } from "@/components/benefits/ReleaseManager";

/** Human label for who a benefit is available to (spec 021). */
function eligibilityLabel(b: { eligibleFullTime: boolean; eligiblePartTime: boolean }): string {
  if (b.eligibleFullTime && b.eligiblePartTime) return "Full-time & Part-time";
  if (b.eligibleFullTime) return "Full-time";
  if (b.eligiblePartTime) return "Part-time";
  return "No one";
}

export type ReleaseSheet = {
  benefits: ReleaseBenefit[];
  rowsByBenefit: Record<string, ReleaseRow[]>;
};

export async function buildReleaseSheet(planYear: { id: string }): Promise<ReleaseSheet> {
  const allBenefits = await prisma.guaranteedBenefit.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  // Fixed-allowance guaranteed benefits only (salary-driven Loans excluded).
  const eligible = allBenefits.filter((b) => !isSalaryDriven(b));

  const [employees, releases, claims, grants] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, email: true, department: true, title: true,
        employmentType: true, startDate: true, phone: true,
        status: true, reportsTo: { select: { name: true } },
      },
    }),
    prisma.benefitRelease.findMany({
      where: { planYearId: planYear.id },
      select: { userId: true, guaranteedBenefitId: true, releasedAt: true, amount: true },
    }),
    // Every non-rejected claim blocks a release on top (paying twice; 2026-08-18):
    // SUBMITTED reserves the allocation, APPROVED/REIMBURSED already granted it.
    prisma.benefitClaim.findMany({
      where: { planYearId: planYear.id, guaranteedBenefitId: { not: null }, status: { not: "REJECTED" } },
      select: { userId: true, guaranteedBenefitId: true, status: true, createdAt: true, decidedAt: true, transferDate: true },
    }),
    // Per-person grants (spec 036): granted people join the sheet at their granted amount.
    prisma.guaranteedBenefitGrant
      .findMany({
        where: { planYearId: planYear.id },
        select: { userId: true, guaranteedBenefitId: true, amount: true },
      })
      .catch(() => []),
  ]);

  const now = new Date();
  const rowsByBenefit: Record<string, ReleaseRow[]> = {};

  for (const selected of eligible) {
    const typeIn = new Set([
      ...(selected.eligibleFullTime ? ["FULL_TIME"] : []),
      ...(selected.eligiblePartTime ? ["PART_TIME"] : []),
    ]);
    const grantByUser = new Map(
      grants.filter((g) => g.guaranteedBenefitId === selected.id).map((g) => [g.userId, g.amount])
    );
    const releasedBy = new Map(
      releases
        .filter((r) => r.guaranteedBenefitId === selected.id)
        .map((r) => [r.userId, { date: toDateInput(r.releasedAt), amount: r.amount }])
    );
    // One claim state per employee, most advanced wins: reimbursed > approved > requested.
    const RANK = { requested: 0, approved: 1, reimbursed: 2 } as const;
    const claimBy = new Map<string, { state: "requested" | "approved" | "reimbursed"; date: string }>();
    for (const c of claims.filter((x) => x.guaranteedBenefitId === selected.id)) {
      const state =
        c.status === "REIMBURSED" ? ("reimbursed" as const) : c.status === "APPROVED" ? ("approved" as const) : ("requested" as const);
      const date = toDateInput(
        state === "reimbursed" ? c.transferDate ?? c.decidedAt : state === "approved" ? c.decidedAt : c.createdAt
      );
      const prev = claimBy.get(c.userId);
      if (!prev || RANK[state] > RANK[prev.state]) claimBy.set(c.userId, { state, date });
    }

    rowsByBenefit[selected.id] = employees
      // Eligible employment types, plus anyone granted individually (spec 036).
      .filter((e) => (e.employmentType != null && typeIn.has(e.employmentType)) || grantByUser.has(e.id))
      .map((e) => {
        // Derive the tenure band live from the hire date so a stale stored band never
        // drives the amount or the status.
        const band = deriveTenureBand(e.startDate, now).band;
        // A grant's typed amount wins for the granted person; otherwise the band figure.
        const grantAmount = grantByUser.get(e.id) ?? null;
        const amount =
          grantAmount ?? (band && e.employmentType ? amountForBand(e.employmentType, band, selected) : null);
        // When no amount resolves, name the real cause.
        const attention =
          amount != null
            ? ""
            : !e.employmentType
            ? "no employment type"
            : !isEligibleFor(e.employmentType, selected)
            ? `not eligible (${EMPLOYMENT_TYPE_LABEL[e.employmentType].toLowerCase()})`
            : !band
            ? !e.startDate
              ? "no hire date"
              : e.startDate.getTime() > now.getTime()
              ? "future hire date"
              : "< 6 months — not yet eligible"
            : `no ${e.employmentType === "FULL_TIME" ? "full-time" : "part-time"} amount set`;
        const claim = claimBy.get(e.id);
        const released = releasedBy.get(e.id);
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
          released: released != null,
          releasedAt: released?.date ?? "",
          claimState: claim?.state ?? "",
          claimDate: claim?.date ?? "",
          granted: grantAmount != null,
        };
      });
  }

  return {
    benefits: eligible.map((b) => ({ id: b.id, label: `${b.name} — ${eligibilityLabel(b)}` })),
    rowsByBenefit,
  };
}
