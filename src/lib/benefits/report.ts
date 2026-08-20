// Benefits cycle report (spec 034). Server-only: builds the per-employee rows the
// Admin → Benefits → Reporting page and its Excel export both render.
//
// EVERY figure here is computed through the SAME primitives the claim path enforces —
// deriveTenureBand, poolCeilingFor via the ceiling table, classifyEligibility/
// poolCycleFraction/prorate, medicalCycleCharge, the not-REJECTED covered totals, the
// per-cycle flexCap flag — so a report row can never disagree with the employee's own
// Benefits page or with what the server would allow (FR-002). Nothing is stored or
// denormalised for the report; it recomputes on every read.

import { prisma } from "@/lib/prisma";
import type { EmploymentType, TenureBand } from "@prisma/client";
import {
  planYearWindow,
  medicalCycleCharge,
  medicalCarriedForward,
} from "@/lib/benefits/config";
import {
  classifyEligibility,
  hasKnownStartDate,
  poolCycleFraction,
  prorate,
  cycleWholeMonths,
} from "@/lib/benefits/proration";
import { flexCap } from "@/lib/benefits/rules";
import { poolCeiling } from "@/lib/benefits/pool";
import { deriveTenureBand } from "@/lib/tenure";
import { EMPLOYMENT_TYPE_LABEL, TENURE_BAND_LABEL, formatDate } from "@/lib/labels";

/** Status chip per person (FR-005). */
export type ReportChip =
  | "NO_POOL"
  | "NO_ACTIVITY"
  | "ACTIVE"
  | "PENDING"
  | "EXHAUSTED"
  /** Past the ceiling — money already spent that the pool cannot cover (2026-08-20). */
  | "OVER_POOL";

export type ReportClaim = {
  id: string;
  date: string; // dd/mm/yyyy
  benefit: string;
  kind: "flex" | "guaranteed";
  /** Receipt value as entered; null for guaranteed/allowance claims with no receipt. */
  receipt: number | null;
  covered: number;
  /** covered < the coverage-rate share — the clamp the popup must make visible. */
  clamped: boolean;
  status: string;
  decisionNote: string | null;
  proofHref: string | null;
};

export type ReportGuaranteedItem = {
  name: string;
  amount: number;
  date: string; // dd/mm/yyyy
  kind: "release" | "claim";
  status: string | null; // claim status; null for a release
};

export type ReportMedical = {
  premium: number;
  cycleCharge: number;
  carriedForward: number;
  committedAt: string; // dd/mm/yyyy
  termLabel: string | null;
  people: { label: string; ageAtCommit: number; premiumEGP: number }[];
};

export type ReportRow = {
  userId: string;
  name: string;
  email: string | null;
  department: string | null;
  left: boolean;
  contract: string; // "Full-time · 2–4 years" / "Full-time · Under 6 months" / "—"
  /** Prorated pool ceiling for this cycle; null when no pool can be derived. */
  ceiling: number | null;
  prorated: boolean;
  /** The full annual ceiling the proration started from (only set when prorated). */
  proratedFrom: number | null;
  medical: number;
  flexUsed: number;
  pending: number;
  pendingCount: number;
  remaining: number | null;
  guaranteed: number;
  /** used ÷ ceiling, 0..1+; null when no ceiling. */
  utilization: number | null;
  chip: ReportChip;
  /** Why there is no pool, when chip is NO_POOL. */
  noPoolReason: string | null;
  /** The recorded decision about this person's ceiling for this cycle (migration 059), if any. */
  exception: { kind: "RAISED" | "ACCEPTED"; amount: number | null; reason: string } | null;
  detail: {
    bandLabel: string | null;
    employmentTypeLabel: string | null;
    startDate: string | null; // dd/mm/yyyy
    cycleMonths: number;
    /** The per-benefit cap this cycle enforces (50% or full ceiling per spec 031). */
    cap: number | null;
    flexCapEnabled: boolean;
    medical: ReportMedical | null;
    guaranteedItems: ReportGuaranteedItem[];
    claims: ReportClaim[];
  };
};

export type CycleReport = {
  planYear: { id: string; name: string; status: string; window: string | null; flexCapEnabled: boolean };
  rows: ReportRow[];
  departments: string[];
};

/** All cycles for the picker, newest first, with the open one flagged. */
export async function listCycles() {
  const years = await prisma.planYear.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true },
  });
  return years;
}

/** The cycle the report defaults to: the open one, else the most recent (FR-003). */
export function defaultCycleId(years: { id: string; status: string }[]): string | null {
  return (years.find((y) => y.status === "OPEN") ?? years[0])?.id ?? null;
}

/**
 * The whole report for one cycle. One row per ACTIVE employee, plus leavers who have
 * activity in this cycle (excluded by default in the UI, includable via a filter).
 */
export async function cycleReport(planYearId: string): Promise<CycleReport | null> {
  const planYear = await prisma.planYear.findUnique({ where: { id: planYearId } });
  if (!planYear) return null;

  const window = planYearWindow(planYear);

  const [users, ceilings, claims, commitments, releases, policyYears, exceptions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        status: true,
        employmentType: true,
        startDate: true,
      },
    }),
    prisma.poolCeiling.findMany(),
    prisma.benefitClaim.findMany({
      where: { planYearId },
      include: {
        catalogItem: { select: { name: true, coverageRate: true } },
        guaranteedBenefit: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Same semantics as getMedicalCommitment (config.ts), in bulk: the commitment CHARGING
    // this cycle — possibly made in the previous one — with the planYearId fallback for
    // rows that predate per-cycle charges. Latest first so the per-user pick matches
    // findFirst's orderBy.
    prisma.medicalCommitment.findMany({
      where: { OR: [{ cycleCharges: { some: { planYearId } } }, { planYearId }] },
      include: { coveredPeople: true, cycleCharges: true },
      orderBy: { committedAt: "desc" },
    }),
    prisma.benefitRelease.findMany({
      where: { planYearId },
      include: { guaranteedBenefit: { select: { name: true } } },
      orderBy: { releasedAt: "desc" },
    }),
    prisma.medicalPolicyYear.findMany({
      select: { id: true, startDate: true, endDate: true },
    }),
    // Guarded for a database that predates migration 059.
    prisma.poolCeilingException.findMany({ where: { planYearId } }).catch(() => []),
  ]);
  const exceptionByUser = new Map(exceptions.map((e) => [e.userId, e]));

  const ceilingFor = (t: EmploymentType, band: TenureBand): number | null =>
    ceilings.find((c) => c.employmentType === t && c.tenureBand === band)?.amount ?? null;

  const claimsByUser = new Map<string, typeof claims>();
  for (const c of claims) {
    const list = claimsByUser.get(c.userId) ?? [];
    list.push(c);
    claimsByUser.set(c.userId, list);
  }
  const commitmentByUser = new Map<string, (typeof commitments)[number]>();
  for (const m of commitments) {
    if (!commitmentByUser.has(m.userId)) commitmentByUser.set(m.userId, m); // latest wins
  }
  const releasesByUser = new Map<string, typeof releases>();
  for (const r of releases) {
    const list = releasesByUser.get(r.userId) ?? [];
    list.push(r);
    releasesByUser.set(r.userId, list);
  }
  const termById = new Map(policyYears.map((p) => [p.id, p]));

  const cycleMonths = cycleWholeMonths(window);
  const rows: ReportRow[] = [];

  for (const u of users) {
    const userClaims = claimsByUser.get(u.id) ?? [];
    const commitment = commitmentByUser.get(u.id) ?? null;
    const userReleases = releasesByUser.get(u.id) ?? [];
    const left = u.status !== "ACTIVE";
    // A leaver with nothing in this cycle is history, not a report row.
    if (left && userClaims.length === 0 && !commitment && userReleases.length === 0) continue;

    const band = deriveTenureBand(u.startDate).band;

    // ── Ceiling ────────────────────────────────────────────────────────────
    // Derived by `poolCeiling`, the SAME function the claim path and every medical
    // write now call (2026-08-20). It used to be re-derived here, and the copies had
    // drifted — which is how an employee could be paid more than the report said they
    // had. The contract label is presentation, so it stays here.
    const exception = exceptionByUser.get(u.id) ?? null;
    const derived = poolCeiling(
      u,
      ceilingFor,
      window,
      exception?.kind === "RAISED" ? exception.amount : null
    );
    const ceiling = derived.ceiling;
    const proratedFrom = derived.proratedFrom;
    const noPoolReason: string | null = derived.reason;
    const contract = !u.employmentType
      ? "—"
      : band
        ? `${EMPLOYMENT_TYPE_LABEL[u.employmentType]} · ${TENURE_BAND_LABEL[band]}`
        : hasKnownStartDate(u.startDate)
          ? `${EMPLOYMENT_TYPE_LABEL[u.employmentType]} · Under 6 months`
          : EMPLOYMENT_TYPE_LABEL[u.employmentType];

    // ── Usage, split exactly as the engine splits it ────────────────────────
    let flexUsed = 0;
    let pending = 0;
    let pendingCount = 0;
    let guaranteedTotal = 0;
    for (const c of userClaims) {
      if (c.status === "REJECTED") continue;
      if (c.catalogItemId) {
        flexUsed += c.amount; // pending + decided — the engine reserves both
        if (c.status === "SUBMITTED") {
          pending += c.amount;
          pendingCount += 1;
        }
      } else if (c.guaranteedBenefitId) {
        guaranteedTotal += c.amount; // own budget — never the pool
      }
    }
    for (const r of userReleases) guaranteedTotal += r.amount;

    const medical = medicalCycleCharge(commitment, planYearId);
    const used = medical + flexUsed;
    // SIGNED, deliberately (2026-08-20). This was `Math.max(0, …)`, so an employee 2,093
    // past their ceiling rendered identically to one who had spent it to the penny — the
    // overruns were real in the database and invisible on the page that exists to find them.
    const remaining = ceiling != null ? ceiling - used : null;
    const utilization = ceiling != null && ceiling > 0 ? used / ceiling : null;

    const anyActivity = used > 0 || guaranteedTotal > 0;
    const chip: ReportChip =
      ceiling == null
        ? "NO_POOL"
        : // Over the ceiling outranks a pending claim: it is a number someone has to act on,
          // not a queue state that will resolve itself. An ACCEPTED decision has already been
          // made on the record, so that row goes back to reading normally.
          remaining != null && remaining < 0 && exception?.kind !== "ACCEPTED"
          ? "OVER_POOL"
          : pendingCount > 0
            ? "PENDING"
            : remaining === 0 && ceiling > 0
              ? "EXHAUSTED"
              : anyActivity
                ? "ACTIVE"
                : "NO_ACTIVITY";

    // ── Popup detail ────────────────────────────────────────────────────────
    const term = commitment?.policyYearId ? termById.get(commitment.policyYearId) : null;
    const medicalDetail: ReportMedical | null = commitment
      ? {
          premium: commitment.premium,
          cycleCharge: medical,
          carriedForward: medicalCarriedForward(commitment),
          committedAt: formatDate(commitment.committedAt),
          termLabel: term ? `${formatDate(term.startDate)} – ${formatDate(term.endDate)}` : null,
          people: commitment.coveredPeople.map((p) => ({
            label: p.label,
            ageAtCommit: p.ageAtCommit,
            premiumEGP: p.premiumEGP,
          })),
        }
      : null;

    const guaranteedItems: ReportGuaranteedItem[] = [
      ...userReleases.map((r): ReportGuaranteedItem => ({
        name: r.guaranteedBenefit.name,
        amount: r.amount,
        date: formatDate(r.releasedAt),
        kind: "release",
        status: null,
      })),
      ...userClaims
        .filter((c) => c.guaranteedBenefitId && c.status !== "REJECTED")
        .map((c): ReportGuaranteedItem => ({
          name: c.guaranteedBenefit?.name ?? "—",
          amount: c.amount,
          date: formatDate(c.createdAt),
          kind: "claim",
          status: c.status,
        })),
    ];

    const claimRows: ReportClaim[] = userClaims.map((c): ReportClaim => {
      const rate = c.catalogItem?.coverageRate ?? null;
      const share =
        c.fullCost != null && rate != null ? Math.round((c.fullCost * rate) / 100) : null;
      return {
        id: c.id,
        date: formatDate(c.createdAt),
        benefit: c.guaranteedBenefit?.name ?? c.catalogItem?.name ?? "—",
        kind: c.guaranteedBenefitId ? "guaranteed" : "flex",
        receipt: c.fullCost,
        covered: c.amount,
        clamped: share != null && share !== c.amount,
        status: c.status,
        decisionNote: c.decisionNote,
        proofHref: c.proofUrl ? `/api/claims/${c.id}/proof` : null,
      };
    });

    rows.push({
      userId: u.id,
      name: u.name ?? "—",
      email: u.email,
      department: u.department,
      left,
      contract,
      ceiling,
      prorated: proratedFrom != null,
      proratedFrom,
      medical,
      flexUsed,
      pending,
      pendingCount,
      remaining,
      guaranteed: guaranteedTotal,
      utilization,
      chip,
      noPoolReason,
      exception: exception
        ? { kind: exception.kind, amount: exception.amount, reason: exception.reason }
        : null,
      detail: {
        bandLabel: band ? TENURE_BAND_LABEL[band] : null,
        employmentTypeLabel: u.employmentType ? EMPLOYMENT_TYPE_LABEL[u.employmentType] : null,
        startDate: u.startDate ? formatDate(u.startDate) : null,
        cycleMonths,
        cap: ceiling != null ? flexCap(ceiling, planYear.flexCapEnabled) : null,
        flexCapEnabled: planYear.flexCapEnabled,
        medical: medicalDetail,
        guaranteedItems,
        claims: claimRows,
      },
    });
  }

  return {
    planYear: {
      id: planYear.id,
      name: planYear.name,
      status: planYear.status,
      window:
        planYear.startDate && planYear.endDate
          ? `${formatDate(planYear.startDate)} → ${formatDate(planYear.endDate)}`
          : null,
      flexCapEnabled: planYear.flexCapEnabled,
    },
    rows,
    departments: Array.from(
      new Set(rows.map((r) => r.department).filter((d): d is string => !!d))
    ).sort(),
  };
}
