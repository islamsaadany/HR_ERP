import React from "react";
import { requireAdmin } from "@/lib/roles";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { prisma } from "@/lib/prisma";
import { formatDate, EMPLOYMENT_TYPE_LABEL, TENURE_BAND_LABEL, TENURE_BAND_ORDER, formatEGP as egp, formatEGP2, formatNumber } from "@/lib/labels";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_CLASS } from "@/lib/benefits/claims";
import { BackLink } from "@/components/admin/BackLink";
import type { EmploymentType, TenureBand } from "@prisma/client";
import {
  editMedicalCommitment,
  removeMedicalCommitment,
  updateMedicalRateBand,
  approveClaim,
  rejectClaim,
} from "./actions";
import {
  updatePoolCeilings,
  updateGuaranteedAmounts,
  updateFlexAllowanceAmounts,
} from "./config-actions";
import { isSalaryDriven, isEligibleFor, isFixedAllowance } from "@/lib/benefits/config";
import { PlanYearDialog } from "@/components/admin/PlanYearDialog";
import { PolicyYearDialog } from "@/components/admin/PolicyYearDialog";
import { AdminBenefitsTabs } from "@/components/admin/AdminBenefitsTabs";
import { EditableSection } from "@/components/admin/EditableSection";
import { ToastForm } from "@/components/admin/ToastForm";
import { ManualReleaseModal } from "@/components/admin/ManualReleaseModal";
import { CatalogueGrid, type CatalogueGridRow } from "@/components/admin/CatalogueGrid";
import { AddCatalogItemModal } from "@/components/admin/AddCatalogItemModal";

export const dynamic = "force-dynamic";

export default async function AdminBenefitsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
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
                  dependants: { select: { id: true, name: true, kind: true }, orderBy: { dateOfBirth: "asc" } },
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
              user: { select: { name: true } },
              guaranteedBenefit: { select: { name: true } },
              // coverageRate is needed to show HR how a clamped claim was worked out.
              catalogItem: { select: { name: true, coverageRate: true } },
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
  // SUBMITTED claims are the actionable ones (drive the tab badge); show them first.
  const claimsToReview = pendingClaims.filter((c) => c.status === "SUBMITTED").length;
  const sortedClaims = [...pendingClaims].sort(
    (a, b) => (a.status === "SUBMITTED" ? 0 : 1) - (b.status === "SUBMITTED" ? 0 : 1)
  );
  const rateBands = await prisma.medicalRateBand.findMany({ where: { tier: 1 }, orderBy: { order: "asc" } });
  // Medical policy terms (spec 027) — the insurance contract's own dates, and the per-cycle
  // charges that reconcile a committed premium against the pools it draws from.
  const policyYears = await prisma.medicalPolicyYear.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { commitments: true } } },
  });
  const cycleCharges = await prisma.medicalCycleCharge.findMany({
    where: { commitmentId: { in: medicalCommitments.map((m) => m.id) } },
    include: { planYear: { select: { name: true } } },
    orderBy: { planYear: { startDate: "asc" } },
  });
  const chargesByCommitment = new Map<string, typeof cycleCharges>();
  for (const c of cycleCharges) {
    const list = chargesByCommitment.get(c.commitmentId) ?? [];
    list.push(c);
    chargesByCommitment.set(c.commitmentId, list);
  }
  const CHARGE_STATUS_LABEL = { APPLIED: "Applied", SCHEDULED: "On cycle open", CANCELLED: "Not charged" } as const;
  const CHARGE_STATUS_CLASS = {
    APPLIED: "bg-green-50 text-green-700 border-green-200",
    SCHEDULED: "bg-navy-50 text-navy-700 border-navy-100",
    CANCELLED: "bg-paper text-muted border-line",
  } as const;

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

  // ── Tab 1: Submissions & Claims ─────────────────────────────────────────
  const submissionsPanel = (
    <div className="space-y-6">
      {/* Claims to review */}
      <section className="rounded-xl border border-line bg-surface p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink">Claims {claimsToReview ? `· ${claimsToReview} to review` : ""}</h2>
          {/* Recording a past claim is an exception (HR back-filling a claim paid outside the
              app), so it sits as a compact secondary action here rather than a full card. */}
          {active ? (
            <ManualReleaseModal
              employees={employees}
              benefits={manualBenefits}
              triggerLabel="＋ Record entry…"
              triggerClassName="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-semibold text-navy-900 hover:bg-gold-600"
            />
          ) : null}
        </div>
        {sortedClaims.length === 0 ? (
          <p className="text-sm text-muted">No claims yet.</p>
        ) : (
          <ul className="space-y-3">
            {sortedClaims.map((c) => (
              <li key={c.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-ink">{c.user.name}</span>
                    <span className="ml-2 text-sm text-muted">
                      {c.guaranteedBenefit?.name ?? c.catalogItem?.name} · <span className="tabular-nums">{egp(c.amount)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + CLAIM_STATUS_CLASS[c.status]}>
                      {CLAIM_STATUS_LABEL[c.status]}
                    </span>
                    <span className="text-xs text-muted">{formatDate(c.createdAt)}</span>
                  </div>
                </div>
                {/* The covered amount is no longer always `receipt × coverage rate` — the
                    50%-per-benefit cap clamps it. Without the receipt value, a clamped claim
                    reads as an unexplained number next to a larger proof, so show the working. */}
                {c.fullCost != null && c.catalogItem ? (
                  <p className="mt-1 text-xs text-muted">
                    Receipt <span className="tabular-nums text-ink">{egp(c.fullCost)}</span>
                    {" · "}covers {c.catalogItem.coverageRate}% ={" "}
                    <span className="tabular-nums">{egp(Math.round((c.fullCost * c.catalogItem.coverageRate) / 100))}</span>
                    {Math.round((c.fullCost * c.catalogItem.coverageRate) / 100) !== c.amount ? (
                      <>
                        {" · "}
                        <span className="font-semibold text-gold-700">
                          capped to {egp(c.amount)} by the 50% benefit cap
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                {c.note ? <p className="mt-1 text-sm text-ink">“{c.note}”</p> : null}
                {c.decisionNote ? <p className="mt-1 text-xs text-red-600">Rejected: {c.decisionNote}</p> : null}
                {c.proofUrl ? (
                  <a href={`/api/claims/${c.id}/proof`} target="_blank" rel="noopener" className="mt-1 inline-block text-sm text-navy-600 underline">
                    {c.proofName ?? "View proof"}
                  </a>
                ) : null}
                {c.status === "SUBMITTED" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={approveClaim}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-700">Approve</button>
                    </form>
                    <details>
                      <summary className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50">Reject</summary>
                      <form action={rejectClaim} className="mt-2 flex items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="reason" placeholder="Reason (optional)" className="rounded-lg border border-line px-3 py-1.5 text-sm" />
                        <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-red-600 hover:border-red-300">Confirm reject</button>
                      </form>
                    </details>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Submissions */}
      <section className="rounded-xl border border-line bg-surface p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink">Medical commitments {active ? `· ${active.name}` : ""}</h2>
          {active ? (
            <a
              href={`/api/admin/benefits/export?planYearId=${active.id}`}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
            >
              Export CSV
            </a>
          ) : null}
        </div>
        <p className="mb-3 text-xs text-muted">
          Medical is the one committed benefit — locked to the employee after they commit. Edit dependants
          (recomputes the premium, capped at their pool) or remove a commitment so they can re-commit.
          Flexible benefits are claimed directly; review those claims below.
        </p>
        {medicalCommitments.length === 0 ? (
          <p className="text-sm text-muted">No medical commitments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-4 font-medium">Employee</th>
                  <th className="py-2 pr-4 font-medium">Cover</th>
                  <th className="py-2 pr-4 font-medium">Premium</th>
                  <th className="py-2 pr-4 font-medium">Committed</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {medicalCommitments.map((m) => {
                  // Covered people from the commit snapshot (spec 023); the employee is the first line.
                  const others = m.coveredPeople.filter((p) => p.dependantId).map((p) => p.label);
                  const coveredDepIds = new Set(m.coveredPeople.map((p) => p.dependantId).filter(Boolean) as string[]);
                  const charges = chargesByCommitment.get(m.id) ?? [];
                  const chargeTotal = charges.reduce((n, c) => n + c.amount, 0);
                  const term = policyYears.find((p) => p.id === m.policyYearId);
                  // A term whose dates changed after this was split (FR-015): its charges were
                  // calculated against the old window, so the months no longer describe the term.
                  const termMonths = charges.reduce((n, c) => n + c.overlapMonths, 0);
                  const stale = !!term && charges.length > 0 && termMonths > 0
                    && Math.round((term.endDate.getTime() - term.startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4)) !== termMonths;
                  return (
                    <React.Fragment key={m.id}>
                    <tr className="border-b border-line align-top last:border-0">
                      <td className="py-2 pr-4 text-ink">{m.user.name}</td>
                      <td className="py-2 pr-4 text-muted">You{others.length ? " + " + others.join(" + ") : ""}</td>
                      <td className="py-2 pr-4 tabular-nums text-ink">
                        {egp(m.premium)}
                        {term ? <div className="text-[11px] text-muted">{formatDate(term.startDate)} – {formatDate(term.endDate)}</div> : null}
                      </td>
                      <td className="py-2 pr-4 text-muted">{formatDate(m.committedAt)}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap items-end justify-end gap-2">
                          <form action={editMedicalCommitment} className="flex flex-wrap items-end gap-1.5">
                            <input type="hidden" name="id" value={m.id} />
                            {m.user.dependants.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {m.user.dependants.map((d) => (
                                  <label htmlFor={"adminbenefits-dependantIds"} key={d.id} className="flex items-center gap-1 text-xs text-muted">
                                    <input id={"adminbenefits-dependantIds"} type="checkbox" name="dependantIds" value={d.id} defaultChecked={coveredDepIds.has(d.id)} className="h-4 w-4" />
                                    {d.kind === "SPOUSE" ? "Spouse" : "Child"}{d.name ? ` · ${d.name}` : ""}
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted">No dependants on file</span>
                            )}
                            <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-navy-50">Re-price</button>
                          </form>
                          <form action={removeMedicalCommitment}>
                            <input type="hidden" name="id" value={m.id} />
                            <ConfirmSubmitButton message={`Remove ${m.user.name}’s medical commitment? Their premium stops counting against their pool and they can commit again while the plan year is open.`} className="text-sm font-medium text-muted hover:text-red-600">Remove</ConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                    {/* Per-cycle breakdown (spec 027). Sits BENEATH the commitment rather than
                        replacing anything, so every figure HR reads today stays where it was.
                        The total is shown deliberately: a split that fails to reconcile to the
                        committed premium is a bug, and printing it is how that surfaces. */}
                    {charges.length > 0 ? (
                      <tr key={`${m.id}-charges`} className="border-b border-line last:border-0">
                        <td colSpan={5} className="pb-3">
                          <div className="rounded-lg border border-line bg-paper p-3">
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Charged to</p>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left uppercase text-muted">
                                  <th className="py-1 pr-4 font-medium">Benefits cycle</th>
                                  <th className="py-1 pr-4 text-right font-medium">Months</th>
                                  <th className="py-1 pr-4 text-right font-medium">Charge</th>
                                  <th className="py-1 font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {charges.map((c) => (
                                  <tr key={c.id} className="border-t border-line">
                                    <td className="py-1 pr-4 text-ink">{c.planYear.name}</td>
                                    <td className="py-1 pr-4 text-right tabular-nums text-muted">{c.overlapMonths}</td>
                                    <td className="py-1 pr-4 text-right tabular-nums text-ink">{egp(c.amount)}</td>
                                    <td className="py-1">
                                      <span className={"rounded-full border px-2 py-0.5 text-[10px] font-bold " + CHARGE_STATUS_CLASS[c.status]}>
                                        {CHARGE_STATUS_LABEL[c.status]}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                                <tr className="border-t border-line font-semibold">
                                  <td className="py-1 pr-4 text-ink">Total</td>
                                  <td className="py-1 pr-4 text-right tabular-nums text-muted">
                                    {charges.reduce((n, c) => n + c.overlapMonths, 0)}
                                  </td>
                                  <td className={"py-1 pr-4 text-right tabular-nums " + (chargeTotal === m.premium ? "text-ink" : "text-red-600")}>
                                    {egp(chargeTotal)}
                                  </td>
                                  <td className="py-1 text-[10px] text-muted">
                                    {chargeTotal === m.premium ? "reconciles" : "does NOT match the premium"}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                            {charges.some((c) => c.status === "CANCELLED") ? (
                              <p className="mt-2 rounded-lg border border-gold-300 bg-gold-50 px-2.5 py-1.5 text-[11px] text-gold-800">
                                <strong className="text-navy-800">Cover ended before that cycle.</strong> The charge was
                                never applied to a pool, and the premium paid in advance for cover after the leave date is
                                recovered from the insurer — nothing is owed and nothing is written off.
                                {term ? ` Recoverable to ${formatDate(term.endDate)}, starting from the leave date — which may sit inside an already-applied charge above.` : ""}
                              </p>
                            ) : null}
                            {stale ? (
                              <p className="mt-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-muted">
                                This was split under an earlier version of the policy term. Its charges were not
                                recalculated — changing a term never rewrites money already reconciled.
                              </p>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
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
            href="/admin/benefits/release"
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            Release a benefit
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
            label: "Submissions & Claims",
            badge: claimsToReview,
            // Non-table tabs get their own scroll region so the pinned page never scrolls.
            node: <div className="md:min-h-0 md:flex-1 md:overflow-auto">{submissionsPanel}</div>,
          },
          { id: "catalogue", label: "Benefits Catalogue", node: cataloguePanel },
          { id: "amounts", label: "Amounts", node: <div className="md:min-h-0 md:flex-1 md:overflow-auto">{amountsPanel}</div> },
        ]}
      />
    </div>
  );
}
