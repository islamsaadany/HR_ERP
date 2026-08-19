import { requireAdmin, isSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate, EMPLOYMENT_TYPE_LABEL, TENURE_BAND_LABEL, TENURE_BAND_ORDER, formatEGP as egp, formatEGP2, formatNumber } from "@/lib/labels";
import { BackLink } from "@/components/admin/BackLink";
import type { EmploymentType, TenureBand } from "@prisma/client";
import { updateMedicalRateBand } from "./actions";
import {
  updatePoolCeilings,
  updateGuaranteedAmounts,
  updateFlexAllowanceAmounts,
} from "./config-actions";
import {
  isSalaryDriven,
  isEligibleFor,
  isFixedAllowance,
  planYearWindow,
  medicalCycleCharge,
  amountForBand,
} from "@/lib/benefits/config";
import { classifyEligibility, hasKnownStartDate, poolCycleFraction, prorate } from "@/lib/benefits/proration";
import { overlapWholeMonths } from "@/lib/benefits/policy-year";
import { commitmentAttention } from "@/lib/benefits/attention";
import { deriveTenureBand } from "@/lib/tenure";
import {
  MedicalCommitmentsPanel,
  type MedicalRow,
  type NotCommittedRow,
} from "@/components/admin/MedicalCommitmentsPanel";
import {
  ClaimsPanel,
  type QueueRow,
  type LedgerRow,
  type ClaimsTotals,
} from "@/components/admin/ClaimsPanel";
import { PlanYearDialog } from "@/components/admin/PlanYearDialog";
import { PolicyYearDialog } from "@/components/admin/PolicyYearDialog";
import { AdminBenefitsTabs } from "@/components/admin/AdminBenefitsTabs";
import { EditableSection } from "@/components/admin/EditableSection";
import { ToastForm } from "@/components/admin/ToastForm";
import { ManualReleaseModal } from "@/components/admin/ManualReleaseModal";
import { CatalogueGrid, type CatalogueGridRow } from "@/components/admin/CatalogueGrid";
import { AddCatalogItemModal } from "@/components/admin/AddCatalogItemModal";
import { BenefitGrantsPanel, type GrantsBenefit } from "@/components/admin/BenefitGrantsPanel";
import { ReleaseManager } from "@/components/benefits/ReleaseManager";
import { buildReleaseSheet } from "@/lib/benefits/release-sheet";

export const dynamic = "force-dynamic";

export default async function AdminBenefitsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireAdmin();
  const isSuper = isSuperUser(me.role);
  const { error } = await searchParams;
  const planYears = await prisma.planYear.findMany({
    orderBy: { createdAt: "desc" },
    // Spec 031: who last changed the cycle's 50%-cap setting, named in the dialog row.
    include: { flexCapChangedBy: { select: { name: true } } },
  });
  const active = planYears.find((p) => p.status === "OPEN") ?? planYears[0];

  const [medicalCommitments, pendingClaims, guaranteedBenefits, catalogItems, poolCeilings, employees] =
    await Promise.all([
      active
        ? prisma.medicalCommitment.findMany({
            where: { planYearId: active.id },
            include: {
              user: {
                select: {
                  name: true,
                  employmentType: true,
                  tenureBand: true,
                  // Needed to price the Manage panel's preview with the same inputs the
                  // server re-prices from (spec 023: age at the commit date, pool ceiling).
                  dateOfBirth: true,
                  startDate: true,
                  dependants: {
                    select: { id: true, name: true, kind: true, dateOfBirth: true },
                    orderBy: { dateOfBirth: "asc" },
                  },
                },
              },
              coveredPeople: true,
            },
            // Name breaks the tie: several people commit on the same day, and with equal
            // `committedAt` the row order was the database's to choose — so the list reshuffled
            // on every re-render and HR couldn't tell what their last action had done.
            orderBy: [{ committedAt: "desc" }, { user: { name: "asc" } }],
          })
        : Promise.resolve([]),
      active
        ? prisma.benefitClaim.findMany({
            // All the plan year's claims — HR keeps visibility; only SUBMITTED ones are actionable.
            where: { planYearId: active.id },
            include: {
              user: { select: { id: true, name: true, employmentType: true, tenureBand: true, startDate: true } },
              guaranteedBenefit: { select: { name: true, category: true } },
              // coverageRate is needed to show HR how a clamped claim was worked out.
              catalogItem: { select: { name: true, coverageRate: true, category: true } },
              // Who decided / who paid — the ledger's "By" column and the claim's trail.
              reviewedBy: { select: { name: true } },
              paidBy: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      prisma.guaranteedBenefit.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
      prisma.benefitCatalogItem.findMany({ orderBy: { order: "asc" } }),
      prisma.poolCeiling.findMany(),
      prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
  // SUBMITTED claims are the actionable ones — they drive the tab badge and the queue.
  const claimsToReview = pendingClaims.filter((c) => c.status === "SUBMITTED").length;
  const rateBands = await prisma.medicalRateBand.findMany({ where: { tier: 1 }, orderBy: { order: "asc" } });
  // Medical policy terms (spec 027) — the insurance contract's own dates, and the per-cycle
  // charges that reconcile a committed premium against the pools it draws from.
  const policyYears = await prisma.medicalPolicyYear.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { commitments: true } } },
  });
  const cycleCharges = await prisma.medicalCycleCharge.findMany({
    where: { commitmentId: { in: medicalCommitments.map((m) => m.id) } },
    include: { planYear: { select: { name: true, status: true } } },
    orderBy: { planYear: { startDate: "asc" } },
  });
  const chargesByCommitment = new Map<string, typeof cycleCharges>();
  for (const c of cycleCharges) {
    const list = chargesByCommitment.get(c.commitmentId) ?? [];
    list.push(c);
    chargesByCommitment.set(c.commitmentId, list);
  }

  // ── Who is eligible for medical this cycle, and who hasn't committed ──────
  // The commitments list can only ever show people who acted; chasing the ones who
  // haven't is the other half of the job, and a missing date of birth blocks the commit
  // outright (spec 023) without anything on this screen saying so.
  const planWindow = planYearWindow(active ?? null);
  const activeEmployees = await prisma.user.findMany({
    where: { status: "ACTIVE", employmentType: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employmentType: true, startDate: true, dateOfBirth: true },
  });
  const ceilingFor = (t: EmploymentType, startDate: Date | null) =>
    poolCeilings.find(
      (c) => c.employmentType === t && c.tenureBand === (deriveTenureBand(startDate).band ?? "BAND_6MO_2Y")
    )?.amount ?? null;

  // Medical unlocks at 3 months (spec 019) and needs a known start date to be judged at all.
  const eligibleForMedical = activeEmployees.filter(
    (u) =>
      u.employmentType != null &&
      hasKnownStartDate(u.startDate) &&
      classifyEligibility(u.startDate, 3, planWindow).status !== "NOT_YET"
  );
  const committedUserIds = new Set(medicalCommitments.map((m) => m.userId));

  const notCommittedRows: NotCommittedRow[] = eligibleForMedical
    .filter((u) => !committedUserIds.has(u.id))
    .map((u) => {
      const band = deriveTenureBand(u.startDate).band;
      const ceiling = ceilingFor(u.employmentType!, u.startDate);
      return {
        id: u.id,
        name: u.name ?? "—",
        contract: `${EMPLOYMENT_TYPE_LABEL[u.employmentType!]}${band ? ` · ${TENURE_BAND_LABEL[band]}` : ""}`,
        ceiling,
        blockedReason: !u.dateOfBirth ? "no date of birth" : ceiling == null ? "no pool ceiling set" : null,
      };
    });

  // ── Medical commitment rows ──────────────────────────────────────────────
  const medicalRows: MedicalRow[] = medicalCommitments.map((m) => {
    const charges = chargesByCommitment.get(m.id) ?? [];
    const term = policyYears.find((p) => p.id === m.policyYearId);
    // One definition of "needs attention", shared with the Medical tab badge and the admin
    // home's pill — three surfaces that must never disagree about the same commitment.
    const flags = commitmentAttention(m.premium, charges);
    // What this cycle's pool actually absorbs — APPLIED charges only, with the legacy
    // fallback for a commitment that predates per-cycle charges (config.medicalCycleCharge).
    const thisCycle = active
      ? medicalCycleCharge({ premium: m.premium, cycleCharges: charges }, active.id)
      : 0;
    const cancelled = charges.filter((c) => c.status === "CANCELLED").reduce((n, c) => n + c.amount, 0);
    const dependantsById = new Map(m.user.dependants.map((d) => [d.id, d]));
    const coveredDepIds = new Set(m.coveredPeople.map((p) => p.dependantId).filter(Boolean) as string[]);
    const others = m.coveredPeople.filter((p) => p.dependantId);
    const spouses = others.filter((p) => dependantsById.get(p.dependantId!)?.kind === "SPOUSE").length;
    const children = others.length - spouses;
    const detail = [
      spouses > 0 ? "spouse" : null,
      children > 0 ? `${children} ${children === 1 ? "child" : "children"}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      id: m.id,
      userName: m.user.name ?? "—",
      coverShort: others.length > 0 ? `You +${others.length}` : "You",
      coverDetail: detail,
      premium: m.premium,
      thisCycle,
      // Premium this cycle's pool does NOT absorb and that is not written off — it is
      // charged to a later cycle. A cancelled charge is recovered from the insurer, not
      // carried, so it never counts here (spec 030).
      carriesOver: Math.max(0, m.premium - thisCycle - cancelled),
      overCharged: flags.overCharged,
      committedAt: formatDate(m.committedAt),
      termLabel: term ? `${formatDate(term.startDate)} – ${formatDate(term.endDate)}` : null,
      termEndLabel: term ? formatDate(term.endDate) : null,
      monthsInCycle: charges.find((c) => active && c.planYearId === active.id)?.overlapMonths ?? 0,
      monthsTotal: term
        ? overlapWholeMonths(
            { start: term.startDate, end: term.endDate },
            { start: term.startDate, end: term.endDate }
          )
        : charges.reduce((n, c) => n + c.overlapMonths, 0),
      cancelled: flags.coverEnded,
      frozen: flags.frozen,
      charges: charges.map((c) => ({
        id: c.id,
        cycleName: c.planYear.name,
        months: c.overlapMonths,
        amount: c.amount,
        status: c.status,
      })),
      coveredPeople: m.coveredPeople.map((p) => ({
        label: p.label,
        ageAtCommit: p.ageAtCommit,
        premiumEGP: p.premiumEGP,
      })),
      dependants: m.user.dependants.map((d) => ({
        id: d.id,
        label: `${d.kind === "SPOUSE" ? "Spouse" : "Child"}${d.name ? ` · ${d.name}` : ""}`,
        dobISO: d.dateOfBirth.toISOString(),
        covered: coveredDepIds.has(d.id),
      })),
      employeeDobISO: m.user.dateOfBirth ? m.user.dateOfBirth.toISOString() : null,
      ceiling: m.user.employmentType ? ceilingFor(m.user.employmentType, m.user.startDate) : null,
    };
  });

  // ── Claim rows: what each employee's pool looks like once their claim counts ──
  // Medical drawn from THIS cycle, per employee. Read from the charges rather than the
  // commitment list so a term committed in an earlier cycle still shows against the pool
  // it is actually drawing from.
  const medicalDrawnByUser = new Map<string, number>();
  if (active) {
    const applied = await prisma.medicalCycleCharge.findMany({
      where: { planYearId: active.id, status: "APPLIED" },
      select: { amount: true, commitment: { select: { userId: true } } },
    });
    for (const c of applied) {
      medicalDrawnByUser.set(c.commitment.userId, (medicalDrawnByUser.get(c.commitment.userId) ?? 0) + c.amount);
    }
    // Legacy commitments with no charges at all draw their whole premium (config.medicalCycleCharge).
    for (const m of medicalCommitments) {
      if ((chargesByCommitment.get(m.id) ?? []).length === 0) {
        medicalDrawnByUser.set(m.userId, (medicalDrawnByUser.get(m.userId) ?? 0) + m.premium);
      }
    }
  }
  // Every non-rejected claim holds allowance (lib/benefits/claims.tracker) — a rejected one
  // releases it.
  const claimedByUser = new Map<string, number>();
  for (const c of pendingClaims) {
    if (c.status === "REJECTED") continue;
    claimedByUser.set(c.userId, (claimedByUser.get(c.userId) ?? 0) + c.amount);
  }

  const poolFor = (u: { id: string; employmentType: EmploymentType | null; startDate: Date | null }) => {
    if (!u.employmentType) return null;
    const ceilingAmount = ceilingFor(u.employmentType, u.startDate);
    if (ceilingAmount == null) return null;
    const fraction = poolCycleFraction(classifyEligibility(u.startDate, 6, planWindow), planWindow);
    const ceiling = prorate(ceilingAmount, fraction);
    const used = (medicalDrawnByUser.get(u.id) ?? 0) + (claimedByUser.get(u.id) ?? 0);
    return { ceiling, remaining: Math.max(0, ceiling - used) };
  };

  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const benefitOf = (c: (typeof pendingClaims)[number]) => ({
    name: c.guaranteedBenefit?.name ?? c.catalogItem?.name ?? "—",
    category: c.guaranteedBenefit?.category ?? c.catalogItem?.category ?? "",
  });

  const claimQueue: QueueRow[] = pendingClaims
    .filter((c) => c.status === "SUBMITTED")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((c) => {
      const b = benefitOf(c);
      const band = deriveTenureBand(c.user.startDate).band;
      const rate = c.catalogItem?.coverageRate ?? null;
      const share = c.fullCost != null && rate != null ? Math.round((c.fullCost * rate) / 100) : null;
      return {
        id: c.id,
        userName: c.user.name ?? "—",
        contract: c.user.employmentType
          ? `${EMPLOYMENT_TYPE_LABEL[c.user.employmentType]}${band ? ` · ${TENURE_BAND_LABEL[band]}` : ""}`
          : "—",
        benefitName: b.name,
        category: b.category,
        receipt: c.fullCost,
        coverageRate: rate,
        amount: c.amount,
        capped: share != null && share !== c.amount,
        waitingDays: Math.max(0, Math.floor((now - c.createdAt.getTime()) / DAY_MS)),
        submittedAt: formatDate(c.createdAt),
        note: c.note,
        proofHref: c.proofUrl ? `/api/claims/${c.id}/proof` : null,
        proofName: c.proofName,
        pool: poolFor(c.user),
      };
    });

  const claimLedger: LedgerRow[] = pendingClaims
    .filter((c) => c.status !== "SUBMITTED")
    .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))
    .map((c) => {
      const b = benefitOf(c);
      return {
        id: c.id,
        decidedAt: c.decidedAt ? formatDate(c.decidedAt) : "—",
        userName: c.user.name ?? "—",
        benefitName: b.name,
        category: b.category,
        amount: c.amount,
        status: c.status,
        byName: (c.status === "REIMBURSED" ? c.paidBy?.name : c.reviewedBy?.name) ?? "—",
        decisionNote: c.decisionNote,
        // The marker the manual-entry action writes on a back-filled claim; tagging it keeps
        // the ledger from implying an employee submitted something they never did.
        recordedByHr: (c.note ?? "").startsWith("Recorded by HR"),
      };
    });

  const sumOf = (status: (typeof pendingClaims)[number]["status"]) =>
    pendingClaims.filter((c) => c.status === status).reduce((n, c) => n + c.amount, 0);
  const countOf = (status: (typeof pendingClaims)[number]["status"]) =>
    pendingClaims.filter((c) => c.status === status).length;

  const claimTotals: ClaimsTotals = {
    toReviewCount: countOf("SUBMITTED"),
    toReviewAmount: sumOf("SUBMITTED"),
    approvedCount: countOf("APPROVED"),
    approvedAmount: sumOf("APPROVED"),
    reimbursedCount: countOf("REIMBURSED"),
    reimbursedAmount: sumOf("REIMBURSED"),
    committedAmount: pendingClaims.filter((c) => c.status !== "REJECTED").reduce((n, c) => n + c.amount, 0),
  };

  const ceilOf = (t: EmploymentType, b: TenureBand) =>
    poolCeilings.find((c) => c.employmentType === t && c.tenureBand === b)?.amount ?? "";

  // Per-employment-type × band amount columns for the numbers-only guaranteed grid (spec 021).
  const GB_BAND_COLS = [
    { ft: "ftBand6mo2y", pt: "ptBand6mo2y", band: "BAND_6MO_2Y" },
    { ft: "ftBand2to4y", pt: "ptBand2to4y", band: "BAND_2_4Y" },
    { ft: "ftBand4to7y", pt: "ptBand4to7y", band: "BAND_4_7Y" },
    { ft: "ftBand7to10y", pt: "ptBand7to10y", band: "BAND_7_10Y" },
  ] as const;
  const colFor = (t: EmploymentType, c: (typeof GB_BAND_COLS)[number]) => (t === "FULL_TIME" ? c.ft : c.pt);

  const eligibilityText = (b: { eligibleFullTime: boolean; eligiblePartTime: boolean }) =>
    b.eligibleFullTime && b.eligiblePartTime ? "Full-time & Part-time" : b.eligibleFullTime ? "Full-time" : b.eligiblePartTime ? "Part-time" : "No one";

  // ── Manual-entry benefit list: guaranteed + active catalog items ─────────
  const manualBenefits = [
    ...guaranteedBenefits.map((g) => ({
      value: `guaranteed:${g.id}`,
      label: `${g.name} (${eligibilityText(g)})`,
      group: "Guaranteed" as const,
    })),
    // Medical is priced automatically (age bands + proration) — a single option, no amount entered.
    { value: "medical", label: "Medical insurance (auto-priced)", group: "Medical" as const },
    // Flexible basket — exclude medical items (they're covered by the auto-priced option above).
    ...catalogItems
      .filter((c) => c.active && !c.isMedical)
      .map((c) => ({ value: `catalog:${c.id}`, label: c.name, group: "Flexible basket" as const })),
  ];

  // ── Edit forms (server-action) reused inside EditableSection editViews ───
  // Numbers-only guaranteed amounts grid (spec 021): one form per employment type, listing every
  // benefit eligible for that type; cells write the ft*/pt* columns via `gb_<id>_<column>`.
  const guaranteedEditTable = (t: EmploymentType) => {
    const rows = guaranteedBenefits.filter((g) => isEligibleFor(t, g));
    return (
      <ToastForm action={updateGuaranteedAmounts} savedMessage={`${EMPLOYMENT_TYPE_LABEL[t]} amounts saved`} className="mt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{EMPLOYMENT_TYPE_LABEL[t]}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-6 font-medium">Benefit</th>
                {GB_BAND_COLS.map((c) => (
                  <th key={c.band} className="py-2 pr-4 font-medium">{TENURE_BAND_LABEL[c.band]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-3 text-xs text-muted">No {EMPLOYMENT_TYPE_LABEL[t].toLowerCase()} benefits — tick eligibility in the Catalogue.</td></tr>
              ) : rows.map((g) => (
                <tr key={g.id} className="border-t border-line align-top">
                  <td className="py-2 pr-6">
                    <div className="text-ink">{g.name}</div>
                    {g.note ? <div className="text-xs text-muted">{g.note}</div> : null}
                  </td>
                  {isSalaryDriven(g) ? (
                    <td colSpan={4} className="py-2 text-xs text-muted">Salary-driven — 1 month salary (not a fixed amount)</td>
                  ) : (
                    GB_BAND_COLS.map((c) => {
                      const col = colFor(t, c);
                      const v = g[col] ?? "";
                      return (
                        <td key={c.band} className="py-2 pr-4">
                          <input
                            key={`${g.id}_${col}-${v}`}
                            type="number"
                            name={`gb_${g.id}_${col}`}
                            defaultValue={v}
                            min={0}
                            step={500}
                            className="w-24 rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums focus:border-navy-500 focus:outline-none"
                          />
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="mt-3 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
          Save {EMPLOYMENT_TYPE_LABEL[t].toLowerCase()} amounts
        </button>
      </ToastForm>
    );
  };

  // Flexible fixed allowances (spec 028 — travel allowance): pool-funded entitlements paid at a
  // flat per-band amount. ONE table, not one per employment type — full- and part-timers share the
  // same figures, and their differing pool ceilings do the rest.
  const allowanceItems = catalogItems.filter((c) => isFixedAllowance(c));
  const FLEX_BAND_COLS = [
    { col: "band6mo2y", band: "BAND_6MO_2Y" },
    { col: "band2to4y", band: "BAND_2_4Y" },
    { col: "band4to7y", band: "BAND_4_7Y" },
    { col: "band7to10y", band: "BAND_7_10Y" },
  ] as const;

  const allowanceReadTable = (
    <div className="mt-2 overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-6 font-medium">Benefit</th>
            {FLEX_BAND_COLS.map((c) => (
              <th key={c.band} className="py-2 pr-4 font-medium">{TENURE_BAND_LABEL[c.band]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allowanceItems.length === 0 ? (
            <tr><td colSpan={5} className="py-3 text-xs text-muted">No fixed allowances configured.</td></tr>
          ) : allowanceItems.map((item) => (
            <tr key={item.id} className="border-t border-line align-top">
              <td className="py-2 pr-6 text-ink">{item.name}</td>
              {FLEX_BAND_COLS.map((c) => (
                <td key={c.band} className="py-2 pr-4 tabular-nums text-ink">
                  {item[c.col] != null ? egp(item[c.col]!) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const allowanceEditTable = (
    <ToastForm action={updateFlexAllowanceAmounts} savedMessage="Allowance amounts saved" className="mt-3">
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-6 font-medium">Benefit</th>
              {FLEX_BAND_COLS.map((c) => (
                <th key={c.band} className="py-2 pr-4 font-medium">{TENURE_BAND_LABEL[c.band]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allowanceItems.length === 0 ? (
              <tr><td colSpan={5} className="py-3 text-xs text-muted">No fixed allowances configured.</td></tr>
            ) : allowanceItems.map((item) => (
              <tr key={item.id} className="border-t border-line align-top">
                <td className="py-2 pr-6 text-ink">{item.name}</td>
                {FLEX_BAND_COLS.map((c) => {
                  const v = item[c.col] ?? "";
                  return (
                    <td key={c.band} className="py-2 pr-4">
                      <input
                        key={`${item.id}_${c.col}-${v}`}
                        type="number"
                        name={`fa_${item.id}_${c.col}`}
                        defaultValue={v}
                        min={0}
                        step={500}
                        className="w-24 rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums focus:border-navy-500 focus:outline-none"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="mt-3 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
        Save allowance amounts
      </button>
    </ToastForm>
  );

  // Read-only guaranteed table.
  const guaranteedReadTable = (t: EmploymentType) => {
    const rows = guaranteedBenefits.filter((g) => isEligibleFor(t, g));
    return (
      <div className="mt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{EMPLOYMENT_TYPE_LABEL[t]}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-6 font-medium">Benefit</th>
                {GB_BAND_COLS.map((c) => (
                  <th key={c.band} className="py-2 pr-4 font-medium text-right">{TENURE_BAND_LABEL[c.band]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-3 text-xs text-muted">No {EMPLOYMENT_TYPE_LABEL[t].toLowerCase()} benefits.</td></tr>
              ) : rows.map((g) => (
                <tr key={g.id} className="border-t border-line align-top">
                  <td className="py-2 pr-6">
                    <div className="text-ink">{g.name}</div>
                    {g.note ? <div className="text-xs text-muted">{g.note}</div> : null}
                  </td>
                  {isSalaryDriven(g) ? (
                    <td colSpan={4} className="py-2 text-xs text-muted">Salary-driven</td>
                  ) : (
                    GB_BAND_COLS.map((c) => {
                      const v = g[colFor(t, c)];
                      return (
                        <td key={c.band} className="py-2 pr-4 text-right tabular-nums text-ink">
                          {v != null ? formatNumber(v) : "—"}
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const medicalNeedingAttention = medicalRows.filter((r) => r.overCharged > 0 || r.cancelled || r.frozen).length;

  // ── Individual grants (spec 036) — Super-User exceptions, shown on the Amounts tab ──
  // Guarded so a pre-migration DB (no grant table yet) just hides the panel.
  let grantsBenefits: GrantsBenefit[] | null = null;
  if (isSuper && active) {
    try {
      const [grants, allActive, cycleReleases] = await Promise.all([
        prisma.guaranteedBenefitGrant.findMany({
          where: { planYearId: active.id },
          include: {
            user: { select: { name: true, employmentType: true, department: true } },
            grantedBy: { select: { name: true } },
          },
          orderBy: { grantedAt: "desc" },
        }),
        prisma.user.findMany({
          where: { status: "ACTIVE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, employmentType: true, startDate: true },
        }),
        prisma.benefitRelease.findMany({
          where: { planYearId: active.id },
          select: { userId: true, guaranteedBenefitId: true },
        }),
      ]);
      const grantable = guaranteedBenefits.filter((g) => !isSalaryDriven(g));
      const reasonAndPrefill = (
        u: (typeof allActive)[number],
        g: (typeof grantable)[number]
      ): { reason: string; prefill: number | null } => {
        if (!u.employmentType) return { reason: "no employment type", prefill: null };
        if (!isEligibleFor(u.employmentType, g)) {
          return { reason: `not eligible (${EMPLOYMENT_TYPE_LABEL[u.employmentType].toLowerCase()})`, prefill: null };
        }
        const band = deriveTenureBand(u.startDate).band;
        if (!band) return { reason: !u.startDate ? "no hire date" : "< 6 months — no band yet", prefill: null };
        const amt = amountForBand(u.employmentType, band, g);
        if (amt == null) return { reason: `no ${u.employmentType === "FULL_TIME" ? "full-time" : "part-time"} amount set`, prefill: null };
        return { reason: "", prefill: amt };
      };
      grantsBenefits = grantable.map((g) => {
        const gGrants = grants.filter((x) => x.guaranteedBenefitId === g.id);
        const grantedIds = new Set(gGrants.map((x) => x.userId));
        return {
          id: g.id,
          name: `${g.name} — ${eligibilityText(g)}`,
          grants: gGrants.map((x) => {
            const u = allActive.find((a) => a.id === x.userId);
            const rp = u ? reasonAndPrefill(u, g) : { reason: "", prefill: null };
            return {
              id: x.id,
              userName: x.user.name,
              userMeta: [x.user.employmentType ? EMPLOYMENT_TYPE_LABEL[x.user.employmentType] : null, x.user.department]
                .filter(Boolean)
                .join(" · ") || "—",
              reason: rp.reason,
              amount: x.amount,
              grantedBy: x.grantedBy?.name ?? "—",
              grantedAtLabel: formatDate(x.grantedAt),
              // Locked once a non-rejected claim OR a release exists on the grant (FR-007).
              locked:
                pendingClaims.some(
                  (c) => c.userId === x.userId && c.guaranteedBenefitId === g.id && c.status !== "REJECTED"
                ) || cycleReleases.some((r) => r.userId === x.userId && r.guaranteedBenefitId === g.id),
            };
          }),
          candidates: allActive
            .filter((u) => !grantedIds.has(u.id))
            .map((u) => ({ id: u.id, name: u.name, ...reasonAndPrefill(u, g) })),
        };
      });
    } catch {
      grantsBenefits = null;
    }
  }

  // ── Tab 1: Medical commitments ──────────────────────────────────────────
  // Management view (mockup signed off 2026-08-16): a counts-first rail, one line per
  // person, and the per-cycle split behind the row you open. Every figure and wording the
  // old always-expanded list carried is kept — see MedicalCommitmentsPanel.
  const medicalPanel = (
    <MedicalCommitmentsPanel
      rows={medicalRows}
      notCommitted={notCommittedRows}
      eligibleCount={eligibleForMedical.length}
      planYearId={active?.id ?? null}
      planYearName={active?.name ?? null}
      exportHref={active ? `/api/admin/benefits/export?planYearId=${active.id}` : null}
      rateBands={rateBands.map((b) => ({
        tier: b.tier,
        minAge: b.minAge,
        maxAge: b.maxAge,
        annualPremium: Number(b.annualPremium),
      }))}
    />
  );

  // ── Tab 2: Claims — review queue + ledger ───────────────────────────────
  const submissionsPanel = (
    <ClaimsPanel
      queue={claimQueue}
      ledger={claimLedger}
      totals={claimTotals}
      recordEntry={
        active ? (
          <ManualReleaseModal
            employees={employees}
            benefits={manualBenefits}
            triggerLabel="＋ Record entry…"
            triggerClassName="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-semibold text-navy-900 hover:bg-gold-600"
          />
        ) : null
      }
    />
  );

  // ── Tab 2: Benefits Catalogue (unified inline grid) ─────────────────────
  const catalogueRows: CatalogueGridRow[] = [
    ...guaranteedBenefits.map((g): CatalogueGridRow => ({
      kind: "guaranteed", id: g.id, name: g.name, note: g.note ?? "",
      typeLabel: "Guaranteed", scope: "",
      category: g.category ?? "", claimType: g.claimType,
      eligibleFullTime: g.eligibleFullTime, eligiblePartTime: g.eligiblePartTime,
      coverage: isSalaryDriven(g) ? "Salary" : "Fixed", coverageEditable: false, coverageRate: 0,
      active: true, statusEditable: false, order: g.order,
    })),
    ...catalogItems.map((c): CatalogueGridRow => ({
      kind: "catalog", id: c.id, name: c.name, note: c.description ?? "",
      typeLabel: c.isMedical ? "Medical" : "Flexible",
      scope: c.isMedical ? (c.medicalScope === "FAMILY" ? "Family" : "Personal") : "",
      category: c.category ?? "", claimType: c.claimType,
      eligibleFullTime: c.eligibleFullTime, eligiblePartTime: c.eligiblePartTime,
      coverage: c.isMedical ? "100%" : `${c.coverageRate}%`, coverageEditable: !c.isMedical, coverageRate: c.coverageRate,
      active: c.active, statusEditable: true, order: c.order,
    })),
  ];
  // Category suggestions: the aligned set (spec 021) plus anything already in use.
  const KNOWN_CATEGORIES = [
    "Health & protection", "Wellbeing", "Life & family", "Personal growth",
    "Lifestyle & flexibility", "Allowances", "Financial support",
  ];
  const catalogueCategories = Array.from(
    new Set([...KNOWN_CATEGORIES, ...catalogueRows.map((r) => r.category).filter(Boolean)])
  ).sort();

  const cataloguePanel = (
    <CatalogueGrid
      rows={catalogueRows}
      categories={catalogueCategories}
      toolbarExtra={<AddCatalogItemModal categories={catalogueCategories} />}
    />
  );

  // ── Tab 3: Amounts ──────────────────────────────────────────────────────
  const ceilingsRead = (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-6 font-medium">Tenure band</th>
            <th className="py-2 pr-6 font-medium text-right">Full-time</th>
            <th className="py-2 pr-6 font-medium text-right">Part-time</th>
          </tr>
        </thead>
        <tbody>
          {TENURE_BAND_ORDER.map((b) => (
            <tr key={b} className="border-t border-line">
              <td className="py-2 pr-6 text-ink">{TENURE_BAND_LABEL[b]}</td>
              <td className="py-2 pr-6 text-right tabular-nums text-ink">{ceilOf("FULL_TIME", b) === "" ? "—" : egp(ceilOf("FULL_TIME", b) as number)}</td>
              <td className="py-2 pr-6 text-right tabular-nums text-ink">{ceilOf("PART_TIME", b) === "" ? "—" : egp(ceilOf("PART_TIME", b) as number)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const ceilingsEdit = (
    <ToastForm action={updatePoolCeilings} savedMessage="Pool ceilings saved">
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-6 font-medium">Tenure band</th>
              <th className="py-2 pr-6 font-medium">Full-time</th>
              <th className="py-2 pr-6 font-medium">Part-time</th>
            </tr>
          </thead>
          <tbody>
            {TENURE_BAND_ORDER.map((b) => (
              <tr key={b} className="border-t border-line">
                <td className="py-2 pr-6 text-ink">{TENURE_BAND_LABEL[b]}</td>
                {(["FULL_TIME", "PART_TIME"] as EmploymentType[]).map((t) => {
                  const v = ceilOf(t, b);
                  return (
                    <td key={t} className="py-2 pr-6">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted">EGP</span>
                        <input
                          key={`${t}_${b}-${v}`}
                          type="number"
                          name={`ceil_${t}_${b}`}
                          defaultValue={v}
                          min={0}
                          step={1000}
                          className="w-32 rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums focus:border-navy-500 focus:outline-none"
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="mt-4 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Save ceilings</button>
    </ToastForm>
  );

  // Age-banded rate card (spec 023). Admin keeps the operator's exact two-decimal figures.
  // The rate card keeps the operator's exact figures to the cent (spec 023).
  const fmt2 = formatEGP2;
  const bandLabel = (b: { minAge: number; maxAge: number | null }) => `${b.minAge}–${b.maxAge ?? "+"}`;

  const rateCardRead = (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-6 font-medium">Age band</th>
            <th className="py-2 pr-6 font-medium text-right">Annual premium</th>
          </tr>
        </thead>
        <tbody>
          {rateBands.length === 0 ? (
            <tr className="border-t border-line text-muted"><td className="py-2 pr-6" colSpan={2}>—</td></tr>
          ) : (
            rateBands.map((b) => (
              <tr key={b.id} className="border-t border-line text-ink">
                <td className="py-1.5 pr-6">{bandLabel(b)}</td>
                <td className="py-1.5 pr-6 text-right tabular-nums">{fmt2(b.annualPremium)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const rateCardEdit = (
    <div className="space-y-1.5">
      {rateBands.map((b) => (
        <ToastForm key={b.id} action={updateMedicalRateBand} savedMessage={`Rate card · ${bandLabel(b)} saved`} className="flex items-center gap-2">
          <input type="hidden" name="id" value={b.id} />
          <span className="w-24 text-xs text-muted">{bandLabel(b)}</span>
          <input
            name="annualPremium"
            type="text"
            inputMode="decimal"
            defaultValue={Number(b.annualPremium).toFixed(2)}
            className="w-32 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none"
          />
          <button className="rounded-lg border border-line px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50">Save</button>
        </ToastForm>
      ))}
      <p className="pt-1 text-[11px] text-muted">Tier 1 · operator figures (two decimals). Someone over 75 is priced at the 70–75 band and flagged for HR.</p>
    </div>
  );

  const amountsPanel = (
    <div className="space-y-6">
      <EditableSection
        title="Pool ceilings"
        description="The annual pool (EGP) each employee can allocate, by employment type and tenure band — the maximum company contribution, and the basis for the 50% single-benefit cap."
        readView={ceilingsRead}
        editView={ceilingsEdit}
      />
      <EditableSection
        title="Guaranteed amounts"
        description="Fixed entitlements by tenure band, per employment type — just the numbers. Who's eligible and how it's claimed is set on the Catalogue tab. Loans are salary-driven."
        readView={<>{guaranteedReadTable("FULL_TIME")}<div className="mt-4">{guaranteedReadTable("PART_TIME")}</div></>}
        editView={<>{guaranteedEditTable("FULL_TIME")}<div className="mt-6">{guaranteedEditTable("PART_TIME")}</div></>}
      />
      <EditableSection
        title="Flexible fixed allowances"
        description="Pool-funded entitlements paid at a flat amount for the employee's tenure band — requested in full, no receipt. One set of figures for full- and part-timers alike; their pool ceilings already differ. Amounts prorate with the plan-year cycle."
        readView={allowanceReadTable}
        editView={allowanceEditTable}
      />
      <EditableSection
        title="Medical rate card"
        description="Annual premiums (EGP) used to price medical cover. Medical is exempt from the 50% cap but never exceeds the pool ceiling."
        readView={rateCardRead}
        editView={rateCardEdit}
      />
    </div>
  );

  // ── Tab: Exceptional releases (2026-08-18) ──────────────────────────────
  // Everything paid OUTSIDE an employee's own request: the bulk release sheet
  // (spec 013 — payroll releases without a request) and, for Super Users, the
  // per-person grants (spec 036) that make a blocked person requestable.
  const releaseSheet = active ? await buildReleaseSheet(active) : null;
  const exceptionalPanel = (
    <div className="space-y-6">
      <section>
        <h2 className="font-serif text-lg text-ink">Release Guaranteed Benefit</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Mark employees released without a request — a payroll record, not the claim flow —
          and download the sheet. Salary is never shown here. Someone who already claimed a
          benefit this cycle can&apos;t be released it on top.
        </p>
        {active && releaseSheet ? (
          <ReleaseManager
            benefits={releaseSheet.benefits}
            rowsByBenefit={releaseSheet.rowsByBenefit}
            planYearName={active.name}
          />
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            No open plan year. Open one via <strong>Plan year</strong> to release allowances.
          </p>
        )}
      </section>
      {/* Spec 036: Super-User-only per-person exceptions. */}
      {grantsBenefits && active ? (
        <BenefitGrantsPanel benefits={grantsBenefits} planYearName={active.name} />
      ) : null}
    </div>
  );

  return (
    <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
      <BackLink href="/admin" label="Admin" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Benefits</p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Benefits Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/admin/benefits/report"
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            Reporting
          </a>
          <a
            href="/benefits/policy"
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            Policy page
          </a>
          <PlanYearDialog
            planYears={planYears.map((p) => ({
              id: p.id, name: p.name, status: p.status,
              startDate: p.startDate, endDate: p.endDate,
              flexCapEnabled: p.flexCapEnabled,
              flexCapChangedAt: p.flexCapChangedAt,
              flexCapChangedByName: p.flexCapChangedBy?.name ?? null,
            }))}
            activeName={active?.name}
          />
          <PolicyYearDialog
            policyYears={policyYears.map((p) => ({
              id: p.id, name: p.name, status: p.status,
              startDate: p.startDate, endDate: p.endDate,
              commitmentCount: p._count.commitments,
            }))}
          />
        </div>
      </div>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {/* Proration window (spec 019): show the active year's dates, or warn if unset. */}
      {active ? (
        active.startDate && active.endDate ? (
          <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">
            Proration window · <span className="font-semibold">{formatDate(active.startDate)} → {formatDate(active.endDate)}</span> · the flexible pool &amp; Professional development scale to this window&rsquo;s length; medical is prorated for mid-cycle joiners.
          </p>
        ) : (
          <p className="mt-4 rounded-lg border border-gold-500 bg-gold-100 px-4 py-3 text-sm text-gold-800">
            <strong>Proration off</strong> — “{active.name}” has no start/end dates, so full annual amounts apply to everyone. Set dates via <strong>Plan year</strong> to enable proration.
          </p>
        )
      ) : null}

      <AdminBenefitsTabs
        tabs={[
          {
            id: "submissions",
            label: "Claims",
            badge: claimsToReview,
            // Non-table tabs get their own scroll region so the pinned page never scrolls.
            node: <div className="md:min-h-0 md:flex-1 md:overflow-auto">{submissionsPanel}</div>,
          },
          {
            id: "medical",
            label: "Medical",
            // Red, not gold: this badge counts money that is wrong, not people waiting.
            badge: medicalNeedingAttention,
            badgeTone: "bad",
            node: <div className="md:min-h-0 md:flex-1 md:overflow-auto">{medicalPanel}</div>,
          },
          {
            id: "exceptional",
            label: "Exceptional releases",
            node: <div className="md:min-h-0 md:flex-1 md:overflow-auto">{exceptionalPanel}</div>,
          },
          { id: "catalogue", label: "Benefits Catalogue", node: cataloguePanel },
          { id: "amounts", label: "Amounts", node: <div className="md:min-h-0 md:flex-1 md:overflow-auto">{amountsPanel}</div> },
        ]}
      />
    </div>
  );
}
